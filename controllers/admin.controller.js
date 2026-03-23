import {
  AiLevel,
  AiSession,
  Exercise,
  ExerciseAttempt,
  User,
  Vocabulary,
} from "../models/index.js";
import {
  AI_SESSION_STATUSES,
  LEVELS,
  USER_ROLES,
} from "../models/constants.js";
import { uploadImageFile } from "../helper/upload.helper.js";

const DAY_IN_MS = 24 * 60 * 60 * 1000;

const parseStringArray = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
};

const parseStructuredArray = (value, fieldName) => {
  if (Array.isArray(value)) {
    return value;
  }

  if (value === undefined || value === null || value === "") {
    return [];
  }

  throw new Error(`${fieldName} must be an array`);
};

const toIsoDate = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
};

const buildDayBuckets = (days) => {
  const today = new Date();
  const buckets = [];

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(today.getTime() - offset * DAY_IN_MS);
    const key = date.toISOString().slice(0, 10);

    buckets.push({
      key,
      label: date.toLocaleDateString("en-CA", {
        month: "short",
        day: "2-digit",
      }),
      date,
    });
  }

  return buckets;
};

const getLevelBreakdown = (users) =>
  LEVELS.map((level) => ({
    level,
    count: users.filter((user) => user.currentLevel === level).length,
  }));

const getRoleBreakdown = (users) =>
  USER_ROLES.map((role) => ({
    role,
    count: users.filter((user) => user.role === role).length,
  }));

const serializeUser = (user) => ({
  id: String(user._id),
  fullName: user.fullName,
  email: user.email,
  role: user.role,
  currentLevel: user.currentLevel,
  exp: user.exp ?? 0,
  onboardingDone: Boolean(user.onboardingDone),
  placementScore: user.placementScore ?? 0,
  createdAt: toIsoDate(user.createdAt),
  updatedAt: toIsoDate(user.updatedAt),
});

const serializeExercise = (exercise) => ({
  id: String(exercise._id),
  title: exercise.title,
  description: exercise.description || "",
  level: exercise.level,
  type: exercise.type,
  topic: exercise.topic || "general",
  durationMinutes: exercise.durationMinutes ?? 8,
  rewardsXp: exercise.rewardsXp ?? exercise.rewards?.exp ?? 0,
  coverImage: exercise.coverImage || "",
  skills: Array.isArray(exercise.skills) ? exercise.skills : [],
  questionCount:
    typeof exercise.questionCount === "number"
      ? exercise.questionCount
      : Array.isArray(exercise.questions)
        ? exercise.questions.length
        : 0,
  createdAt: toIsoDate(exercise.createdAt),
  updatedAt: toIsoDate(exercise.updatedAt),
});

const serializeVocabulary = (item) => ({
  id: String(item._id),
  word: item.word,
  meaning: item.meaning,
  phonetic: item.phonetic || "",
  example: item.example || "",
  level: item.level,
  topic: item.topic || "general",
  imageUrl: item.imageUrl || "",
  audioUrl: item.audioUrl || "",
  createdAt: toIsoDate(item.createdAt),
  updatedAt: toIsoDate(item.updatedAt),
});

const serializeAiLevel = (item) => ({
  id: String(item._id),
  level: item.level,
  title: item.title,
  description: item.description || "",
  minPlacementLevel: item.unlockRequirement?.minPlacementLevel || item.level,
  isActive: Boolean(item.isActive),
  stageCount: Array.isArray(item.stages) ? item.stages.length : 0,
  stages: Array.isArray(item.stages)
    ? item.stages.map((stage) => ({
        stageId: stage.stageId,
        name: stage.name,
        order: stage.order,
        type: stage.type,
        context: stage.context,
        aiRole: stage.aiRole,
        objective: stage.objective,
        systemPrompt: stage.systemPrompt,
        suggestedVocabulary: Array.isArray(stage.suggestedVocabulary)
          ? stage.suggestedVocabulary
          : [],
        passRules: {
          minScore: stage.passRules?.minScore ?? 60,
          minTurns: stage.passRules?.minTurns ?? 4,
        },
        rewards: {
          exp: stage.rewards?.exp ?? 0,
          unlockNextLevel: stage.rewards?.unlockNextLevel ?? null,
        },
      }))
    : [],
  createdAt: toIsoDate(item.createdAt),
  updatedAt: toIsoDate(item.updatedAt),
});

const getAdminOverview = async (_req, res) => {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * DAY_IN_MS);

    const [
      totalUsers,
      onboardingCompleted,
      adminUsers,
      totalAttempts,
      attemptsLast7Days,
      activeAiSessions,
      totalExercises,
      totalVocabularies,
      recentUsers,
      recentAttempts,
      recentAiSessions,
    ] = await Promise.all([
      User.countDocuments({}),
      User.countDocuments({ onboardingDone: true }),
      User.countDocuments({ role: "admin" }),
      ExerciseAttempt.countDocuments({}),
      ExerciseAttempt.countDocuments({ submittedAt: { $gte: sevenDaysAgo } }),
      AiSession.countDocuments({ status: "in_progress" }),
      Exercise.countDocuments({}),
      Vocabulary.countDocuments({}),
      User.find({})
        .sort({ createdAt: -1 })
        .limit(4)
        .select("fullName email role createdAt")
        .lean(),
      ExerciseAttempt.find({})
        .sort({ submittedAt: -1 })
        .limit(4)
        .select("userName score total submittedAt")
        .lean(),
      AiSession.find({})
        .sort({ updatedAt: -1 })
        .limit(4)
        .select("stageName status updatedAt totalScore")
        .lean(),
    ]);

    const feed = [
      ...recentUsers.map((item) => ({
        type: "user",
        title: item.fullName || item.email,
        detail: `${item.email} joined with role ${item.role}.`,
        timestamp: toIsoDate(item.createdAt),
      })),
      ...recentAttempts.map((item) => ({
        type: "exercise_attempt",
        title: item.userName || "Anonymous learner",
        detail: `Submitted an exercise with score ${item.score}/${item.total}.`,
        timestamp: toIsoDate(item.submittedAt),
      })),
      ...recentAiSessions.map((item) => ({
        type: "ai_session",
        title: item.stageName || "AI speaking session",
        detail: `Status: ${item.status}. Score: ${item.totalScore ?? 0}.`,
        timestamp: toIsoDate(item.updatedAt),
      })),
    ]
      .filter((item) => item.timestamp)
      .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)))
      .slice(0, 6);

    return res.status(200).json({
      success: true,
      message: "Admin overview fetched successfully",
      data: {
        summary: {
          totalUsers,
          onboardingCompleted,
          onboardingPending: Math.max(0, totalUsers - onboardingCompleted),
          adminUsers,
          totalAttempts,
          attemptsLast7Days,
          activeAiSessions,
          totalContentItems: totalExercises + totalVocabularies,
        },
        systemSnapshot: {
          uptime: process.uptime(),
          status: "healthy",
          apiTimestamp: new Date().toISOString(),
          totals: {
            exercises: totalExercises,
            vocabularies: totalVocabularies,
          },
        },
        recentActivity: feed,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch admin overview",
    });
  }
};

const getAdminUsers = async (_req, res) => {
  try {
    const users = await User.find({})
      .sort({ createdAt: -1 })
      .select(
        "fullName email role currentLevel exp onboardingDone placementScore createdAt updatedAt"
      )
      .lean();

    const summary = {
      totalUsers: users.length,
      onboardingCompleted: users.filter((user) => user.onboardingDone).length,
      onboardingPending: users.filter((user) => !user.onboardingDone).length,
      adminUsers: users.filter((user) => user.role === "admin").length,
      averagePlacementScore: users.length
        ? Math.round(
            users.reduce((sum, user) => sum + (user.placementScore ?? 0), 0) /
              users.length
          )
        : 0,
    };

    return res.status(200).json({
      success: true,
      message: "Admin users fetched successfully",
      data: {
        summary,
        breakdowns: {
          byLevel: getLevelBreakdown(users),
          byRole: getRoleBreakdown(users),
        },
        users: users.map(serializeUser),
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch admin users",
    });
  }
};

const getAdminExercises = async (_req, res) => {
  try {
    const exercises = await Exercise.find({})
      .sort({ updatedAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      message: "Admin exercises fetched successfully",
      data: {
        items: exercises.map(serializeExercise),
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch admin exercises",
    });
  }
};

const createAdminExercise = async (req, res) => {
  try {
    const {
      title,
      description = "",
      type,
      level,
      topic = "general",
      coverImage = "",
      skills = [],
      durationMinutes = 8,
      rewardsXp = 0,
      questions = [],
    } = req.body;

    if (!title || !type || !level) {
      return res.status(400).json({
        success: false,
        message: "title, type, and level are required",
      });
    }

    const exercise = await Exercise.create({
      title: String(title).trim(),
      description: String(description).trim(),
      type,
      level,
      topic: String(topic).trim() || "general",
      coverImage: String(coverImage).trim(),
      skills: parseStringArray(skills),
      durationMinutes: Number(durationMinutes) || 8,
      rewardsXp: Number(rewardsXp) || 0,
      questions: parseStructuredArray(questions, "questions"),
    });

    return res.status(201).json({
      success: true,
      message: "Exercise created successfully",
      data: serializeExercise(exercise.toObject()),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to create exercise",
    });
  }
};

const updateAdminExercise = async (req, res) => {
  try {
    const exercise = await Exercise.findById(req.params.id);

    if (!exercise) {
      return res.status(404).json({
        success: false,
        message: "Exercise not found",
      });
    }

    const payload = req.body || {};

    if (payload.title !== undefined) exercise.title = String(payload.title).trim();
    if (payload.description !== undefined) exercise.description = String(payload.description).trim();
    if (payload.type !== undefined) exercise.type = payload.type;
    if (payload.level !== undefined) exercise.level = payload.level;
    if (payload.topic !== undefined) exercise.topic = String(payload.topic).trim() || "general";
    if (payload.coverImage !== undefined) exercise.coverImage = String(payload.coverImage).trim();
    if (payload.skills !== undefined) exercise.skills = parseStringArray(payload.skills);
    if (payload.durationMinutes !== undefined) exercise.durationMinutes = Number(payload.durationMinutes) || 8;
    if (payload.rewardsXp !== undefined) exercise.rewardsXp = Number(payload.rewardsXp) || 0;
    if (payload.questions !== undefined) {
      exercise.questions = parseStructuredArray(payload.questions, "questions");
    }

    await exercise.save();

    return res.status(200).json({
      success: true,
      message: "Exercise updated successfully",
      data: serializeExercise(exercise.toObject()),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to update exercise",
    });
  }
};

const deleteAdminExercise = async (req, res) => {
  try {
    const exercise = await Exercise.findByIdAndDelete(req.params.id);

    if (!exercise) {
      return res.status(404).json({
        success: false,
        message: "Exercise not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Exercise deleted successfully",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to delete exercise",
    });
  }
};

const getAdminVocabulary = async (_req, res) => {
  try {
    const items = await Vocabulary.find({})
      .sort({ updatedAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      message: "Admin vocabulary fetched successfully",
      data: {
        items: items.map(serializeVocabulary),
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch vocabulary",
    });
  }
};

const createAdminVocabulary = async (req, res) => {
  try {
    const {
      word,
      meaning,
      phonetic = "",
      example = "",
      level,
      topic = "general",
      imageUrl = "",
      audioUrl = "",
    } = req.body;

    if (!word || !meaning || !level) {
      return res.status(400).json({
        success: false,
        message: "word, meaning, and level are required",
      });
    }

    const item = await Vocabulary.create({
      word: String(word).trim(),
      meaning: String(meaning).trim(),
      phonetic: String(phonetic).trim(),
      example: String(example).trim(),
      level,
      topic: String(topic).trim() || "general",
      imageUrl: String(imageUrl).trim(),
      audioUrl: String(audioUrl).trim(),
    });

    return res.status(201).json({
      success: true,
      message: "Vocabulary created successfully",
      data: serializeVocabulary(item.toObject()),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to create vocabulary",
    });
  }
};

const updateAdminVocabulary = async (req, res) => {
  try {
    const item = await Vocabulary.findById(req.params.id);

    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Vocabulary not found",
      });
    }

    const payload = req.body || {};

    if (payload.word !== undefined) item.word = String(payload.word).trim();
    if (payload.meaning !== undefined) item.meaning = String(payload.meaning).trim();
    if (payload.phonetic !== undefined) item.phonetic = String(payload.phonetic).trim();
    if (payload.example !== undefined) item.example = String(payload.example).trim();
    if (payload.level !== undefined) item.level = payload.level;
    if (payload.topic !== undefined) item.topic = String(payload.topic).trim() || "general";
    if (payload.imageUrl !== undefined) item.imageUrl = String(payload.imageUrl).trim();
    if (payload.audioUrl !== undefined) item.audioUrl = String(payload.audioUrl).trim();

    await item.save();

    return res.status(200).json({
      success: true,
      message: "Vocabulary updated successfully",
      data: serializeVocabulary(item.toObject()),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to update vocabulary",
    });
  }
};

const deleteAdminVocabulary = async (req, res) => {
  try {
    const item = await Vocabulary.findByIdAndDelete(req.params.id);

    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Vocabulary not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Vocabulary deleted successfully",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to delete vocabulary",
    });
  }
};

const getAdminAiLevels = async (_req, res) => {
  try {
    const items = await AiLevel.find({})
      .sort({ updatedAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      message: "Admin AI levels fetched successfully",
      data: {
        items: items.map(serializeAiLevel),
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch AI levels",
    });
  }
};

const uploadAdminImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Image file is required",
      });
    }

    const uploadResult = await uploadImageFile(req.file, {
      folder: req.body?.folder,
      publicId: req.body?.publicId,
      tags: ["admin-upload"],
    });

    return res.status(201).json({
      success: true,
      message: "Image uploaded successfully",
      data: uploadResult,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to upload image",
    });
  }
};

const createAdminAiLevel = async (req, res) => {
  try {
    const {
      level,
      title,
      description = "",
      minPlacementLevel,
      isActive = true,
      stages = [],
    } = req.body;

    if (!level || !title || !minPlacementLevel) {
      return res.status(400).json({
        success: false,
        message: "level, title, and minPlacementLevel are required",
      });
    }

    const item = await AiLevel.create({
      level,
      title: String(title).trim(),
      description: String(description).trim(),
      unlockRequirement: {
        minPlacementLevel,
      },
      isActive: Boolean(isActive),
      stages: parseStructuredArray(stages, "stages"),
    });

    return res.status(201).json({
      success: true,
      message: "AI level created successfully",
      data: serializeAiLevel(item.toObject()),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to create AI level",
    });
  }
};

const updateAdminAiLevel = async (req, res) => {
  try {
    const item = await AiLevel.findById(req.params.id);

    if (!item) {
      return res.status(404).json({
        success: false,
        message: "AI level not found",
      });
    }

    const payload = req.body || {};

    if (payload.level !== undefined) item.level = payload.level;
    if (payload.title !== undefined) item.title = String(payload.title).trim();
    if (payload.description !== undefined) item.description = String(payload.description).trim();
    if (payload.minPlacementLevel !== undefined) {
      item.unlockRequirement = {
        ...item.unlockRequirement,
        minPlacementLevel: payload.minPlacementLevel,
      };
    }
    if (payload.isActive !== undefined) item.isActive = Boolean(payload.isActive);
    if (payload.stages !== undefined) {
      item.stages = parseStructuredArray(payload.stages, "stages");
    }

    await item.save();

    return res.status(200).json({
      success: true,
      message: "AI level updated successfully",
      data: serializeAiLevel(item.toObject()),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to update AI level",
    });
  }
};

const deleteAdminAiLevel = async (req, res) => {
  try {
    const item = await AiLevel.findByIdAndDelete(req.params.id);

    if (!item) {
      return res.status(404).json({
        success: false,
        message: "AI level not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "AI level deleted successfully",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to delete AI level",
    });
  }
};

const getAdminReports = async (_req, res) => {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * DAY_IN_MS);
    const [users, attempts, aiSessions, exercises] = await Promise.all([
      User.find({})
        .select("currentLevel createdAt")
        .lean(),
      ExerciseAttempt.find({})
        .select("exerciseRef score total percent durationSec submittedAt")
        .lean(),
      AiSession.find({})
        .select("status startedAt endedAt createdAt")
        .lean(),
      Exercise.find({}).select("title").lean(),
    ]);

    const exerciseMap = new Map(
      exercises.map((item) => [String(item._id), item.title || "Untitled exercise"])
    );

    const attemptsLast7Days = attempts.filter(
      (item) => item.submittedAt && new Date(item.submittedAt) >= sevenDaysAgo
    );
    const aiSessionsLast7Days = aiSessions.filter(
      (item) => item.createdAt && new Date(item.createdAt) >= sevenDaysAgo
    );

    const totalSpeakingMinutes = aiSessions.reduce((sum, item) => {
      if (!item.startedAt || !item.endedAt) {
        return sum;
      }

      const diffMs = new Date(item.endedAt).getTime() - new Date(item.startedAt).getTime();
      if (!Number.isFinite(diffMs) || diffMs <= 0) {
        return sum;
      }

      return sum + Math.round(diffMs / 60000);
    }, 0);

    const dayBuckets = buildDayBuckets(7);
    const weeklyActivity = dayBuckets.map((bucket) => {
      const attemptCount = attemptsLast7Days.filter(
        (item) => toIsoDate(item.submittedAt)?.slice(0, 10) === bucket.key
      ).length;
      const aiSessionCount = aiSessionsLast7Days.filter(
        (item) => toIsoDate(item.createdAt)?.slice(0, 10) === bucket.key
      ).length;

      return {
        date: bucket.key,
        label: bucket.label,
        attempts: attemptCount,
        aiSessions: aiSessionCount,
      };
    });

    const topExercises = [...new Map(
      attempts.map((item) => {
        const key = String(item.exerciseRef);
        return [key, { key, title: exerciseMap.get(key) || "Untitled exercise" }];
      })
    ).values()]
      .map((exercise) => {
        const related = attempts.filter(
          (item) => String(item.exerciseRef) === exercise.key
        );
        const totalAttempts = related.length;
        const averagePercent = totalAttempts
          ? Math.round(
              related.reduce((sum, item) => sum + (item.percent ?? 0), 0) / totalAttempts
            )
          : 0;

        return {
          exerciseId: exercise.key,
          title: exercise.title,
          attempts: totalAttempts,
          averagePercent,
        };
      })
      .sort((a, b) => b.attempts - a.attempts || b.averagePercent - a.averagePercent)
      .slice(0, 5);

    return res.status(200).json({
      success: true,
      message: "Admin reports fetched successfully",
      data: {
        summary: {
          totalUsers: users.length,
          totalExerciseAttempts: attempts.length,
          averageExercisePercent: attempts.length
            ? Math.round(
                attempts.reduce((sum, item) => sum + (item.percent ?? 0), 0) /
                  attempts.length
              )
            : 0,
          totalSpeakingMinutes,
          aiSessionStatusBreakdown: AI_SESSION_STATUSES.map((status) => ({
            status,
            count: aiSessions.filter((item) => item.status === status).length,
          })),
        },
        weeklyActivity,
        levelDistribution: getLevelBreakdown(users),
        topExercises,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch admin reports",
    });
  }
};

export {
  createAdminAiLevel,
  createAdminExercise,
  createAdminVocabulary,
  deleteAdminAiLevel,
  deleteAdminExercise,
  deleteAdminVocabulary,
  getAdminAiLevels,
  getAdminExercises,
  getAdminOverview,
  getAdminReports,
  getAdminUsers,
  getAdminVocabulary,
  updateAdminAiLevel,
  updateAdminExercise,
  updateAdminVocabulary,
  uploadAdminImage,
};
