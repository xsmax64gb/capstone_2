/** Calls OpenAI Chat Completions for learn mode. Uses OPENAI_API_KEY. */

import {
  getStepMinimumPassScore,
  normalizeLearnScoringDifficulty,
} from "../helper/learn-rules.js";
import { postOpenAiChatCompletion } from "../helper/openai.helper.js";

const getApiKey = () => process.env.OPENAI_API_KEY || "";

const getModel = () => process.env.LEARN_OPENAI_MODEL || "gpt-4o-mini";

const QUICK_REPLY_MAX_CHARS = 180;

const getQuickReplyTimeoutMs = () => {
  const raw = Number(process.env.LEARN_QUICK_REPLY_TIMEOUT_MS || 900);
  if (!Number.isFinite(raw) || raw <= 0) return 900;
  return Math.floor(raw);
};

function clampReply(text, maxChars = QUICK_REPLY_MAX_CHARS) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, maxChars - 1).trimEnd()}…`;
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
    body: {
      model: getModel(),
      temperature,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    },
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
- title and scenarioTitle should be concise learner-facing labels.
- scenarioContext should explain learner role, partner role, and communication goal.
- scenarioScript should describe the expected flow and constraints in enough detail for grading.
- aiPersona, aiSystemPrompt, and openingMessage must be ready to use directly.
- Use English for learner-facing content and coaching prompts.
- passCriteria, vocabularyFocus, and grammarFocus should be short, specific arrays.
- gradingDifficulty must match the admin request.
- minimumPassScore should be a realistic 0-100 threshold.
- minTurns and xpReward must be realistic positive integers.
- If type is lesson, bossName should be an empty string and bossTasks should be an empty array.
- If type is boss, include a strong bossName and at least 2 concrete bossTasks with stable ids.
- Avoid duplicating the same scenario focus as existing steps in the map.
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
Required grading difficulty: ${input.gradingDifficulty}`;

  return callOpenAiJson({
    systemPrompt,
    userPrompt,
    temperature: 0.6,
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
    return "";
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

  try {
    const res = await postOpenAiChatCompletion({
      apiKey,
      body: {
        model: getModel(),
        temperature: 0.4,
        messages,
      },
      errorMessagePrefix: "OpenAI quick reply error",
      timeoutMs: getQuickReplyTimeoutMs(),
      maxErrorLength: 180,
    });

    const data = await res.json();
    const raw = data?.choices?.[0]?.message?.content;
    return normalizeMessageContent(raw);
  } catch {
    return "";
  }
}

/**
 * @param {object} args
 * @param {string} args.systemPrompt - step scenario / persona
 * @param {string} [args.localeHint] - user native + target language hint
 * @param {Array<{role: string, content: string}>} args.history
 * @param {string} args.userMessage
 * @param {{ id: string, description: string }[]} [args.bossTasks]
 * @param {boolean} [args.includeReply]
 * @param {object} [args.stepContext]
 * @returns {Promise<{ reply: string, grammarErrors: Array, vocabularyUsed: string[], suggestion: string, turnQualityScore: number, tasksCompletedIds: string[] }>}
 */
export async function runLearnTurn({
  systemPrompt,
  localeHint = "",
  history,
  userMessage,
  bossTasks = [],
  includeReply = true,
  stepContext = {},
}) {
  const apiKey = getApiKey();
  if (!apiKey) {
    return {
      reply:
        "[Demo mode — set OPENAI_API_KEY] That's great practice! Try rephrasing with a full sentence.",
      grammarErrors: [],
      vocabularyUsed: [],
      suggestion: "Add OPENAI_API_KEY to enable full AI dialogue.",
      turnQualityScore: 75,
      tasksCompletedIds: [],
    };
  }

  const difficulty = normalizeLearnScoringDifficulty(
    stepContext.gradingDifficulty
  );
  const minimumPassScore = getStepMinimumPassScore(stepContext);
  const difficultyInstruction =
    difficulty === "easy"
      ? "Grade supportively. Reward clear intent and understandable English even when there are small mistakes."
      : difficulty === "hard"
        ? "Grade strictly. Demand strong grammar control, accurate vocabulary, clear intent completion, and natural conversation flow."
        : "Grade in a balanced way. Reward clear communication but reduce points for repeated grammar, vocabulary, or scenario mistakes.";

  const rubricSections = [
    stepContext.scenarioTitle
      ? `Scenario title: ${stepContext.scenarioTitle}`
      : "",
    stepContext.scenarioContext
      ? `Scenario summary: ${stepContext.scenarioContext}`
      : "",
    stepContext.scenarioScript
      ? `Scenario script and expected flow:\n${stepContext.scenarioScript}`
      : "",
    Array.isArray(stepContext.passCriteria) && stepContext.passCriteria.length
      ? `Conversation goals: ${stepContext.passCriteria.join("; ")}`
      : "",
    Array.isArray(stepContext.vocabularyFocus) && stepContext.vocabularyFocus.length
      ? `Required vocabulary focus: ${stepContext.vocabularyFocus.join("; ")}`
      : "",
    Array.isArray(stepContext.grammarFocus) && stepContext.grammarFocus.length
      ? `Grammar focus: ${stepContext.grammarFocus.join("; ")}`
      : "",
    `Scoring difficulty: ${difficulty}. Expected passing score: ${minimumPassScore}.`,
    difficultyInstruction,
  ]
    .filter(Boolean)
    .join("\n\n");

  const jsonInstruction = includeReply
    ? `You must respond with a single JSON object only (no markdown), with keys:
- "reply": string, your in-character response to the learner (target language, conversational)
- "grammarErrors": array of { "message", "rule", "span" } for issues in the learner's last message (empty if none)
- "vocabularyUsed": string array of notable words the learner used correctly
- "suggestion": one short tip to improve (string, can be in learner's native language if needed)
- "turnQualityScore": number 0-100 for how good the learner's utterance was, based on grammar, vocabulary, task completion, fluency, and fit with the scenario + rubric
- "tasksCompletedIds": string array of task ids from TASKS_CONTEXT that the learner clearly completed in this turn (empty if none or not applicable)

TASKS_CONTEXT may be empty. Only use ids that appear there.`
    : `You must respond with a single JSON object only (no markdown), with keys:
- "grammarErrors": array of { "message", "rule", "span" } for issues in the learner's last message (empty if none)
- "vocabularyUsed": string array of notable words the learner used correctly
- "suggestion": one short improvement tip (string)
- "turnQualityScore": number 0-100 for utterance quality based on grammar, vocabulary, task completion, and clarity
- "tasksCompletedIds": string array of task ids from TASKS_CONTEXT completed in this turn (empty if none)

Keep suggestion concise (max 1 short sentence). TASKS_CONTEXT may be empty. Only use ids that appear there.`;

  const tasksContext =
    bossTasks.length > 0
      ? `TASKS_CONTEXT (id: description): ${JSON.stringify(
        bossTasks.map((t) => ({ id: t.id, description: t.description }))
      )}`
      : "TASKS_CONTEXT: []";

  const messages = [
    {
      role: "system",
      content: `${systemPrompt}\n\n${rubricSections}\n\n${localeHint}\n\n${tasksContext}\n\n${jsonInstruction}`,
    },
    ...history.map((m) => ({ role: m.role === "ai" ? "assistant" : "user", content: m.content })),
    { role: "user", content: userMessage },
  ];

  const res = await postOpenAiChatCompletion({
    apiKey,
    body: {
      model: getModel(),
      temperature: 0.7,
      response_format: { type: "json_object" },
      messages,
    },
    errorMessagePrefix: "OpenAI error",
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

  return {
    reply: includeReply ? String(parsed.reply ?? "") : "",
    grammarErrors: Array.isArray(parsed.grammarErrors) ? parsed.grammarErrors : [],
    vocabularyUsed: Array.isArray(parsed.vocabularyUsed)
      ? parsed.vocabularyUsed.map((s) => String(s))
      : [],
    suggestion: String(parsed.suggestion ?? ""),
    turnQualityScore: Math.min(
      100,
      Math.max(0, Number(parsed.turnQualityScore) || 0)
    ),
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
    return {
      summary: "Session ended. Keep practicing!",
      score: 70,
      goalsAchieved: [],
    };
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
Return JSON only: { "summary": string (feedback for learner), "score": number 0-100, "goalsAchieved": string[] (which goals, vocabulary, or grammar targets were clearly met; use exact strings from the provided lists when possible) }`,
    },
    { role: "user", content: transcript },
  ];

  const res = await postOpenAiChatCompletion({
    apiKey,
    body: {
      model: getModel(),
      temperature: 0.4,
      response_format: { type: "json_object" },
      messages,
    },
    errorMessagePrefix: "OpenAI summary error",
  });

  const data = await res.json();
  const raw = data?.choices?.[0]?.message?.content;
  const parsed = JSON.parse(raw);

  return {
    summary: String(parsed.summary ?? ""),
    score: Math.min(100, Math.max(0, Number(parsed.score) || 0)),
    goalsAchieved: Array.isArray(parsed.goalsAchieved)
      ? parsed.goalsAchieved.map((s) => String(s))
      : [],
  };
}
