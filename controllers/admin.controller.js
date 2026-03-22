import {
  AiSession,
  Exercise,
  ExerciseAttempt,
  User,
  Vocabulary,
} from "../models/index.js";
import {
  AI_SESSION_STATUSES,
  EXERCISE_TYPES,
  LEVELS,
  USER_ROLES,
} from "../models/constants.js";

const DAY_IN_MS = 24 * 60 * 60 * 1000;

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
  level: item.level,
  topic: item.topic || "general",
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

const getAdminContent = async (_req, res) => {
  try {
    const [exercises, vocabularies] = await Promise.all([
      Exercise.find({})
        .sort({ createdAt: -1 })
        .select("title description level type topic questionCount questions createdAt updatedAt")
        .lean(),
      Vocabulary.find({})
        .sort({ createdAt: -1 })
        .select("word meaning level topic createdAt updatedAt")
        .lean(),
    ]);

    const summary = {
      totalExercises: exercises.length,
      totalVocabulary: vocabularies.length,
      totalQuestions: exercises.reduce((sum, item) => {
        if (typeof item.questionCount === "number") {
          return sum + item.questionCount;
        }

        return sum + (Array.isArray(item.questions) ? item.questions.length : 0);
      }, 0),
      exerciseTypeBreakdown: EXERCISE_TYPES.map((type) => ({
        type,
        count: exercises.filter((item) => item.type === type).length,
      })),
    };

    return res.status(200).json({
      success: true,
      message: "Admin content fetched successfully",
      data: {
        summary,
        recentExercises: exercises.slice(0, 8).map(serializeExercise),
        recentVocabulary: vocabularies.slice(0, 8).map(serializeVocabulary),
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch admin content",
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

const getAdminSettings = async (req, res) => {
  try {
    const [userCount, adminCount] = await Promise.all([
      User.countDocuments({}),
      User.countDocuments({ role: "admin" }),
    ]);

    return res.status(200).json({
      success: true,
      message: "Admin settings fetched successfully",
      data: {
        environment: {
          nodeEnv: process.env.NODE_ENV || "development",
          port: process.env.PORT || "5000",
          apiBasePath: "/api",
          swaggerEnabled: true,
        },
        access: {
          currentAdmin: req.user
            ? {
                id: req.user.id,
                email: req.user.email,
                fullName: req.user.fullName,
                role: req.user.role,
              }
            : null,
          totalUsers: userCount,
          adminUsers: adminCount,
        },
        catalogs: {
          roles: USER_ROLES,
          levels: LEVELS,
          exerciseTypes: EXERCISE_TYPES,
          aiSessionStatuses: AI_SESSION_STATUSES,
        },
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch admin settings",
    });
  }
};

export {
  getAdminContent,
  getAdminOverview,
  getAdminReports,
  getAdminSettings,
  getAdminUsers,
};
