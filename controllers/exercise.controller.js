import mongoose from "mongoose";

import { Exercise, ExerciseAttempt, User, UserProgress } from "../models/index.js";
import { createInboxNotificationForUser } from "../services/inbox-notification.service.js";
import {
    DEFAULT_COVER_IMAGES,
    GENERIC_HINTS,
} from "../helper/exercise.seed.js";
import { uploadImageFile } from "../helper/upload.helper.js";

const toSafeInt = (value, fallback = 0) => {
    const parsed = Number.parseInt(String(value ?? ""), 10);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const LEVEL_ORDER = ["A1", "A2", "B1", "B2", "C1", "C2"];

const getLevelOrderIndex = (level) => {
    const normalizedLevel = String(level || "A1").trim().toUpperCase();
    const index = LEVEL_ORDER.indexOf(normalizedLevel);
    return index >= 0 ? index : 0;
};

const isExerciseEligibleForXp = (exerciseLevel, userLevel) =>
    getLevelOrderIndex(exerciseLevel) >= getLevelOrderIndex(userLevel);

const buildCompletedExerciseIdSet = (progressDoc) =>
    new Set(
        (progressDoc?.exerciseProgress ?? [])
            .filter((item) => item?.passed && item?.exerciseId)
            .map((item) => String(item.exerciseId))
    );

const annotateExercisesWithCompletion = async (items, userId) => {
    if (
        !Array.isArray(items) ||
        items.length === 0 ||
        !userId ||
        !mongoose.Types.ObjectId.isValid(userId)
    ) {
        return items;
    }

    const progress = await UserProgress.findOne({ userId })
        .select("exerciseProgress")
        .lean();
    const completedIds = buildCompletedExerciseIdSet(progress);

    return items.map((item) => ({
        ...item,
        isCompleted: completedIds.has(String(item.id)),
    }));
};

const getOrCreateUserProgress = async (userId, currentLevel = "A1") => {
    const normalizedLevel = LEVEL_ORDER.includes(currentLevel) ? currentLevel : "A1";
    let progress = await UserProgress.findOne({ userId });

    if (!progress) {
        progress = await UserProgress.create({
            userId,
            currentLevel: normalizedLevel,
            unlockedLevels: [normalizedLevel],
        });
    }

    return progress;
};

const inferAttemptXpReason = (attempt) => {
    if (attempt?.xpReason) {
        return attempt.xpReason;
    }

    const total = toSafeInt(attempt?.total, 0);
    const score = toSafeInt(attempt?.score, 0);
    const perfectScore = total > 0 && score === total;

    if (!perfectScore) {
        return "not_perfect";
    }

    return Number(attempt?.earnedXp || 0) > 0 ? "awarded" : "already_completed";
};

const normalizeQuestion = (question, index) => {
    const options = Array.isArray(question?.options) ? question.options : [];
    let correctIndex = 0;

    if (typeof question?.correctIndex === "number") {
        correctIndex = question.correctIndex;
    } else if (typeof question?.correctAnswer === "number") {
        correctIndex = question.correctAnswer;
    } else if (typeof question?.correctAnswer === "string") {
        const found = options.findIndex((item) => item === question.correctAnswer);
        correctIndex = found >= 0 ? found : 0;
    }

    return {
        id: String(question?._id || `q_${index + 1}`),
        prompt: question?.prompt || question?.question || "",
        options,
        correctIndex,
        explanation: question?.explanation || "",
    };
};

const normalizeExercise = (exercise, index = 0) => {
    const questions = Array.isArray(exercise?.questions)
        ? exercise.questions.map((item, questionIndex) => normalizeQuestion(item, questionIndex))
        : [];

    const topic = exercise?.topic || "general";
    const durationMinutes =
        exercise?.durationMinutes ||
        (questions.length > 0 ? Math.max(6, Math.round(questions.length * 1.8)) : 8);

    return {
        id: String(exercise?._id || `ex_${index + 1}`),
        _docId: exercise?._id ? String(exercise._id) : null,
        title: exercise?.title || `Exercise ${index + 1}`,
        description: exercise?.description || "",
        type: exercise?.type || "mcq",
        level: exercise?.level || "A1",
        topic,
        questionCount: Number.isFinite(exercise?.questionCount) ? exercise.questionCount : questions.length,
        durationMinutes,
        rewardsXp: toSafeInt(exercise?.rewardsXp ?? exercise?.rewards?.exp, 20),
        coverImage: exercise?.coverImage || DEFAULT_COVER_IMAGES[topic] || DEFAULT_COVER_IMAGES.general,
        skills: Array.isArray(exercise?.skills) ? exercise.skills : [topic, exercise?.type || "practice"],
        questions,
    };
};

const parseStringArray = (value) => {
    if (Array.isArray(value)) {
        return value.map((item) => String(item).trim()).filter(Boolean);
    }

    if (typeof value === "string") {
        const trimmed = value.trim();

        if (!trimmed) {
            return [];
        }

        if (trimmed.startsWith("[")) {
            try {
                const parsed = JSON.parse(trimmed);
                return Array.isArray(parsed)
                    ? parsed.map((item) => String(item).trim()).filter(Boolean)
                    : [];
            } catch {
                return [];
            }
        }

        return trimmed
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

    if (typeof value === "string") {
        const trimmed = value.trim();

        if (!trimmed) {
            return [];
        }

        try {
            const parsed = JSON.parse(trimmed);

            if (Array.isArray(parsed)) {
                return parsed;
            }
        } catch {
            throw new Error(`${fieldName} must be a valid JSON array`);
        }
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

const resolveCoverImage = async (req) => {
    if (req.file) {
        const uploadResult = await uploadImageFile(req.file, {
            folder: "exercises",
            tags: ["exercise"],
        });

        return uploadResult.secureUrl || uploadResult.url || "";
    }

    return String(req.body?.coverImage || "").trim();
};

const getExercises = async () => {
    const dbItems = await Exercise.find({}).lean();
    return dbItems.map((item, index) => normalizeExercise(item, index));
};

const getExerciseByObjectId = async (id) => {
    if (!mongoose.Types.ObjectId.isValid(id)) {
        return null;
    }

    const raw = await Exercise.findById(id).lean();
    if (!raw) {
        return null;
    }

    return normalizeExercise(raw, 0);
};

const getUserAttemptCount = async (userId) => {
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
        return 0;
    }

    return ExerciseAttempt.countDocuments({ userId });
};

const pickRecommendedByAttempts = (items, attempts, limit) => {
    if (!attempts.length) {
        return [...items]
            .sort((a, b) => b.rewardsXp - a.rewardsXp)
            .slice(0, limit);
    }

    const scores = new Map();
    attempts.forEach((attempt) => {
        const key = String(attempt.exerciseRef);
        const previous = scores.get(key) || 0;
        const ratio = attempt.total > 0 ? attempt.score / attempt.total : 0;
        scores.set(key, previous + ratio);
    });

    return [...items]
        .map((item) => ({
            ...item,
            recommendScore: (scores.get(item.id) || 0) * 10 + item.rewardsXp,
        }))
        .sort((a, b) => b.recommendScore - a.recommendScore)
        .slice(0, limit)
        .map(({ recommendScore, ...rest }) => rest);
};

const buildPublicExercise = (item) => {
    const { questions, _docId, ...rest } = item;
    return rest;
};

const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${String(secs).padStart(2, "0")}`;
};

const listExercises = async (req, res) => {
    try {
        const all = await getExercises();
        const {
            query = "",
            level,
            type,
            topic,
            page = "1",
            limit = "20",
            includeQuestions = "false",
        } = req.query;

        const normalizedQuery = String(query).trim().toLowerCase();
        const pageNumber = Math.max(1, toSafeInt(page, 1));
        const limitNumber = Math.min(100, Math.max(1, toSafeInt(limit, 20)));

        const filtered = all.filter((item) => {
            const matchLevel = !level || String(level) === "all" || item.level === level;
            const matchType = !type || String(type) === "all" || item.type === type;
            const matchTopic = !topic || String(topic) === "all" || item.topic === topic;
            const matchQuery =
                !normalizedQuery ||
                item.title.toLowerCase().includes(normalizedQuery) ||
                item.description.toLowerCase().includes(normalizedQuery) ||
                item.skills.some((skill) => skill.toLowerCase().includes(normalizedQuery));

            return matchLevel && matchType && matchTopic && matchQuery;
        });

        const start = (pageNumber - 1) * limitNumber;
        const rows = filtered.slice(start, start + limitNumber);
        const responseItems =
            includeQuestions === "true" ? rows : rows.map(buildPublicExercise);
        const items = await annotateExercisesWithCompletion(responseItems, req.user?.id);

        return res.status(200).json({
            success: true,
            message: "Exercises fetched successfully",
            data: {
                items,
                pagination: {
                    page: pageNumber,
                    limit: limitNumber,
                    total: filtered.length,
                    totalPages: Math.max(1, Math.ceil(filtered.length / limitNumber)),
                },
            },
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to fetch exercises",
        });
    }
};

const getExerciseSummary = async (_req, res) => {
    try {
        const all = await getExercises();
        const totalQuestions = all.reduce((sum, item) => sum + item.questionCount, 0);
        const totalXp = all.reduce((sum, item) => sum + item.rewardsXp, 0);
        const userId = _req.user?.id;
        const pastAttempts = await getUserAttemptCount(userId);

        return res.status(200).json({
            success: true,
            message: "Exercise summary fetched successfully",
            data: {
                totalExercises: all.length,
                totalQuestions,
                totalXp,
                pastAttempts,
            },
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to fetch summary",
        });
    }
};

const getRecommendedExercises = async (req, res) => {
    try {
        const userId = req.user?.id;
        const limit = Math.min(20, Math.max(1, toSafeInt(req.query.limit, 6)));

        if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized",
            });
        }

        // 1. Get user and their level
        const user = await User.findById(userId).lean();
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            });
        }

        const userLevel = user.currentLevel || "A1";

        // 2. Define target levels (current + 1 above)
        const levelProgression = ["A1", "A2", "B1", "B2", "C1", "C2"];
        const currentLevelIndex = levelProgression.indexOf(userLevel);
        const nextLevel = currentLevelIndex < levelProgression.length - 1
            ? levelProgression[currentLevelIndex + 1]
            : userLevel;
        const targetLevels = [userLevel, nextLevel];

        // 3. Get all exercises first
        const all = await getExercises();
        const targetExercises = all.filter(ex => targetLevels.includes(ex.level));

        if (targetExercises.length === 0) {
            return res.status(200).json({
                success: true,
                message: "Recommended exercises fetched successfully",
                data: [],
            });
        }

        // 4. Get recent attempts (last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const recentAttempts = await ExerciseAttempt.find({
            userId,
            submittedAt: { $gte: thirtyDaysAgo },
        })
            .select("exerciseRef percent submittedAt")
            .lean();

        const attemptMap = new Map();
        recentAttempts.forEach(attempt => {
            const key = String(attempt.exerciseRef);
            attemptMap.set(key, attempt);
        });

        // 5. Categorize exercises
        const unmasteredExercises = [];
        const masteredExercises = [];
        const newExercises = [];

        targetExercises.forEach(exercise => {
            const attempt = attemptMap.get(exercise.id);
            if (!attempt) {
                newExercises.push(exercise);
            } else if (attempt.percent < 80) {
                unmasteredExercises.push({
                    ...exercise,
                    lastAttempt: attempt.submittedAt,
                    lastScore: attempt.percent,
                });
            } else {
                masteredExercises.push(exercise);
            }
        });

        // 6. Sort unmastered by most recent first
        unmasteredExercises.sort((a, b) =>
            new Date(b.lastAttempt) - new Date(a.lastAttempt)
        );

        // 7. Combine recommendations: unmastered first, then new
        let recommendations = [];

        // Add top unmastered
        const unmasteredCount = Math.min(3, unmasteredExercises.length);
        recommendations.push(...unmasteredExercises.slice(0, unmasteredCount));

        // Add new exercises if needed
        const newCount = Math.min(limit - recommendations.length, newExercises.length);
        recommendations.push(...newExercises.slice(0, newCount));

        // If still need more and have mastered exercises, add them
        if (recommendations.length < limit && masteredExercises.length > 0) {
            const masteredCount = Math.min(
                limit - recommendations.length,
                masteredExercises.length
            );
            recommendations.push(...masteredExercises.slice(0, masteredCount));
        }

        const items = await annotateExercisesWithCompletion(
            recommendations.map(buildPublicExercise),
            userId
        );

        return res.status(200).json({
            success: true,
            message: "Recommended exercises fetched successfully",
            data: items,
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to fetch recommended exercises",
        });
    }
};

const getExerciseById = async (req, res) => {
    try {
        const { id } = req.params;
        const all = await getExercises();
        const exercise = all.find((item) => item.id === id);

        if (!exercise) {
            return res.status(404).json({
                success: false,
                message: "Exercise not found",
            });
        }

        const related = all
            .filter((item) => item.topic === exercise.topic && item.id !== exercise.id)
            .slice(0, 3)
            .map(buildPublicExercise);
        const [exerciseWithCompletion] = await annotateExercisesWithCompletion(
            [exercise],
            req.user?.id
        );
        const relatedWithCompletion = await annotateExercisesWithCompletion(
            related,
            req.user?.id
        );

        return res.status(200).json({
            success: true,
            message: "Exercise detail fetched successfully",
            data: {
                exercise: exerciseWithCompletion,
                related: relatedWithCompletion,
            },
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to fetch exercise detail",
        });
    }
};

const getExerciseHints = async (req, res) => {
    try {
        const { id } = req.params;
        const exercise = await getExerciseByObjectId(id);

        if (!exercise) {
            return res.status(404).json({
                success: false,
                message: "Exercise not found",
            });
        }

        const personalized = exercise.skills.map(
            (skill) => `Focus on ${skill.replaceAll("-", " ")} while solving.`
        );

        return res.status(200).json({
            success: true,
            message: "Exercise hints fetched successfully",
            data: {
                exerciseId: exercise.id,
                title: exercise.title,
                personalized,
                strategies: GENERIC_HINTS,
            },
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to fetch hints",
        });
    }
};

const buildLeaderboardFromAttempts = (attempts) => {
    const relatedAttempts = attempts.map((item) => ({
        name: item.userName || "Anonymous",
        score: item.score,
        total: item.total,
        durationSec: item.durationSec,
        userKey: String(item.userId || item.userName || item._id),
    }));

    const groupedByUser = new Map();
    relatedAttempts.forEach((attempt) => {
        const previous = groupedByUser.get(attempt.userKey);
        if (!previous) {
            groupedByUser.set(attempt.userKey, attempt);
            return;
        }

        const prevRatio = previous.total > 0 ? previous.score / previous.total : 0;
        const nextRatio = attempt.total > 0 ? attempt.score / attempt.total : 0;

        if (nextRatio > prevRatio || (nextRatio === prevRatio && attempt.durationSec < previous.durationSec)) {
            groupedByUser.set(attempt.userKey, attempt);
        }
    });

    return [...groupedByUser.values()]
        .map((value) => ({
            name: value.name,
            score: value.score,
            durationSec: value.durationSec,
            ratio: value.total > 0 ? value.score / value.total : 0,
        }))
        .sort((a, b) => {
            if (b.ratio !== a.ratio) return b.ratio - a.ratio;
            return a.durationSec - b.durationSec;
        })
        .slice(0, 20)
        .map((item, index) => ({
            rank: index + 1,
            name: item.name,
            score: item.score,
            durationSec: item.durationSec,
        }));
};

const getExerciseLeaderboard = async (req, res) => {
    try {
        const { id } = req.params;
        const exercise = await getExerciseByObjectId(id);

        if (!exercise) {
            return res.status(404).json({
                success: false,
                message: "Exercise not found",
            });
        }

        const attempts = await ExerciseAttempt.find({ exerciseRef: exercise.id })
            .select("userId userName score total durationSec")
            .lean();

        const leaderboard = buildLeaderboardFromAttempts(attempts);

        return res.status(200).json({
            success: true,
            message: "Leaderboard fetched successfully",
            data: {
                exerciseId: exercise.id,
                questionCount: exercise.questionCount,
                leaderboard,
            },
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to fetch leaderboard",
        });
    }
};

const getExerciseHistory = async (req, res) => {
    try {
        const all = await getExercises();
        const exerciseMap = new Map(all.map((item) => [item.id, item]));
        const limit = Math.min(100, Math.max(1, toSafeInt(req.query.limit, 20)));
        const userId = req.user?.id;

        let items = [];
        if (userId && mongoose.Types.ObjectId.isValid(userId)) {
            const dbAttempts = await ExerciseAttempt.find({ userId })
                .sort({ submittedAt: -1 })
                .limit(limit)
                .lean();

            items = dbAttempts.map((attempt) => ({
                attemptId: String(attempt._id),
                exerciseId: String(attempt.exerciseRef),
                submittedAt: attempt.submittedAt,
                score: attempt.score,
                total: attempt.total,
                durationSec: attempt.durationSec,
                earnedXp: attempt.earnedXp ?? 0,
                perfectScore:
                    typeof attempt.perfectScore === "boolean"
                        ? attempt.perfectScore
                        : attempt.total > 0 && attempt.score === attempt.total,
                xpAwarded:
                    typeof attempt.xpAwarded === "boolean"
                        ? attempt.xpAwarded
                        : Number(attempt.earnedXp ?? 0) > 0,
                xpReason: inferAttemptXpReason(attempt),
                exerciseCompleted:
                    typeof attempt.exerciseCompleted === "boolean"
                        ? attempt.exerciseCompleted
                        : attempt.total > 0 && attempt.score === attempt.total,
                firstCompletion: Boolean(attempt.firstCompletion),
                userName: attempt.userName,
                answers: attempt.answers,
                exercise: buildPublicExercise(exerciseMap.get(String(attempt.exerciseRef)) || {}),
                durationText: formatDuration(attempt.durationSec),
            }));
        }

        return res.status(200).json({
            success: true,
            message: "Exercise history fetched successfully",
            data: items,
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to fetch history",
        });
    }
};

const submitExerciseAttempt = async (req, res) => {
    try {
        const { id } = req.params;
        const exercise = await getExerciseByObjectId(id);

        if (!exercise) {
            return res.status(404).json({
                success: false,
                message: "Exercise not found",
            });
        }

        const bodyAnswers = Array.isArray(req.body?.answers) ? req.body.answers : [];
        const answers = bodyAnswers
            .slice(0, exercise.questions.length)
            .map((item) => toSafeInt(item, -1));

        while (answers.length < exercise.questions.length) {
            answers.push(-1);
        }

        const durationSec = Math.max(0, toSafeInt(req.body?.durationSec, 0));
        const userId = req.user?.id;
        const userName = String(req.body?.userName || req.user?.fullName || "You").trim() || "You";

        if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized",
            });
        }

        const user = await User.findById(userId).select("currentLevel exp");
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            });
        }

        let score = 0;
        exercise.questions.forEach((question, index) => {
            if (answers[index] === question.correctIndex) {
                score += 1;
            }
        });

        const total = exercise.questions.length;
        const percent = total > 0 ? Math.round((score / total) * 100) : 0;
        const normalizedUserLevel = user.currentLevel || "A1";
        const rewardXp = Math.max(0, toSafeInt(exercise.rewardsXp, 0));
        const perfectScore = total > 0 && score === total;
        const levelQualified = isExerciseEligibleForXp(
            exercise.level,
            normalizedUserLevel
        );
        const userProgress = await getOrCreateUserProgress(userId, normalizedUserLevel);
        const progressIndex = userProgress.exerciseProgress.findIndex(
            (item) => String(item.exerciseId) === String(exercise.id)
        );
        const existingProgress =
            progressIndex >= 0 ? userProgress.exerciseProgress[progressIndex] : null;
        const alreadyCompleted = Boolean(existingProgress?.passed);
        const firstCompletion = perfectScore && !alreadyCompleted;
        const exerciseCompleted = alreadyCompleted || perfectScore;
        const xpAwarded = firstCompletion && levelQualified && rewardXp > 0;
        const earnedXp = xpAwarded ? rewardXp : 0;
        const xpReason = xpAwarded
            ? "awarded"
            : !perfectScore
                ? "not_perfect"
                : alreadyCompleted
                    ? "already_completed"
                    : !levelQualified
                        ? "level_not_eligible"
                        : rewardXp <= 0
                            ? "no_reward_configured"
                            : "not_awarded";
        const resultLabel =
            percent >= 85
                ? "Excellent"
                : percent >= 70
                    ? "Good Progress"
                    : percent >= 50
                        ? "Keep Going"
                        : "Needs Retry";

        if (progressIndex >= 0) {
            userProgress.exerciseProgress[progressIndex].score = Math.max(
                toSafeInt(existingProgress?.score, 0),
                percent
            );
            userProgress.exerciseProgress[progressIndex].passed =
                Boolean(existingProgress?.passed) || perfectScore;
            userProgress.exerciseProgress[progressIndex].submittedAt = new Date();
        } else {
            userProgress.exerciseProgress.push({
                exerciseId: exercise.id,
                score: percent,
                passed: perfectScore,
                submittedAt: new Date(),
            });
        }

        if (userProgress.currentLevel !== normalizedUserLevel) {
            userProgress.currentLevel = normalizedUserLevel;
        }

        await userProgress.save();

        let updatedUserExp = toSafeInt(user.exp, 0);
        if (xpAwarded && earnedXp > 0) {
            await User.updateOne(
                { _id: userId },
                { $inc: { exp: earnedXp } }
            );
            updatedUserExp += earnedXp;
        }

        const attempt = await ExerciseAttempt.create({
            exerciseRef: exercise.id,
            userId,
            userName,
            answers,
            score,
            total,
            percent,
            durationSec,
            earnedXp,
            perfectScore,
            xpAwarded,
            xpReason,
            exerciseCompleted,
            firstCompletion,
            submittedAt: new Date(),
        });

        if (firstCompletion && xpAwarded && earnedXp > 0) {
            try {
                await createInboxNotificationForUser(String(userId), {
                    title: "Hoàn thành xuất sắc bài tập",
                    body: `Lần đầu đạt điểm tối đa tại "${exercise.title}" — bạn nhận +${earnedXp} XP.`,
                    category: "milestone",
                    meta: {
                        kind: "exercise_first_perfect",
                        exerciseId: String(exercise.id),
                    },
                });
            } catch (err) {
                console.error("[Inbox] exercise milestone", err?.message || err);
            }
        }

        return res.status(201).json({
            success: true,
            message: "Exercise submitted successfully",
            data: {
                attemptId: String(attempt._id),
                score,
                total,
                percent,
                time: durationSec,
                earnedXp,
                perfectScore,
                xpAwarded,
                xpReason,
                exerciseCompleted,
                firstCompletion,
                userExp: updatedUserExp,
                resultLabel,
                answers,
            },
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to submit attempt",
        });
    }
};

const getExerciseReview = async (req, res) => {
    try {
        const { id } = req.params;
        const { answers = "" } = req.query;
        const exercise = await getExerciseByObjectId(id);

        if (!exercise) {
            return res.status(404).json({
                success: false,
                message: "Exercise not found",
            });
        }

        const parsedAnswers = String(answers)
            .split(",")
            .map((item) => toSafeInt(item, -1));

        const review = exercise.questions.map((question, index) => {
            const selectedIndex = Number.isFinite(parsedAnswers[index]) ? parsedAnswers[index] : -1;
            return {
                questionId: question.id,
                prompt: question.prompt,
                options: question.options,
                selectedIndex,
                selectedText:
                    selectedIndex >= 0 && selectedIndex < question.options.length
                        ? question.options[selectedIndex]
                        : null,
                correctIndex: question.correctIndex,
                correctText: question.options[question.correctIndex] || null,
                isCorrect: selectedIndex === question.correctIndex,
                explanation: question.explanation,
            };
        });

        return res.status(200).json({
            success: true,
            message: "Exercise review generated successfully",
            data: {
                exerciseId: exercise.id,
                review,
            },
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to generate review",
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
            durationMinutes = 8,
            rewardsXp = 0,
            skills = [],
            questions = [],
        } = req.body;

        if (!title || !type || !level) {
            return res.status(400).json({
                success: false,
                message: "title, type, and level are required",
            });
        }

        const coverImage = await resolveCoverImage(req);

        const exercise = await Exercise.create({
            title: String(title).trim(),
            description: String(description).trim(),
            type,
            level,
            topic: String(topic).trim() || "general",
            coverImage,
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
        if (payload.coverImage !== undefined || req.file) {
            exercise.coverImage = await resolveCoverImage(req);
        }
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

export {
    createAdminExercise,
    deleteAdminExercise,
    getAdminExercises,
    getExerciseById,
    getExerciseHints,
    getExerciseHistory,
    getExerciseLeaderboard,
    getExerciseReview,
    getExerciseSummary,
    getRecommendedExercises,
    listExercises,
    submitExerciseAttempt,
    updateAdminExercise,
};
