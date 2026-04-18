import { PDFParse } from "pdf-parse";

import { parseMcqBlocks } from "../helper/exercise-mcq-parser.js";
import { postOpenAiChatCompletion } from "../helper/openai.helper.js";

const getModel = () =>
  process.env.EXERCISE_AI_OPENAI_MODEL ||
  process.env.LEARN_OPENAI_MODEL ||
  "gpt-4o-mini";

const getMaxPdfChars = () => {
  const n = Number.parseInt(String(process.env.EXERCISE_AI_MAX_PDF_CHARS || "12000"), 10);
  return Number.isFinite(n) && n > 1000 ? n : 12000;
};

const isGpt5Family = (model) => {
  const m = String(model || "");
  return m.includes("gpt-5") || m === "gpt-5-mini" || m === "gpt-5.4-mini";
};

export async function extractTextFromPdfBuffer(buffer) {
  if (!buffer || !Buffer.isBuffer(buffer)) {
    throw new Error("Invalid PDF buffer");
  }
  const parser = new PDFParse({ data: buffer });
  try {
    const data = await parser.getText();
    const text = String(data?.text || "").replace(/\s+/g, " ").trim();
    return text;
  } finally {
    await parser.destroy();
  }
}

function truncateForModel(text, maxChars) {
  const t = String(text || "");
  if (t.length <= maxChars) return { text: t, truncated: false };
  return {
    text: `${t.slice(0, maxChars)}\n\n[...truncated for length...]`,
    truncated: true,
  };
}

const buildSystemPrompt = (numberOfQuestions) => `You are an expert English teacher creating multiple-choice exercises.
You MUST output ONLY plain text in this exact format. No markdown, no code fences, no JSON.

Rules:
- Produce exactly ${numberOfQuestions} question blocks.
- Separate each block with ONE completely blank line (double newline).
- Each block MUST have exactly these lines in order:
  q: <question text, may include ___ for blanks>
  a: <option>
  b: <option>
  c: <option>
  d: <option>
  @: <single letter a, b, c, or d — the correct option>
- Do not add extra labels, numbering, or commentary outside this format.
- Questions must match the user's level, topic, grammar/vocabulary focus, and difficulty.
- If asked to increase difficulty across items, make later questions slightly harder.
- Options must be plausible; exactly one correct answer.`;

function buildUserPayload(mode, fields) {
  const {
    title,
    description = "",
    topic = "general",
    level = "A1",
    number_of_questions = 10,
    grammar_focus = "",
    vocabulary_focus = "",
    difficulty = "medium",
    additional_instruction = "",
    context = "",
    pdfText = "",
  } = fields;

  const lines = [
    `Mode: ${mode === "pdf" ? "Generate from PDF content" : "Generate from topic/requirements"}`,
    `Title: ${title}`,
    `Description: ${description}`,
    `Topic: ${topic}`,
    `CEFR level: ${level}`,
    `Number of questions: ${number_of_questions}`,
    `Grammar focus: ${grammar_focus || "(none)"}`,
    `Vocabulary focus: ${vocabulary_focus || "(none)"}`,
    `Difficulty: ${difficulty}`,
    `Scenario/context: ${context || "(none)"}`,
    `Additional instructions: ${additional_instruction || "(none)"}`,
  ];

  if (mode === "pdf" && pdfText) {
    lines.push("");
    lines.push("--- PDF text (base for questions) ---");
    lines.push(pdfText);
  }

  return lines.join("\n");
}

export async function generateMcqRawFromAi(mode, fields) {
  const apiKey = process.env.OPENAI_API_KEY || "";
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required for AI exercise generation.");
  }

  const numberOfQuestions = Math.min(
    50,
    Math.max(1, Number.parseInt(String(fields.number_of_questions ?? 10), 10) || 10)
  );

  const model = getModel();
  const systemPrompt = buildSystemPrompt(numberOfQuestions);
  const userContent = buildUserPayload(mode, { ...fields, number_of_questions: numberOfQuestions });

  const body = {
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ],
  };

  if (!isGpt5Family(model)) {
    body.temperature = 0.35;
  }

  const response = await postOpenAiChatCompletion({
    apiKey,
    body,
    errorMessagePrefix: "OpenAI exercise generate failed",
    maxErrorLength: 400,
    timeoutMs: Number.parseInt(process.env.EXERCISE_AI_TIMEOUT_MS || "120000", 10) || 120000,
  });

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("OpenAI returned empty content for exercise generation.");
  }

  return { rawText: content.trim(), model };
}

export async function generateAndParseMcq(mode, fields) {
  const { rawText, model } = await generateMcqRawFromAi(mode, fields);
  const { questions, errors } = parseMcqBlocks(rawText);
  return {
    rawText,
    model,
    questions,
    parseErrors: errors,
  };
}

export function preparePdfTextForAi(buffer) {
  const maxChars = getMaxPdfChars();
  return extractTextFromPdfBuffer(buffer).then((full) => {
    const { text, truncated } = truncateForModel(full, maxChars);
    if (!text.trim()) {
      throw new Error("Could not extract text from PDF (empty). Try another file.");
    }
    return { pdfText: text, truncated };
  });
}
