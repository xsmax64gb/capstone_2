import mongoose from "mongoose";

import { Exercise, ExerciseAttempt } from "../models/index.js";
import {
    DEFAULT_COVER_IMAGES,
    EXERCISE_SEED,
    GENERIC_HINTS,
} from "../helper/exercise.seed.js";

const toSafeInt = (value, fallback = 0) => {
    const parsed = Number.parseInt(String(value ?? ""), 10);
    return Number.isFinite(parsed) ? parsed : fallback;
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

const mapSeedQuestionToModel = (question, index) => {
    const options = Array.isArray(question?.options) ? question.options : [];
    const correctIndex = toSafeInt(question?.correctIndex, 0);
    const correctOption = options[correctIndex] ?? options[0] ?? "";

    return {
        prompt: question?.prompt || question?.question || `Question ${index + 1}`,
        question: question?.question || question?.prompt || `Question ${index + 1}`,
        options,
        correctIndex,
        correctAnswer: correctOption,
        explanation: question?.explanation || "",
        score: 1,
    };
};

const mapSeedExerciseToModel = (exercise) => {
    const questions = Array.isArray(exercise?.questions)
        ? exercise.questions.map((item, index) => mapSeedQuestionToModel(item, index))
        : [];

    return {
        title: exercise?.title || "Exercise",
        description: exercise?.description || "",
        type: exercise?.type || "mcq",
        level: exercise?.level || "A1",
        topic: exercise?.topic || "general",
        coverImage: exercise?.coverImage || DEFAULT_COVER_IMAGES[exercise?.topic] || DEFAULT_COVER_IMAGES.general,
        skills: Array.isArray(exercise?.skills) ? exercise.skills : [],
        durationMinutes: toSafeInt(exercise?.durationMinutes, 8),
        questionCount: questions.length,
        rewardsXp: toSafeInt(exercise?.rewardsXp, 0),
        questions,
        rewards: {
            exp: toSafeInt(exercise?.rewardsXp, 0),
        },
    };
};

const ensureExercisesSeeded = async () => {
    const total = await Exercise.countDocuments();
    if (total > 0) {
        return;
    }

    const payload = EXERCISE_SEED.map((item) => mapSeedExerciseToModel(item));
    if (payload.length > 0) {
        await Exercise.insertMany(payload);
    }
};

const getExercises = async () => {
    await ensureExercisesSeeded();
    const dbItems = await Exercise.find({}).lean();
    return dbItems.map((item, index) => normalizeExercise(item, index));
};

const getExerciseByObjectId = async (id) => {
    await ensureExercisesSeeded();

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

        return res.status(200).json({
            success: true,
            message: "Exercises fetched successfully",
            data: {
                items: includeQuestions === "true" ? rows : rows.map(buildPublicExercise),
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
        const all = await getExercises();
        const limit = Math.min(20, Math.max(1, toSafeInt(req.query.limit, 3)));
        const userId = req.user?.id;

        let attempts = [];
        if (userId && mongoose.Types.ObjectId.isValid(userId)) {
            attempts = await ExerciseAttempt.find({ userId })
                .select("exerciseRef score total")
                .lean();
        }

        const items = pickRecommendedByAttempts(all, attempts, limit).map(buildPublicExercise);

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

        return res.status(200).json({
            success: true,
            message: "Exercise detail fetched successfully",
            data: {
                exercise,
                related,
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

        let score = 0;
        exercise.questions.forEach((question, index) => {
            if (answers[index] === question.correctIndex) {
                score += 1;
            }
        });

        const total = exercise.questions.length;
        const percent = total > 0 ? Math.round((score / total) * 100) : 0;
        const earnedXp = Math.round((Math.max(0, Math.min(100, percent)) / 100) * exercise.rewardsXp);
        const resultLabel =
            percent >= 85
                ? "Excellent"
                : percent >= 70
                    ? "Good Progress"
                    : percent >= 50
                        ? "Keep Going"
                        : "Needs Retry";

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
            submittedAt: new Date(),
        });

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

export {
    getExerciseById,
    getExerciseHints,
    getExerciseHistory,
    getExerciseLeaderboard,
    getExerciseReview,
    getExerciseSummary,
    getRecommendedExercises,
    listExercises,
    submitExerciseAttempt,
};
