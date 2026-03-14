import mongoose from "mongoose";

const exerciseAttemptSchema = new mongoose.Schema(
  {
    exerciseId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    exerciseRef: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Exercise",
      default: null,
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
exerciseAttemptSchema.index({ exerciseId: 1, submittedAt: -1 });

export default mongoose.models.ExerciseAttempt ||
  mongoose.model("ExerciseAttempt", exerciseAttemptSchema);
