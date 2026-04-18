// Kết quả làm bài tập của user (answers, score, percent, duration, XP earned)
import mongoose from "mongoose";

const exerciseAttemptSchema = new mongoose.Schema(
    {
        exerciseRef: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Exercise",
            required: true,
            index: true,
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        userName: {
            type: String,
            trim: true,
            default: "",
        },
        answers: {
            type: [Number],
            default: [],
        },
        score: {
            type: Number,
            required: true,
            min: 0,
            default: 0,
        },
        total: {
            type: Number,
            required: true,
            min: 0,
            default: 0,
        },
        percent: {
            type: Number,
            required: true,
            min: 0,
            max: 100,
            default: 0,
        },
        durationSec: {
            type: Number,
            required: true,
            min: 0,
            default: 0,
        },
        earnedXp: {
            type: Number,
            required: true,
            min: 0,
            default: 0,
        },
        perfectScore: {
            type: Boolean,
            default: false,
        },
        xpAwarded: {
            type: Boolean,
            default: false,
        },
        xpReason: {
            type: String,
            trim: true,
            default: "not_perfect",
        },
        exerciseCompleted: {
            type: Boolean,
            default: false,
        },
        firstCompletion: {
            type: Boolean,
            default: false,
        },
        submittedAt: {
            type: Date,
            default: Date.now,
            index: true,
        },
    },
    {
        collection: "exercise_attempts",
        timestamps: true,
    }
);

exerciseAttemptSchema.index({ userId: 1, submittedAt: -1 });
exerciseAttemptSchema.index({ exerciseRef: 1, submittedAt: -1 });

export default mongoose.models.ExerciseAttempt ||
    mongoose.model("ExerciseAttempt", exerciseAttemptSchema);
