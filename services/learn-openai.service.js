/** Calls OpenAI Chat Completions for learn mode. Uses OPENAI_API_KEY. */

import {
  getStepMinimumPassScore,
  normalizeLearnScoringDifficulty,
} from "../helper/learn-rules.js";
import { postOpenAiChatCompletion } from "../helper/openai.helper.js";

const getApiKey = () => process.env.OPENAI_API_KEY || "";

const getModel = () => process.env.LEARN_OPENAI_MODEL || "gpt-5.4-mini";
const getEvaluationModel = () =>
  process.env.LEARN_EVALUATION_OPENAI_MODEL || "gpt-5.4-mini";
const QUICK_REPLY_MAX_CHARS = 180;
const DEFAULT_QUICK_REPLY_TIMEOUT_MS = 30000;

const getQuickReplyTimeoutMs = () => {
  const raw = Number(
    process.env.LEARN_QUICK_REPLY_TIMEOUT_MS || DEFAULT_QUICK_REPLY_TIMEOUT_MS
  );
  if (!Number.isFinite(raw) || raw <= 0) {
    return DEFAULT_QUICK_REPLY_TIMEOUT_MS;
  }
  return Math.floor(raw);
};

function getModelConfig(model = getModel()) {
  // gpt-5.x models only support temperature=1 (default)
  if (model.includes("gpt-5") || model === "gpt-5-mini" || model === "gpt-5.4-mini") {
    return { supportsTemperature: false };
  }
  return { supportsTemperature: true };
}

function clampReply(text, maxChars = QUICK_REPLY_MAX_CHARS) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, maxChars - 1).trimEnd()}…`;
}

function buildChatCompletionBody({
  model = getModel(),
  messages,
  responseFormat = null,
  temperature,
}) {
  const body = {
    model,
    messages,
  };

  if (responseFormat) {
    body.response_format = responseFormat;
  }

  if (
    getModelConfig(model).supportsTemperature &&
    Number.isFinite(temperature)
  ) {
    body.temperature = temperature;
  }

  return body;
}

function normalizeMessageContent(content) {
  if (typeof content === "string") {
    return clampReply(content);
  }

  if (!Array.isArray(content)) {
    return "";
  }

  const merged = content
    .map((item) => {
      if (typeof item === "string") return item;
      return String(item?.text || item?.content || "");
    })
    .join(" ")
    .trim();

  return clampReply(merged);
}

async function callOpenAiJson({
  systemPrompt,
  userPrompt,
  temperature = 0.4,
}) {
  const apiKey = getApiKey();

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required to generate learn draft with AI.");
  }

  const response = await postOpenAiChatCompletion({
    apiKey,
    body: buildChatCompletionBody({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      responseFormat: { type: "json_object" },
      temperature,
    }),
    errorMessagePrefix: "OpenAI generate failed",
    maxErrorLength: 300,
  });

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;

  if (typeof content !== "string") {
    throw new Error("OpenAI returned invalid generate response.");
  }

  return JSON.parse(content);
}

export async function generateLearnMapDraft(input) {
  const systemPrompt = `You generate admin-ready speaking map drafts for an English learning app.
Return ONLY valid JSON with shape:
{
  "title": "string",
  "slug": "string",
  "description": "string",
  "theme": "string",
  "level": 1,
  "order": 0,
  "requiredXPToComplete": 0,
  "bossXPReward": 50,
  "isPublished": false
}
Rules:
- Keep title concise and suitable for a speaking-learning map.
- slug must be lowercase ASCII with hyphens only.
- description should be concise and practical for admin review.
- theme should be a short lowercase keyword or phrase.
- level must be a positive integer.
- order must be a non-negative integer.
- requiredXPToComplete should usually be 0 unless the brief explicitly asks for a fixed XP gate.
- bossXPReward should be a non-negative integer and realistic for one boss map reward.
- isPublished must match the admin request.
- Do not include any extra keys, markdown, or explanations.`;

  const userPrompt = `Create a speaking map draft.
Admin brief: ${input.brief}
Preferred level: ${input.level}
Suggested order: ${input.order}
Theme hint: ${input.theme || "(auto)"}
Publish immediately: ${input.isPublished ? "yes" : "no"}`;

  return callOpenAiJson({
    systemPrompt,
    userPrompt,
    temperature: 0.5,
  });
}

export async function generateLearnStepDraft({ map, existingSteps = [], input }) {
  const existingStepsContext =
    existingSteps.length > 0
      ? existingSteps
        .map(
          (step, index) =>
            `${index + 1}. [${step.type}] order=${step.order} title=${step.title} scenario=${step.scenarioTitle || "-"}`
        )
        .join("\n")
      : "No existing steps yet.";

  const systemPrompt = `You generate admin-ready speaking step drafts for an English learning app.
Return ONLY valid JSON with shape:
{
  "title": "string",
  "type": "lesson|boss",
  "order": 0,
  "scenarioTitle": "string",
  "scenarioContext": "string",
  "scenarioScript": "string",
  "aiPersona": "string",
  "aiSystemPrompt": "string",
  "openingMessage": "string",
  "minTurns": 2,
  "xpReward": 20,
  "gradingDifficulty": "easy|medium|hard",
  "minimumPassScore": 65,
  "passCriteria": ["string"],
  "vocabularyFocus": ["string"],
  "grammarFocus": ["string"],
  "bossName": "string",
  "bossTasks": [{ "id": "task-1", "description": "string" }]
}
Rules:
- type must be either lesson or boss.
- order must be a non-negative integer.
- title must be very short: max 4 words.
- scenarioTitle must be short: max 6 words.
- scenarioContext should explain learner role, partner role, and communication goal in at most 2 short sentences.
- scenarioScript should describe the expected flow and grading constraints in at most 5 short sentences. Avoid long paragraphs.
- aiPersona must be a short role label only, max 5 words. Example: "Friendly shop assistant".
- aiSystemPrompt must be ready to use directly and stay under 90 words.
- openingMessage must be one short sentence, max 14 words.
- Use English for learner-facing content and coaching prompts.
- passCriteria must contain 3 or 4 short items only. Each item must be one complete idea, 3-8 words, with no commas.
- vocabularyFocus must contain 4-6 short items only. Each item should be 1-3 words, with no commas or parentheses.
- grammarFocus must contain 2-4 short items only. Each item should be 2-5 words, with no commas.
- Never split one idea across multiple array items.
- gradingDifficulty must match the admin request.
- minimumPassScore should be a realistic 0-100 threshold.
- minTurns and xpReward must be realistic positive integers.
- If type is lesson, bossName should be an empty string and bossTasks should be an empty array.
- If type is boss, bossName must be short, max 3 words, and include at least 2 concrete bossTasks with stable ids.
- Avoid duplicating the same scenario focus as existing steps in the map.
- Prefer compact admin-friendly content. Do not be verbose in names or persona text.
- Do not include any extra keys, markdown, or explanations.`;

  const userPrompt = `Create a speaking step draft for this map.
Map title: ${map.title}
Map description: ${map.description || "(none)"}
Map theme: ${map.theme || "(none)"}
Map level: ${map.level}
Existing steps:
${existingStepsContext}

Admin brief: ${input.brief}
Required type: ${input.type}
Preferred order: ${input.order}
Required grading difficulty: ${input.gradingDifficulty}

Keep every field concise and practical for admin editing.`;

  return callOpenAiJson({
    systemPrompt,
    userPrompt,
    temperature: 0.4,
  });
}

/**
 * Fast teacher reply for chat UX. Returns empty string on timeout/error so caller can fallback.
 * @param {object} args
 * @param {string} args.systemPrompt
 * @param {string} [args.localeHint]
 * @param {Array<{role: string, content: string}>} [args.history]
 * @param {string} args.userMessage
 * @param {object} [args.stepContext]
 * @returns {Promise<string>}
 */
export async function runLearnQuickReply({
  systemPrompt,
  localeHint = "",
  history = [],
  userMessage,
  stepContext = {},
}) {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required for quick reply");
  }

  const compactHistory = Array.isArray(history)
    ? history
      .slice(-3)
      .map((m) => ({
        role: m.role === "ai" ? "assistant" : "user",
        content: String(m.content || "").trim(),
      }))
      .filter((m) => m.content)
    : [];

  const scenarioHints = [
    stepContext.scenarioTitle
      ? `Scenario: ${stepContext.scenarioTitle}`
      : "",
    stepContext.scenarioContext
      ? `Context: ${stepContext.scenarioContext}`
      : "",
    Array.isArray(stepContext.passCriteria) && stepContext.passCriteria.length
      ? `Goal: ${stepContext.passCriteria.slice(0, 2).join("; ")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const messages = [
    {
      role: "system",
      content: `${systemPrompt}\n\n${localeHint}\n${scenarioHints}\n\nYou are the AI teacher in a speaking lesson. Reply in ONE short natural sentence (max 18 words). Keep the conversation moving. No markdown.`,
    },
    ...compactHistory,
    { role: "user", content: String(userMessage || "") },
  ];

  const res = await postOpenAiChatCompletion({
    apiKey,
    body: buildChatCompletionBody({
      messages,
      temperature: 0.4,
    }),
    errorMessagePrefix: "OpenAI quick reply error",
    timeoutMs: getQuickReplyTimeoutMs(),
    maxErrorLength: 180,
  });

  const data = await res.json();
  const raw = data?.choices?.[0]?.message?.content;
  const reply = normalizeMessageContent(raw);

  if (!reply || !String(reply).trim()) {
    throw new Error("OpenAI quick reply returned empty content");
  }

  return reply;
}

/**
 * @param {object} args
 * @param {string} args.userMessage
 * @param {{ id: string, description: string }[]} [args.bossTasks]
 * @returns {Promise<{ grammarErrors: Array, suggestion: string, turnQualityScore: number, tasksCompletedIds: string[] }>}
 */
export async function runLearnMessageEvaluation({
  userMessage,
  bossTasks = [],
  previousAiMessage,
  stepContext = {},
}) {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required for evaluation");
  }

  const tasksContext =
    bossTasks.length > 0
      ? `TASKS_CONTEXT (id: description): ${JSON.stringify(
        bossTasks.map((t) => ({ id: t.id, description: t.description }))
      )}`
      : "TASKS_CONTEXT: []";

  const stepContextText = stepContext.scenarioTitle || stepContext.scenarioContext || stepContext.title
    ? `STEP_CONTEXT: ${[stepContext.scenarioTitle, stepContext.scenarioContext, stepContext.title].filter(Boolean).join(' - ')}`
    : 'STEP_CONTEXT: General conversation practice';

  const previousMessageContext = previousAiMessage
    ? `PREVIOUS_AI_MESSAGE: "${previousAiMessage}"`
    : 'PREVIOUS_AI_MESSAGE: (First message in conversation)';

  const messages = [
    {
      role: "system",
      content: `You are a strict English conversation teacher evaluating one learner response.
Return a single JSON object only with keys:
- "isCorrect": boolean
- "grammarErrors": array of { "message": string, "rule": string, "span": string }
- "improvedSentence": string
- "feedback": string
- "tasksCompletedIds": string[]

Rules:
- Evaluate both grammar AND topic relevance based on STEP_CONTEXT and PREVIOUS_AI_MESSAGE.
- If the sentence is completely off-topic or doesn't relate to the lesson context, give low scores and strict feedback in Vietnamese.
- If the sentence is on-topic but has grammar issues, focus on grammar fixes.
- If the sentence is both grammatically correct AND on-topic, give high scores and praise in Vietnamese.
- For off-topic responses, set "isCorrect" to false even if grammar is perfect, and explain the topic mismatch in Vietnamese.
- Keep "feedback" short and direct in Vietnamese.
- Only include task ids from TASKS_CONTEXT when the response clearly completes them.

${stepContextText}
${previousMessageContext}
${tasksContext}`,
    },
    {
      role: "user",
      content: String(userMessage || "").trim(),
    },
  ];

  const res = await postOpenAiChatCompletion({
    apiKey,
    body: buildChatCompletionBody({
      model: getEvaluationModel(),
      messages,
      responseFormat: { type: "json_object" },
      temperature: 0.2,
    }),
    errorMessagePrefix: "OpenAI error",
    timeoutMs: 10000,
  });

  const data = await res.json();
  const raw = data?.choices?.[0]?.message?.content;

  if (!raw || typeof raw !== "string") {
    throw new Error("Invalid OpenAI response");
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("OpenAI returned non-JSON");
  }

  const grammarErrors = Array.isArray(parsed.grammarErrors)
    ? parsed.grammarErrors.map((item) => ({
      message: String(item?.message ?? ""),
      rule: String(item?.rule ?? ""),
      span: String(item?.span ?? ""),
    }))
    : [];
  const isCorrect = Boolean(parsed.isCorrect);
  const improvedSentence = String(parsed.improvedSentence ?? "").trim();
  const feedback = String(parsed.feedback ?? "").trim();
  const suggestion = improvedSentence || feedback || "Please try to respond to the lesson topic.";
  const turnQualityScore = isCorrect
    ? 95
    : grammarErrors.length === 0
      ? 60 // Off-topic but grammatically correct
      : Math.max(40, 90 - grammarErrors.length * 15);

  return {
    grammarErrors: isCorrect ? [] : grammarErrors,
    suggestion,
    turnQualityScore,
    tasksCompletedIds: Array.isArray(parsed.tasksCompletedIds)
      ? parsed.tasksCompletedIds.map((s) => String(s))
      : [],
  };
}

/**
 * @param {object} args
 * @param {string} args.transcript - condensed user + ai lines
 * @param {string[]} args.passCriteria
 * @param {string[]} [args.vocabularyFocus]
 * @param {string[]} [args.grammarFocus]
 * @param {string} [args.scenarioTitle]
 * @param {string} [args.scenarioContext]
 * @param {string} [args.scenarioScript]
 * @param {string} [args.gradingDifficulty]
 * @param {number} [args.minimumPassScore]
 * @returns {Promise<{ summary: string, score: number, goalsAchieved: string[] }>}
 */
export async function runSessionSummary({
  transcript,
  passCriteria = [],
  vocabularyFocus = [],
  grammarFocus = [],
  scenarioTitle = "",
  scenarioContext = "",
  scenarioScript = "",
  gradingDifficulty = "medium",
  minimumPassScore = 65,
}) {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required for session summary");
  }

  const difficulty = normalizeLearnScoringDifficulty(gradingDifficulty);
  const effectiveMinimumPassScore = getStepMinimumPassScore({
    gradingDifficulty: difficulty,
    minimumPassScore,
  });
  const scenarioNotes = [
    scenarioTitle ? `Scenario title: ${scenarioTitle}.` : "",
    scenarioContext ? `Scenario context: ${scenarioContext}.` : "",
    scenarioScript ? `Scenario script and expected learner behavior:\n${scenarioScript}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const criteriaText =
    [
      passCriteria.length > 0
        ? `Conversation goals to check: ${passCriteria.join("; ")}.`
        : "No explicit conversation goals.",
      vocabularyFocus.length > 0
        ? `Vocabulary requirements: ${vocabularyFocus.join("; ")}.`
        : "No mandatory vocabulary list.",
      grammarFocus.length > 0
        ? `Grammar requirements: ${grammarFocus.join("; ")}.`
        : "No mandatory grammar list.",
      `Scoring difficulty: ${difficulty}. Passing score threshold: ${effectiveMinimumPassScore}.`,
      scenarioNotes,
    ]
      .filter(Boolean)
      .join("\n\n");

  const messages = [
    {
      role: "system",
      content: `You evaluate a language learning dialogue. ${criteriaText}
Return JSON only: { "summary": "nhận xét bằng tiếng Việt về buổi học của học viên", "score": number 0-100, "goalsAchieved": string[] (which goals, vocabulary, or grammar targets were clearly met; use exact strings from the provided lists when possible) }`,
    },
    { role: "user", content: transcript },
  ];

  const res = await postOpenAiChatCompletion({
    apiKey,
    body: buildChatCompletionBody({
      messages,
      responseFormat: { type: "json_object" },
      temperature: 0.4,
    }),
    errorMessagePrefix: "OpenAI summary error",
  });

  const data = await res.json();
  const raw = data?.choices?.[0]?.message?.content;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (parseError) {
    console.error("Failed to parse OpenAI response:", raw);
    parsed = {};
  }

  return {
    summary: String(parsed.summary ?? ""),
    score: Math.min(100, Math.max(0, Number(parsed.score) || 0)),
    goalsAchieved: Array.isArray(parsed.goalsAchieved)
      ? parsed.goalsAchieved.map((s) => String(s))
      : [],
  };
}
