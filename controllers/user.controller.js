import {
  AiSession,
  Exercise,
  ExerciseAttempt,
  User,
  Vocabulary,
} from "../models/index.js";
import { AI_SESSION_STATUSES, LEVELS, USER_ROLES } from "../models/constants.js";

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

export { getAdminOverview, getAdminReports, getAdminUsers };
