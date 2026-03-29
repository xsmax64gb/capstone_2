/** Calls OpenAI Chat Completions for learn mode. Uses OPENAI_API_KEY. */

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

const getApiKey = () => process.env.OPENAI_API_KEY || "";

const getModel = () => process.env.LEARN_OPENAI_MODEL || "gpt-4o-mini";

/**
 * @param {object} args
 * @param {string} args.systemPrompt - step scenario / persona
 * @param {string} [args.localeHint] - user native + target language hint
 * @param {Array<{role: string, content: string}>} args.history
 * @param {string} args.userMessage
 * @param {{ id: string, description: string }[]} [args.bossTasks]
 * @returns {Promise<{ reply: string, grammarErrors: Array, vocabularyUsed: string[], suggestion: string, turnQualityScore: number, tasksCompletedIds: string[] }>}
 */
export async function runLearnTurn({
  systemPrompt,
  localeHint = "",
  history,
  userMessage,
  bossTasks = [],
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

  const jsonInstruction = `You must respond with a single JSON object only (no markdown), with keys:
- "reply": string, your in-character response to the learner (target language, conversational)
- "grammarErrors": array of { "message", "rule", "span" } for issues in the learner's last message (empty if none)
- "vocabularyUsed": string array of notable words the learner used correctly
- "suggestion": one short tip to improve (string, can be in learner's native language if needed)
- "turnQualityScore": number 0-100 for how good the learner's utterance was
- "tasksCompletedIds": string array of task ids from TASKS_CONTEXT that the learner clearly completed in this turn (empty if none or not applicable)

TASKS_CONTEXT may be empty. Only use ids that appear there.`;

  const tasksContext =
    bossTasks.length > 0
      ? `TASKS_CONTEXT (id: description): ${JSON.stringify(
          bossTasks.map((t) => ({ id: t.id, description: t.description }))
        )}`
      : "TASKS_CONTEXT: []";

  const messages = [
    {
      role: "system",
      content: `${systemPrompt}\n\n${localeHint}\n\n${tasksContext}\n\n${jsonInstruction}`,
    },
    ...history.map((m) => ({ role: m.role === "ai" ? "assistant" : "user", content: m.content })),
    { role: "user", content: userMessage },
  ];

  const res = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: getModel(),
      temperature: 0.7,
      response_format: { type: "json_object" },
      messages,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI error ${res.status}: ${errText.slice(0, 200)}`);
  }

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
    reply: String(parsed.reply ?? ""),
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
 * @returns {Promise<{ summary: string, score: number, goalsAchieved: string[] }>}
 */
export async function runSessionSummary({ transcript, passCriteria = [] }) {
  const apiKey = getApiKey();
  if (!apiKey) {
    return {
      summary: "Session ended. Keep practicing!",
      score: 70,
      goalsAchieved: [],
    };
  }

  const criteriaText =
    passCriteria.length > 0
      ? `Pass criteria to check: ${passCriteria.join("; ")}.`
      : "No explicit pass criteria.";

  const messages = [
    {
      role: "system",
      content: `You evaluate a language learning dialogue. ${criteriaText}
Return JSON only: { "summary": string (feedback for learner), "score": number 0-100, "goalsAchieved": string[] (which criteria were clearly met, use exact strings from the list when possible) }`,
    },
    { role: "user", content: transcript },
  ];

  const res = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: getModel(),
      temperature: 0.4,
      response_format: { type: "json_object" },
      messages,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI summary error ${res.status}: ${errText.slice(0, 200)}`);
  }

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
