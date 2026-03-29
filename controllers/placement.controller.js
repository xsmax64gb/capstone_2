import mongoose from "mongoose";

import {
  PlacementAttempt,
  PlacementTest,
  User,
  UserProgress,
} from "../models/index.js";
import { sanitizeUser } from "../helper/auth.helper.js";
import { LEVELS, PLACEMENT_SKILL_TYPES } from "../models/constants.js";

const DEFAULT_LEVEL = "A1";
const DEFAULT_SKILL = "grammar";
const DEFAULT_QUESTION_TYPE = "mcq";
const PLACEMENT_QUESTION_TYPES = ["mcq", "true_false", "fill_blank"];

const toIsoDate = (value) => {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
};

const normalizeString = (value) => String(value ?? "").trim();

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

const calculateMaxScore = (questions) =>
  questions
    .filter((question) => question.isActive)
    .reduce((total, question) => total + (question.weight || 1), 0);

const serializePlacementQuestionForAdmin = (question) => ({
  id: question.id,
  prompt: question.prompt || "",
  instruction: question.instruction || "",
  passage: question.passage || "",
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

  const levelRules = Array.isArray(payload.levelRules)
    ? payload.levelRules
        .map((rule, index) => normalizeLevelRulePayload(rule, index))
        .sort((a, b) => a.minScore - b.minScore)
    : [];

  if (!levelRules.length) {
    throw new Error("Cần cấu hình ít nhất 1 rule chấm điểm.");
  }

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
    description: normalizeString(payload.description),
    instructions: normalizeString(payload.instructions),
    durationMinutes: Math.max(1, toFiniteNumber(payload.durationMinutes, 10)),
    isActive: Boolean(payload.isActive),
    questions,
    levelRules,
  };
};

const validateAnswers = (test, answersByQuestionId = {}) => {
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

    if (
      !Number.isInteger(selectedOptionIndex) ||
      selectedOptionIndex < 0 ||
      selectedOptionIndex >= question.options.length
    ) {
      throw new Error(`Câu ${index + 1} chưa có đáp án hợp lệ.`);
    }

    return {
      question,
      selectedOptionIndex,
    };
  });
};

const calculatePlacementAttempt = (test, answersByQuestionId) => {
  const validatedAnswers = validateAnswers(test, answersByQuestionId);
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
    const earnedScore =
      selectedOptionIndex === question.correctOptionIndex ? question.weight || 1 : 0;
    const skillBucket = skillBuckets.get(question.skillType);

    if (skillBucket) {
      skillBucket.maxScore += question.weight || 1;
      skillBucket.earnedScore += earnedScore;
    }

    return {
      questionId: question.id,
      selectedOptionIndex,
      isCorrect: selectedOptionIndex === question.correctOptionIndex,
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
    const payload = normalizePlacementTestPayload(req.body);
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

const updateAdminPlacementTest = async (req, res) => {
  try {
    const payload = normalizePlacementTestPayload(req.body);
    const test = await PlacementTest.findById(req.params.id);

    if (!test) {
      return res.status(404).json({
        success: false,
        message: "Placement test not found",
      });
    }

    test.title = payload.title;
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
      req.body?.answersByQuestionId || {}
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

export {
  activateAdminPlacementTest,
  confirmPlacementResult,
  createAdminPlacementTest,
  deleteAdminPlacementTest,
  getActivePlacementTest,
  getAdminPlacementTestById,
  getAdminPlacementTests,
  getPlacementAttemptById,
  skipPlacementTest,
  submitPlacementTest,
  updateAdminPlacementTest,
};
