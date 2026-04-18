import { PDFParse } from "pdf-parse";

import { postOpenAiChatCompletion } from "../helper/openai.helper.js";

const getModel = () =>
  process.env.VOCABULARY_AI_OPENAI_MODEL ||
  process.env.EXERCISE_AI_OPENAI_MODEL ||
  process.env.LEARN_OPENAI_MODEL ||
  "gpt-4o-mini";

const isGpt5Family = (model) => {
  const m = String(model || "");
  return m.includes("gpt-5") || m === "gpt-5-mini" || m === "gpt-5.4-mini";
};

const getMaxPdfChars = () => {
  const n = Number.parseInt(String(process.env.VOCABULARY_AI_MAX_PDF_CHARS || "12000"), 10);
  return Number.isFinite(n) && n > 1000 ? n : 12000;
};

export async function extractTextFromPdfBuffer(buffer) {
  if (!buffer || !Buffer.isBuffer(buffer)) {
    throw new Error("Invalid PDF buffer");
  }
  const parser = new PDFParse({ data: buffer });
  try {
    const data = await parser.getText();
    return String(data?.text || "").replace(/\s+/g, " ").trim();
  } finally {
    await parser.destroy();
  }
}

function truncate(text, maxChars) {
  const t = String(text || "");
  if (t.length <= maxChars) return { text: t, truncated: false };
  return { text: `${t.slice(0, maxChars)}\n\n[...truncated for length...]`, truncated: true };
}

function buildSystemPrompt({ numberOfWords, includePronunciation, includeMeaning, includeExample }) {
  const requirements = [
    includeMeaning ? "meaning (Vietnamese)" : null,
    includePronunciation ? "pronunciation (IPA in /.../)" : null,
    includeExample ? "example sentence (English)" : null,
  ].filter(Boolean);

  const lineFormats = includePronunciation && includeExample
    ? `word - /IPA/ - meaning - example`
    : includePronunciation
      ? `word - /IPA/ - meaning`
      : includeExample
        ? `word - meaning - example`
        : `word - meaning`;

  return `You are an English vocabulary list generator for flashcards.
Return ONLY plain text, one vocabulary per line.
Generate exactly ${numberOfWords} lines.

Required fields: ${requirements.length ? requirements.join(", ") : "word"}.
Use one of these formats per line (prefer the most complete format possible):
- ${lineFormats}
- word | meaning

Rules:
- No numbering, no bullets, no extra commentary.
- Keep words practical and relevant to the requested topic/level.
- Avoid duplicates.
- Meanings MUST be in Vietnamese (e.g. \"lợi ích\", \"cải thiện\", \"quả táo\"). Do NOT explain meanings in English.
- If includeExample=true, examples MUST be English sentences, short and natural.
- If includeMeaning=false, still output a separator and leave meaning blank is NOT allowed; always include meaning unless explicitly false.`;
}

function buildUserPrompt(mode, input) {
  const {
    title = "",
    topic = "general",
    level = "A1",
    number_of_words = 30,
    include_pronunciation = false,
    include_example = false,
    include_meaning = true,
    additional_instruction = "",
    pdfText = "",
  } = input || {};

  const lines = [
    `Mode: ${mode === "pdf" ? "From PDF" : "From prompt"}`,
    `Title: ${title}`,
    `Topic: ${topic}`,
    `Level: ${level}`,
    `Number of words: ${number_of_words}`,
    `Include pronunciation: ${include_pronunciation}`,
    `Include meaning: ${include_meaning}`,
    `Include example: ${include_example}`,
    `Additional instruction: ${additional_instruction || "(none)"}`,
  ];

  if (mode === "pdf") {
    lines.push("");
    lines.push("--- PDF text ---");
    lines.push(pdfText);
  }

  return lines.join("\n");
}

export async function generateVocabularyLinesFromAi(mode, input) {
  const apiKey = process.env.OPENAI_API_KEY || "";
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required for AI vocabulary generation.");
  }

  const numberOfWords = Math.min(200, Math.max(1, Number.parseInt(String(input?.number_of_words ?? 30), 10) || 30));
  const includePronunciation = Boolean(input?.include_pronunciation);
  const includeMeaning = input?.include_meaning === undefined ? true : Boolean(input?.include_meaning);
  const includeExample = Boolean(input?.include_example);

  const model = getModel();
  const systemPrompt = buildSystemPrompt({
    numberOfWords,
    includePronunciation,
    includeMeaning,
    includeExample,
  });

  const body = {
    model,
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: buildUserPrompt(mode, { ...input, number_of_words: numberOfWords }),
      },
    ],
  };

  if (!isGpt5Family(model)) {
    body.temperature = 0.35;
  }

  const response = await postOpenAiChatCompletion({
    apiKey,
    body,
    errorMessagePrefix: "OpenAI vocabulary generate failed",
    maxErrorLength: 400,
    timeoutMs: Number.parseInt(process.env.VOCABULARY_AI_TIMEOUT_MS || "120000", 10) || 120000,
  });

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("OpenAI returned empty content for vocabulary generation.");
  }

  return { rawText: content.trim(), model };
}

export async function preparePdfTextForAi(buffer) {
  const full = await extractTextFromPdfBuffer(buffer);
  if (!full.trim()) {
    throw new Error("Could not extract text from PDF (empty). Try another file.");
  }
  return truncate(full, getMaxPdfChars());
}

