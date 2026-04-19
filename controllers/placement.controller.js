import mongoose from "mongoose";

import {
  PlacementAttempt,
  PlacementTest,
  User,
  UserProgress,
} from "../models/index.js";
import { sanitizeUser } from "../helper/auth.helper.js";
import { postOpenAiChatCompletion } from "../helper/openai.helper.js";
import { uploadBufferToCloudinary } from "../helper/upload.helper.js";
import { LEVELS, PLACEMENT_SKILL_TYPES } from "../models/constants.js";
import { createInboxNotificationForUser } from "../services/inbox-notification.service.js";

const DEFAULT_LEVEL = "A1";
const DEFAULT_SKILL = "grammar";
const DEFAULT_QUESTION_TYPE = "mcq";
const PLACEMENT_QUESTION_TYPES = ["mcq", "true_false", "fill_blank"];
const DEFAULT_AI_MODEL =
  process.env.PLACEMENT_OPENAI_MODEL ||
  process.env.PLACEMENT_AI_MODEL ||
  "gpt-4o-mini";
const DEFAULT_TTS_MODEL = process.env.PLACEMENT_TTS_MODEL || "gpt-4o-mini-tts";
const DEFAULT_TTS_VOICE = process.env.PLACEMENT_TTS_VOICE || "alloy";

const toIsoDate = (value) => {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
};

const normalizeString = (value) => String(value ?? "").trim();
const normalizeLowerString = (value) => normalizeString(value).toLowerCase();

const toFiniteNumber = (value, fallback = 0) => {
  const nextValue = Number(value);
  return Number.isFinite(nextValue) ? nextValue : fallback;
};

const clampInteger = (value, fallback = 0) => {
  const nextValue = Number(value);
  return Number.isInteger(nextValue) ? nextValue : fallback;
};

const ensureLevel = (value) => {
  const nextValue = normalizeString(value).toUpperCase();
  return LEVELS.includes(nextValue) ? nextValue : DEFAULT_LEVEL;
};

const ensureSkillType = (value) => {
  const nextValue = normalizeString(value).toLowerCase();
  return PLACEMENT_SKILL_TYPES.includes(nextValue) ? nextValue : DEFAULT_SKILL;
};

const ensureQuestionType = (value) => {
  const nextValue = normalizeString(value).toLowerCase();
  return PLACEMENT_QUESTION_TYPES.includes(nextValue)
    ? nextValue
    : DEFAULT_QUESTION_TYPE;
};

const createNestedId = (prefix) =>
  `${prefix}-${new mongoose.Types.ObjectId().toString()}`;

const getLevelIndex = (level) => {
  const index = LEVELS.indexOf(level);
  return index >= 0 ? index : 0;
};

const getLevelsUpTo = (level) => LEVELS.slice(0, getLevelIndex(level) + 1);

const getLevelsAtOrBelow = (level) => [...getLevelsUpTo(level)].reverse();

const getLevelsInRange = (levelFrom, levelTo) => {
  const fromIndex = getLevelIndex(levelFrom);
  const toIndex = getLevelIndex(levelTo);
  const start = Math.min(fromIndex, toIndex);
  const end = Math.max(fromIndex, toIndex);
  return LEVELS.slice(start, end + 1);
};

const calculateMaxScore = (questions) =>
  questions
    .filter((question) => question.isActive)
    .reduce((total, question) => total + (question.weight || 1), 0);

const serializePlacementQuestionForAdmin = (question) => ({
  id: question.id,
  prompt: question.prompt || "",
  instruction: question.instruction || "",
  passage: question.passage || "",
  audioUrl: question.audioUrl || "",
  type: question.type || DEFAULT_QUESTION_TYPE,
  options: Array.isArray(question.options) ? question.options : [],
  correctOptionIndex: question.correctOptionIndex ?? 0,
  skillType: question.skillType || DEFAULT_SKILL,
  targetLevel: question.targetLevel || DEFAULT_LEVEL,
  weight: question.weight ?? 1,
  explanation: question.explanation || "",
  isActive: question.isActive !== false,
});

const serializePlacementQuestionForUser = (question) => ({
  id: question.id,
  prompt: question.prompt || "",
  instruction: question.instruction || "",
  passage: question.passage || "",
  audioUrl: question.audioUrl || "",
  type: question.type || DEFAULT_QUESTION_TYPE,
  options: Array.isArray(question.options) ? question.options : [],
  skillType: question.skillType || DEFAULT_SKILL,
  targetLevel: question.targetLevel || DEFAULT_LEVEL,
  weight: question.weight ?? 1,
  isActive: question.isActive !== false,
});

const serializePlacementLevelRule = (rule) => ({
  id: rule.id,
  level: rule.level,
  minScore: rule.minScore ?? 0,
  maxScore: rule.maxScore ?? 0,
});

const serializePlacementTestForAdmin = (test) => {
  const questions = (test.questions || []).map(serializePlacementQuestionForAdmin);
  const activeQuestionCount = questions.filter((question) => question.isActive).length;

  return {
    id: String(test._id),
    title: test.title || "",
    levelFrom: test.levelFrom || DEFAULT_LEVEL,
    levelTo: test.levelTo || LEVELS[LEVELS.length - 1] || DEFAULT_LEVEL,
    description: test.description || "",
    instructions: test.instructions || "",
    durationMinutes: test.durationMinutes ?? 10,
    isActive: Boolean(test.isActive),
    questionCount: questions.length,
    activeQuestionCount,
    maxScore: calculateMaxScore(questions),
    questions,
    levelRules: (test.levelRules || []).map(serializePlacementLevelRule),
    createdAt: toIsoDate(test.createdAt),
    updatedAt: toIsoDate(test.updatedAt),
  };
};

const serializePlacementDraftForAdmin = (draft) =>
  serializePlacementTestForAdmin({
    _id: draft.id || createNestedId("placement-draft"),
    title: draft.title || "",
    levelFrom: draft.levelFrom || DEFAULT_LEVEL,
    levelTo: draft.levelTo || LEVELS[LEVELS.length - 1] || DEFAULT_LEVEL,
    description: draft.description || "",
    instructions: draft.instructions || "",
    durationMinutes: draft.durationMinutes ?? 10,
    isActive: Boolean(draft.isActive),
    questions: draft.questions || [],
    levelRules: draft.levelRules || [],
    createdAt: draft.createdAt ?? null,
    updatedAt: draft.updatedAt ?? null,
  });

const serializePlacementTestForUser = (test) => {
  const questions = (test.questions || [])
    .filter((question) => question.isActive)
    .map(serializePlacementQuestionForUser);

  return {
    id: String(test._id),
    title: test.title || "",
    description: test.description || "",
    instructions: test.instructions || "",
    durationMinutes: test.durationMinutes ?? 10,
    questionCount: questions.length,
    questions,
    createdAt: toIsoDate(test.createdAt),
    updatedAt: toIsoDate(test.updatedAt),
  };
};

const serializeProfileSnapshot = (profileSnapshot) => {
  if (!profileSnapshot) {
    return null;
  }

  return {
    selectedLanguage: profileSnapshot.selectedLanguage || "vi",
    selectedLevel: profileSnapshot.selectedLevel || DEFAULT_LEVEL,
    weeklyHours: profileSnapshot.weeklyHours ?? 0,
    displayName: profileSnapshot.displayName || "",
    jobTitle: profileSnapshot.jobTitle || "",
    selectedGoals: Array.isArray(profileSnapshot.selectedGoals)
      ? profileSnapshot.selectedGoals
      : [],
    startedAt: toIsoDate(profileSnapshot.startedAt),
  };
};

const serializePlacementAttempt = (attempt) => ({
  attemptId: String(attempt._id),
  testId: attempt.testId ? String(attempt.testId) : null,
  testTitle: attempt.testTitle || "",
  rawScore: attempt.rawScore ?? 0,
  maxScore: attempt.maxScore ?? 0,
  percent: attempt.percent ?? 0,
  detectedLevel: attempt.detectedLevel || DEFAULT_LEVEL,
  confirmedLevel: attempt.confirmedLevel || null,
  status: attempt.status || "pending_confirmation",
  skipped: Boolean(attempt.skipped),
  answers: (attempt.answers || []).map((answer) => ({
    questionId: answer.questionId,
    selectedOptionIndex:
      typeof answer.selectedOptionIndex === "number"
        ? answer.selectedOptionIndex
        : null,
    isCorrect: Boolean(answer.isCorrect),
    earnedScore: answer.earnedScore ?? 0,
  })),
  skillBreakdown: (attempt.skillBreakdown || []).map((item) => ({
    skillType: item.skillType,
    earnedScore: item.earnedScore ?? 0,
    maxScore: item.maxScore ?? 0,
    percent: item.percent ?? 0,
  })),
  completedAt: toIsoDate(attempt.completedAt),
  confirmedAt: toIsoDate(attempt.confirmedAt),
  profile: serializeProfileSnapshot(attempt.profileSnapshot),
});

const normalizeProfileSnapshot = (payload = {}) => ({
  selectedLanguage: normalizeString(payload.selectedLanguage || "vi") || "vi",
  selectedLevel: ensureLevel(payload.selectedLevel),
  weeklyHours: Math.max(0, toFiniteNumber(payload.weeklyHours, 0)),
  displayName: normalizeString(payload.displayName),
  jobTitle: normalizeString(payload.jobTitle),
  selectedGoals: Array.isArray(payload.selectedGoals)
    ? payload.selectedGoals
        .map((item) => normalizeString(item))
        .filter(Boolean)
    : [],
  startedAt: toIsoDate(payload.startedAt) ? new Date(payload.startedAt) : null,
});

const normalizeQuestionPayload = (question, index) => {
  const prompt = normalizeString(question?.prompt);

  if (!prompt) {
    throw new Error(`Câu ${index + 1} đang thiếu nội dung.`);
  }

  const options = Array.isArray(question?.options)
    ? question.options
        .map((item) => normalizeString(item))
        .filter(Boolean)
    : [];

  if (options.length < 2) {
    throw new Error(`Câu ${index + 1} cần ít nhất 2 đáp án.`);
  }

  const correctOptionIndex = clampInteger(question?.correctOptionIndex, -1);

  if (correctOptionIndex < 0 || correctOptionIndex >= options.length) {
    throw new Error(`Câu ${index + 1} có đáp án đúng không hợp lệ.`);
  }

  return {
    id: normalizeString(question?.id) || createNestedId("placement-question"),
    prompt,
    instruction: normalizeString(question?.instruction),
    passage: normalizeString(question?.passage),
    audioUrl: normalizeString(question?.audioUrl),
    type: ensureQuestionType(question?.type),
    options,
    correctOptionIndex,
    skillType: ensureSkillType(question?.skillType),
    targetLevel: ensureLevel(question?.targetLevel),
    weight: Math.max(1, toFiniteNumber(question?.weight, 1)),
    explanation: normalizeString(question?.explanation),
    isActive: question?.isActive !== false,
  };
};

const normalizeLevelRulePayload = (rule, index) => ({
  id: normalizeString(rule?.id) || createNestedId("placement-rule"),
  level: ensureLevel(rule?.level),
  minScore: Math.max(0, toFiniteNumber(rule?.minScore, index === 0 ? 0 : 1)),
  maxScore: Math.max(0, toFiniteNumber(rule?.maxScore, 0)),
});

const normalizePlacementTestPayload = (payload = {}) => {
  const title = normalizeString(payload.title);

  if (!title) {
    throw new Error("Bài test cần có tiêu đề.");
  }

  const questions = Array.isArray(payload.questions)
    ? payload.questions.map((question, index) =>
        normalizeQuestionPayload(question, index)
      )
    : [];

  if (!questions.length) {
    throw new Error("Cần ít nhất 1 câu hỏi trong bài test đầu vào.");
  }

  const activeQuestions = questions.filter((question) => question.isActive);

  if (!activeQuestions.length) {
    throw new Error("Cần ít nhất 1 câu hỏi active để chấm placement test.");
  }

  const levelFrom = ensureLevel(payload.levelFrom || DEFAULT_LEVEL);
  const levelTo = ensureLevel(payload.levelTo || (LEVELS[LEVELS.length - 1] || DEFAULT_LEVEL));
  const autoRules = Boolean(payload.autoRules) || !Array.isArray(payload.levelRules);

  const levelRules = !autoRules
    ? payload.levelRules
        .map((rule, index) => normalizeLevelRulePayload(rule, index))
        .sort((a, b) => a.minScore - b.minScore)
    : buildLevelRulesFromQuestions(activeQuestions, { levelFrom, levelTo });

  const seenLevels = new Set();

  for (let index = 0; index < levelRules.length; index += 1) {
    const rule = levelRules[index];

    if (seenLevels.has(rule.level)) {
      throw new Error(`Level ${rule.level} đang bị lặp trong scoring rules.`);
    }

    seenLevels.add(rule.level);

    if (rule.minScore > rule.maxScore) {
      throw new Error(`Rule ${rule.level} có minScore lớn hơn maxScore.`);
    }

    if (index === 0 && rule.minScore !== 0) {
      throw new Error("Rule đầu tiên phải bắt đầu từ 0 điểm.");
    }

    if (index > 0) {
      const previousRule = levelRules[index - 1];

      if (rule.minScore !== previousRule.maxScore + 1) {
        throw new Error("Các rule cần nối liên tục và không được chồng lấn.");
      }
    }
  }

  const maxScore = calculateMaxScore(activeQuestions);

  if (levelRules[levelRules.length - 1].maxScore < maxScore) {
    throw new Error(`Rule cuối phải bao phủ đến ít nhất ${maxScore} điểm.`);
  }

  return {
    title,
    levelFrom,
    levelTo,
    description: normalizeString(payload.description),
    instructions: normalizeString(payload.instructions),
    durationMinutes: Math.max(1, toFiniteNumber(payload.durationMinutes, 10)),
    isActive: Boolean(payload.isActive),
    questions,
    levelRules,
  };
};

const normalizeQuestionCount = (value, label) => {
  const nextValue = Math.round(toFiniteNumber(value, 0));

  if (nextValue < 0) {
    throw new Error(`${label} không được nhỏ hơn 0.`);
  }

  return nextValue;
};

const normalizeGeneratePlacementTestRequest = (payload = {}) => {
  const title = normalizeString(payload.title);
  const context = normalizeString(payload.context);
  const levelFrom = ensureLevel(payload.levelFrom || "A1");
  const levelTo = ensureLevel(payload.levelTo || "B2");
  const listeningQuestions = normalizeQuestionCount(
    payload.listeningQuestions,
    "Số câu nghe"
  );
  const readingQuestions = normalizeQuestionCount(
    payload.readingQuestions,
    "Số câu đọc"
  );
  const grammarQuestions = normalizeQuestionCount(
    payload.grammarQuestions,
    "Số câu ngữ pháp"
  );
  const vocabQuestions = normalizeQuestionCount(
    payload.vocabQuestions,
    "Số câu từ vựng"
  );
  const totalQuestions =
    listeningQuestions + readingQuestions + grammarQuestions + vocabQuestions;
  const durationMinutes = Math.min(
    180,
    Math.max(5, Math.round(toFiniteNumber(payload.durationMinutes, 25)))
  );
  const description = normalizeString(payload.description);
  const instructions = normalizeString(payload.instructions);
  const isActive = Boolean(payload.isActive);

  if (!title) {
    throw new Error("Tiêu đề bài test là bắt buộc.");
  }

  if (!context) {
    throw new Error("Ngữ cảnh tạo đề là bắt buộc.");
  }

  if (getLevelIndex(levelFrom) > getLevelIndex(levelTo)) {
    throw new Error("Level bắt đầu cần nhỏ hơn hoặc bằng level kết thúc.");
  }

  if (totalQuestions < 5) {
    throw new Error("Tổng số câu phải từ 5 trở lên.");
  }

  if (totalQuestions > 60) {
    throw new Error("Tổng số câu không được vượt quá 60.");
  }

  return {
    title,
    context,
    levelFrom,
    levelTo,
    totalQuestions,
    listeningQuestions,
    readingQuestions,
    grammarQuestions,
    vocabQuestions,
    durationMinutes,
    description,
    instructions,
    isActive,
  };
};

const callOpenAiForPlacementDraft = async (input) => {
  const apiKey = process.env.OPENAI_API_KEY || "";

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required to generate placement test with AI.");
  }

  const systemPrompt = `You generate high-quality English placement test data.
Return ONLY valid JSON with shape:
{
  "description": "string",
  "instructions": "string",
  "questions": [
    {
      "prompt": "string",
      "instruction": "string",
      "passage": "string",
      "type": "mcq|true_false|fill_blank",
      "options": ["string", "..."],
      "correctOptionIndex": 0,
      "skillType": "grammar|vocab|reading|listening",
      "targetLevel": "A1|A2|B1|B2|C1|C2",
      "weight": 1,
      "explanation": "string"
    }
  ]
}
Rules:
- Exactly ${input.totalQuestions} questions.
- Exactly ${input.listeningQuestions} listening questions (skillType=listening).
- Exactly ${input.readingQuestions} reading questions (skillType=reading).
- Exactly ${input.grammarQuestions} grammar questions (skillType=grammar).
- Exactly ${input.vocabQuestions} vocabulary questions (skillType=vocab).
- Every question has at least 2 options, and correctOptionIndex must be valid.
- Use ONLY these skill types: listening, reading, grammar, vocab.
- Keep each prompt/instruction/passage concise and practical for onboarding.
- Use mixed target levels from ${input.levelFrom} to ${input.levelTo}.
- For listening questions, write TTS-friendly spoken content in "passage" or "prompt".
- For reading questions, include short practical texts when needed.
- Description and instructions must be concise, admin-ready Vietnamese.`;

  const userPrompt = `Create a placement test question set.
Title: ${input.title}
Context: ${input.context}
Level range: ${input.levelFrom} -> ${input.levelTo}
Required counts: listening=${input.listeningQuestions}, reading=${input.readingQuestions}, grammar=${input.grammarQuestions}, vocab=${input.vocabQuestions}
Description hint: ${input.description || "(auto)"}
Instruction hint: ${input.instructions || "(auto)"}
Duration minutes: ${input.durationMinutes}`;

  const runOnce = async (temperature, extraInstruction = "") => {
    const response = await postOpenAiChatCompletion({
      apiKey,
      body: {
        model: DEFAULT_AI_MODEL,
        temperature,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: extraInstruction
              ? `${userPrompt}\n\n${extraInstruction}`
              : userPrompt,
          },
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

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (error) {
      throw new Error(`OpenAI returned invalid JSON: ${error?.message || "parse_error"}`);
    }

    if (!Array.isArray(parsed?.questions)) {
      throw new Error("OpenAI response does not contain questions array.");
    }

    return parsed;
  };

  let parsed;
  try {
    parsed = await runOnce(0.4);
  } catch {
    parsed = await runOnce(
      0.2,
      'IMPORTANT: Return STRICT JSON only. No markdown, no code fences, no trailing commas. Ensure "questions" is a JSON array.'
    );
  }

  return {
    description: normalizeString(parsed?.description),
    instructions: normalizeString(parsed?.instructions),
    questions: parsed.questions,
  };
};

const buildLevelRulesFromQuestions = (
  questions,
  { levelFrom = DEFAULT_LEVEL, levelTo = LEVELS[LEVELS.length - 1] || DEFAULT_LEVEL } = {}
) => {
  const levels = getLevelsInRange(ensureLevel(levelFrom), ensureLevel(levelTo));
  const maxScore = calculateMaxScore(questions);
  const step = Math.max(1, Math.floor((maxScore + 1) / levels.length));

  return levels.map((level, index) => {
    const minScore = index === 0 ? 0 : index * step;
    const maxScoreForLevel =
      index === levels.length - 1 ? maxScore : Math.min(maxScore, (index + 1) * step - 1);

    return {
      id: createNestedId("placement-rule"),
      level,
      minScore,
      maxScore: Math.max(minScore, maxScoreForLevel),
    };
  });
};

const shouldGenerateListeningAudio = (question) => {
  if (normalizeString(question.audioUrl)) {
    return false;
  }

  if (question.skillType === "listening") {
    return true;
  }

  const combined = [
    normalizeLowerString(question.prompt),
    normalizeLowerString(question.instruction),
    normalizeLowerString(question.passage),
  ].join(" ");

  return combined.includes("nghe") || combined.includes("listening");
};

const generateSpeechBuffer = async (text) => {
  const apiKey = process.env.OPENAI_API_KEY || "";

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required to generate TTS audio.");
  }

  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: DEFAULT_TTS_MODEL,
      voice: DEFAULT_TTS_VOICE,
      input: text,
      format: "mp3",
    }),
  });

  if (!response.ok) {
    const reason = await response.text();
    throw new Error(`OpenAI TTS failed (${response.status}): ${reason.slice(0, 240)}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
};

const enrichListeningQuestionsWithAudio = async (questions) => {
  const nextQuestions = [];
  const concurrency = 3;
  let cursor = 0;

  const workers = Array.from({ length: concurrency }).map(async () => {
    while (cursor < questions.length) {
      const index = cursor;
      cursor += 1;
      const question = questions[index];

      if (!shouldGenerateListeningAudio(question)) {
        nextQuestions[index] = question;
        continue;
      }

      const ttsText = normalizeString(question.passage) || normalizeString(question.prompt);

      if (!ttsText) {
        nextQuestions[index] = question;
        continue;
      }

      try {
        const audioBuffer = await generateSpeechBuffer(ttsText);
        const uploadResult = await uploadBufferToCloudinary(audioBuffer, {
          folder: "placement-tests/listening-audio",
          publicId: `placement-${question.id}-${Date.now()}`,
          resourceType: "video",
          tags: ["placement-test", "listening", "tts"],
        });

        nextQuestions[index] = {
          ...question,
          audioUrl: uploadResult.secure_url || uploadResult.url || "",
        };
      } catch {
        nextQuestions[index] = question;
      }
    }
  });

  await Promise.all(workers);
  return nextQuestions.filter(Boolean);
};

const preparePlacementPayloadForPersistence = async (payload = {}) => {
  const normalizedPayload = normalizePlacementTestPayload(payload);
  const questions = await enrichListeningQuestionsWithAudio(normalizedPayload.questions);

  return {
    ...normalizedPayload,
    questions,
  };
};

const validateGeneratedQuestionsAgainstInput = (questions, input) => {
  if (questions.length !== input.totalQuestions) {
    throw new Error(
      `AI trả về ${questions.length} câu, nhưng hệ thống yêu cầu ${input.totalQuestions} câu.`
    );
  }

  const expectedCounts = {
    listening: input.listeningQuestions,
    reading: input.readingQuestions,
    grammar: input.grammarQuestions,
    vocab: input.vocabQuestions,
  };
  const actualCounts = {
    listening: 0,
    reading: 0,
    grammar: 0,
    vocab: 0,
  };

  questions.forEach((question) => {
    if (Object.prototype.hasOwnProperty.call(actualCounts, question.skillType)) {
      actualCounts[question.skillType] += 1;
    }
  });

  for (const [skillType, expectedCount] of Object.entries(expectedCounts)) {
    if (actualCounts[skillType] !== expectedCount) {
      throw new Error(
        `AI trả về ${actualCounts[skillType]} câu ${skillType}, nhưng yêu cầu là ${expectedCount}.`
      );
    }
  }
};

const validateAnswers = (
  test,
  answersByQuestionId = {},
  { allowPartial = false } = {}
) => {
  if (
    !answersByQuestionId ||
    typeof answersByQuestionId !== "object" ||
    Array.isArray(answersByQuestionId)
  ) {
    throw new Error("answersByQuestionId không hợp lệ.");
  }

  const activeQuestions = (test.questions || []).filter((question) => question.isActive);

  return activeQuestions.map((question, index) => {
    const selectedOptionIndex = clampInteger(
      answersByQuestionId[question.id],
      Number.NaN
    );

    const hasValidAnswer =
      Number.isInteger(selectedOptionIndex) &&
      selectedOptionIndex >= 0 &&
      selectedOptionIndex < question.options.length;

    if (!hasValidAnswer && !allowPartial) {
      throw new Error(`Câu ${index + 1} chưa có đáp án hợp lệ.`);
    }

    return {
      question,
      selectedOptionIndex: hasValidAnswer ? selectedOptionIndex : null,
    };
  });
};

const calculatePlacementAttempt = (
  test,
  answersByQuestionId,
  { allowPartial = false } = {}
) => {
  const validatedAnswers = validateAnswers(test, answersByQuestionId, {
    allowPartial,
  });
  const skillBuckets = new Map();

  PLACEMENT_SKILL_TYPES.forEach((skillType) => {
    skillBuckets.set(skillType, {
      skillType,
      earnedScore: 0,
      maxScore: 0,
      percent: 0,
    });
  });

  const answers = validatedAnswers.map(({ question, selectedOptionIndex }) => {
    const isCorrect =
      selectedOptionIndex !== null &&
      selectedOptionIndex === question.correctOptionIndex;
    const earnedScore = isCorrect ? question.weight || 1 : 0;
    const skillBucket = skillBuckets.get(question.skillType);

    if (skillBucket) {
      skillBucket.maxScore += question.weight || 1;
      skillBucket.earnedScore += earnedScore;
    }

    return {
      questionId: question.id,
      selectedOptionIndex,
      isCorrect,
      earnedScore,
    };
  });

  const rawScore = answers.reduce((sum, item) => sum + item.earnedScore, 0);
  const maxScore = calculateMaxScore(test.questions || []);
  const percent = maxScore > 0 ? Math.round((rawScore / maxScore) * 100) : 0;
  const sortedRules = [...(test.levelRules || [])].sort(
    (a, b) => a.minScore - b.minScore
  );
  const matchedRule =
    sortedRules.find(
      (rule) => rawScore >= rule.minScore && rawScore <= rule.maxScore
    ) || sortedRules[sortedRules.length - 1];

  const skillBreakdown = PLACEMENT_SKILL_TYPES.map((skillType) => {
    const item = skillBuckets.get(skillType) || {
      skillType,
      earnedScore: 0,
      maxScore: 0,
      percent: 0,
    };

    return {
      skillType,
      earnedScore: item.earnedScore,
      maxScore: item.maxScore,
      percent:
        item.maxScore > 0
          ? Math.round((item.earnedScore / item.maxScore) * 100)
          : 0,
    };
  });

  return {
    answers,
    rawScore,
    maxScore,
    percent,
    detectedLevel: matchedRule?.level || DEFAULT_LEVEL,
    skillBreakdown,
  };
};

const applyPlacementForUser = async ({
  userId,
  level,
  placementScore,
  displayName,
}) => {
  const user = await User.findById(userId);

  if (!user) {
    throw new Error("User not found");
  }

  const normalizedLevel = ensureLevel(level);
  const nextDisplayName = normalizeString(displayName);

  if (nextDisplayName) {
    user.fullName = nextDisplayName;
  }

  user.currentLevel = normalizedLevel;
  user.onboardingDone = true;
  user.placementScore = Math.max(0, Math.round(toFiniteNumber(placementScore, 0)));
  user.placementCompletedAt = new Date();
  await user.save();

  try {
    await createInboxNotificationForUser(String(userId), {
      title: "Trình độ đã được cập nhật",
      body: `Chúc mừng! Hệ thống ghi nhận trình độ ${normalizedLevel} sau bài đánh giá đầu vào.`,
      category: "milestone",
      meta: { kind: "placement_level", level: normalizedLevel },
    });
  } catch (err) {
    console.error("[Inbox] placement milestone", err?.message || err);
  }

  await UserProgress.findOneAndUpdate(
    { userId },
    {
      $set: {
        currentLevel: normalizedLevel,
        unlockedLevels: getLevelsUpTo(normalizedLevel),
      },
      $setOnInsert: {
        userId,
      },
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    }
  );

  return user;
};

const getAdminPlacementTests = async (_req, res) => {
  try {
    const tests = await PlacementTest.find({}).sort({ updatedAt: -1 }).lean();

    return res.status(200).json({
      success: true,
      message: "Placement tests fetched successfully",
      data: {
        items: tests.map(serializePlacementTestForAdmin),
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch placement tests",
    });
  }
};

const getAdminPlacementTestById = async (req, res) => {
  try {
    const test = await PlacementTest.findById(req.params.id).lean();

    if (!test) {
      return res.status(404).json({
        success: false,
        message: "Placement test not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Placement test fetched successfully",
      data: serializePlacementTestForAdmin(test),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch placement test",
    });
  }
};

const createAdminPlacementTest = async (req, res) => {
  try {
    const payload = await preparePlacementPayloadForPersistence(req.body);
    const test = await PlacementTest.create(payload);

    if (payload.isActive) {
      await PlacementTest.updateMany(
        { _id: { $ne: test._id } },
        { $set: { isActive: false } }
      );
    }

    const freshTest = await PlacementTest.findById(test._id).lean();

    return res.status(201).json({
      success: true,
      message: "Placement test created successfully",
      data: serializePlacementTestForAdmin(freshTest),
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to create placement test",
    });
  }
};

const createAdminPlacementTestWithAi = async (req, res) => {
  try {
    const input = normalizeGeneratePlacementTestRequest(req.body);
    const aiDraft = await callOpenAiForPlacementDraft(input);
    const baseQuestions = aiDraft.questions.map((question, index) =>
      normalizeQuestionPayload(
        {
          ...question,
          id: question?.id || createNestedId(`placement-question-${index + 1}`),
        },
        index
      )
    );
    validateGeneratedQuestionsAgainstInput(baseQuestions, input);

    const payload = normalizePlacementTestPayload({
      title: input.title,
      levelFrom: input.levelFrom,
      levelTo: input.levelTo,
      description:
        input.description ||
        aiDraft.description ||
        `Bài test được tạo bởi AI theo ngữ cảnh: ${input.context.slice(0, 240)}`,
      instructions:
        input.instructions ||
        aiDraft.instructions ||
        "Đọc kỹ từng câu hỏi. Với câu nghe, bấm phát audio trước khi chọn đáp án.",
      durationMinutes: input.durationMinutes,
      isActive: input.isActive,
      questions: baseQuestions,
      autoRules: true,
    });

    return res.status(200).json({
      success: true,
      message: "Placement test draft generated with AI successfully",
      data: serializePlacementDraftForAdmin(payload),
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to generate placement test with AI",
    });
  }
};

const updateAdminPlacementTest = async (req, res) => {
  try {
    const payload = await preparePlacementPayloadForPersistence(req.body);
    const test = await PlacementTest.findById(req.params.id);

    if (!test) {
      return res.status(404).json({
        success: false,
        message: "Placement test not found",
      });
    }

    test.title = payload.title;
    test.levelFrom = payload.levelFrom;
    test.levelTo = payload.levelTo;
    test.description = payload.description;
    test.instructions = payload.instructions;
    test.durationMinutes = payload.durationMinutes;
    test.isActive = payload.isActive;
    test.questions = payload.questions;
    test.levelRules = payload.levelRules;
    await test.save();

    if (payload.isActive) {
      await PlacementTest.updateMany(
        { _id: { $ne: test._id } },
        { $set: { isActive: false } }
      );
    }

    const freshTest = await PlacementTest.findById(test._id).lean();

    return res.status(200).json({
      success: true,
      message: "Placement test updated successfully",
      data: serializePlacementTestForAdmin(freshTest),
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to update placement test",
    });
  }
};

const activateAdminPlacementTest = async (req, res) => {
  try {
    const test = await PlacementTest.findById(req.params.id);

    if (!test) {
      return res.status(404).json({
        success: false,
        message: "Placement test not found",
      });
    }

    test.isActive = true;
    await test.save();
    await PlacementTest.updateMany(
      { _id: { $ne: test._id } },
      { $set: { isActive: false } }
    );

    const freshTest = await PlacementTest.findById(test._id).lean();

    return res.status(200).json({
      success: true,
      message: "Placement test activated successfully",
      data: serializePlacementTestForAdmin(freshTest),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to activate placement test",
    });
  }
};

const deleteAdminPlacementTest = async (req, res) => {
  try {
    const deletedTest = await PlacementTest.findByIdAndDelete(req.params.id).lean();

    if (!deletedTest) {
      return res.status(404).json({
        success: false,
        message: "Placement test not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Placement test deleted successfully",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to delete placement test",
    });
  }
};

const getActivePlacementTest = async (_req, res) => {
  try {
    const test = await PlacementTest.findOne({ isActive: true })
      .sort({ updatedAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      message: test
        ? "Active placement test fetched successfully"
        : "No active placement test",
      data: test ? serializePlacementTestForUser(test) : null,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch active placement test",
    });
  }
};

const submitPlacementTest = async (req, res) => {
  try {
    const userId = req.user?.id;
    const testId = normalizeString(req.body?.testId);
    const allowPartialSubmission =
      Boolean(req.body?.allowPartial) || Boolean(req.body?.autoSubmitted);
    const activeTest = await PlacementTest.findOne({ isActive: true }).sort({
      updatedAt: -1,
    });

    if (!activeTest) {
      return res.status(404).json({
        success: false,
        message: "No active placement test found",
      });
    }

    if (testId && String(activeTest._id) !== testId) {
      return res.status(400).json({
        success: false,
        message: "Submitted placement test is no longer active",
      });
    }

    const calculated = calculatePlacementAttempt(
      activeTest,
      req.body?.answersByQuestionId || {},
      { allowPartial: allowPartialSubmission }
    );

    const attempt = await PlacementAttempt.create({
      userId,
      testId: activeTest._id,
      testTitle: activeTest.title,
      status: "pending_confirmation",
      skipped: false,
      profileSnapshot: normalizeProfileSnapshot(req.body?.profile || {}),
      answers: calculated.answers,
      rawScore: calculated.rawScore,
      maxScore: calculated.maxScore,
      percent: calculated.percent,
      detectedLevel: calculated.detectedLevel,
      confirmedLevel: null,
      skillBreakdown: calculated.skillBreakdown,
      completedAt: new Date(),
      confirmedAt: null,
    });

    return res.status(201).json({
      success: true,
      message: "Placement test submitted successfully",
      data: serializePlacementAttempt(attempt),
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to submit placement test",
    });
  }
};

const getPlacementAttemptById = async (req, res) => {
  try {
    const attempt = await PlacementAttempt.findOne({
      _id: req.params.attemptId,
      userId: req.user?.id,
    }).lean();

    if (!attempt) {
      return res.status(404).json({
        success: false,
        message: "Placement result not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Placement result fetched successfully",
      data: serializePlacementAttempt(attempt),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch placement result",
    });
  }
};

const confirmPlacementResult = async (req, res) => {
  try {
    const userId = req.user?.id;
    const attemptId = normalizeString(req.body?.attemptId);
    const confirmedLevel = ensureLevel(req.body?.confirmedLevel);

    if (!attemptId) {
      return res.status(400).json({
        success: false,
        message: "attemptId is required",
      });
    }

    const attempt = await PlacementAttempt.findOne({
      _id: attemptId,
      userId,
    });

    if (!attempt) {
      return res.status(404).json({
        success: false,
        message: "Placement result not found",
      });
    }

    if (attempt.skipped) {
      return res.status(400).json({
        success: false,
        message: "Skipped placement result cannot be confirmed again",
      });
    }

    const allowedLevels = getLevelsAtOrBelow(attempt.detectedLevel);

    if (!allowedLevels.includes(confirmedLevel)) {
      return res.status(400).json({
        success: false,
        message: `You can only choose ${attempt.detectedLevel} or a lower level`,
      });
    }

    attempt.confirmedLevel = confirmedLevel;
    attempt.status = "confirmed";
    attempt.confirmedAt = new Date();
    await attempt.save();

    const user = await applyPlacementForUser({
      userId,
      level: confirmedLevel,
      placementScore: attempt.percent,
      displayName: attempt.profileSnapshot?.displayName,
    });

    return res.status(200).json({
      success: true,
      message: "Placement level confirmed successfully",
      data: {
        user: sanitizeUser(user),
        result: serializePlacementAttempt(attempt),
      },
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to confirm placement result",
    });
  }
};

const skipPlacementTest = async (req, res) => {
  try {
    const userId = req.user?.id;
    const activeTest = await PlacementTest.findOne({ isActive: true })
      .sort({ updatedAt: -1 })
      .lean();
    const profileSnapshot = normalizeProfileSnapshot(req.body?.profile || {});
    const maxScore = activeTest ? calculateMaxScore(activeTest.questions || []) : 0;

    const attempt = await PlacementAttempt.create({
      userId,
      testId: activeTest?._id || null,
      testTitle: activeTest?.title || "Skipped placement test",
      status: "skipped",
      skipped: true,
      profileSnapshot,
      answers: [],
      rawScore: 0,
      maxScore,
      percent: 0,
      detectedLevel: DEFAULT_LEVEL,
      confirmedLevel: DEFAULT_LEVEL,
      skillBreakdown: PLACEMENT_SKILL_TYPES.map((skillType) => ({
        skillType,
        earnedScore: 0,
        maxScore: 0,
        percent: 0,
      })),
      completedAt: new Date(),
      confirmedAt: new Date(),
    });

    const user = await applyPlacementForUser({
      userId,
      level: DEFAULT_LEVEL,
      placementScore: 0,
      displayName: profileSnapshot.displayName,
    });

    return res.status(200).json({
      success: true,
      message: "Placement test skipped successfully",
      data: {
        user: sanitizeUser(user),
        result: serializePlacementAttempt(attempt),
      },
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to skip placement test",
    });
  }
};

const regenerateAdminPlacementQuestionAudio = async (req, res) => {
  try {
    const testId = normalizeString(req.params?.id);
    const questionId = normalizeString(req.params?.questionId);

    if (!testId || !questionId) {
      return res.status(400).json({
        success: false,
        message: "Missing testId or questionId.",
      });
    }

    const test = await PlacementTest.findById(testId);

    if (!test) {
      return res.status(404).json({
        success: false,
        message: "Placement test not found",
      });
    }

    const questionIndex = (test.questions || []).findIndex((q) => q.id === questionId);
    if (questionIndex < 0) {
      return res.status(404).json({
        success: false,
        message: "Placement question not found",
      });
    }

    const question = test.questions[questionIndex];
    const ttsText = normalizeString(question.passage) || normalizeString(question.prompt);

    if (!ttsText) {
      return res.status(400).json({
        success: false,
        message: "Question has no passage/prompt text for TTS.",
      });
    }

    const audioBuffer = await generateSpeechBuffer(ttsText);
    const uploadResult = await uploadBufferToCloudinary(audioBuffer, {
      folder: "placement-tests/listening-audio",
      publicId: `placement-${question.id}-${Date.now()}`,
      resourceType: "video",
      tags: ["placement-test", "listening", "tts", "retry"],
    });

    test.questions[questionIndex].audioUrl = uploadResult.secure_url || uploadResult.url || "";
    await test.save();

    const freshTest = await PlacementTest.findById(test._id).lean();
    return res.status(200).json({
      success: true,
      message: "Audio regenerated successfully",
      data: serializePlacementTestForAdmin(freshTest),
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to regenerate audio",
    });
  }
};

export {
  activateAdminPlacementTest,
  confirmPlacementResult,
  createAdminPlacementTest,
  createAdminPlacementTestWithAi,
  deleteAdminPlacementTest,
  getActivePlacementTest,
  getAdminPlacementTestById,
  getAdminPlacementTests,
  getPlacementAttemptById,
  regenerateAdminPlacementQuestionAudio,
  skipPlacementTest,
  submitPlacementTest,
  updateAdminPlacementTest,
};
