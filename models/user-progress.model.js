// Tiến độ học tập tổng hợp của user (stages, vocabulary, exercise progress)
import mongoose from "mongoose";

import { LEVELS, PROGRESS_STATUSES } from "./constants.js";

const completedStageSchema = new mongoose.Schema(
  {
    level: {
      type: String,
      enum: LEVELS,
      required: true,
    },
    stageId: {
      type: String,
      required: true,
      trim: true,
    },
    bestScore: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    passed: {
      type: Boolean,
      default: false,
    },
    completedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const vocabularyProgressSchema = new mongoose.Schema(
  {
    vocabularyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vocabulary",
      required: true,
    },
    status: {
      type: String,
      enum: PROGRESS_STATUSES,
      default: "learning",
    },
    lastReviewedAt: {
      type: Date,
      default: null,
    },
  },
  { _id: false }
);

const exerciseProgressSchema = new mongoose.Schema(
  {
    exerciseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Exercise",
      required: true,
    },
    score: {
      type: Number,
      default: 0,
      min: 0,
    },
    passed: {
      type: Boolean,
      default: false,
    },
    submittedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const userProgressSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    unlockedLevels: {
      type: [
        {
          type: String,
          enum: LEVELS,
        },
      ],
      default: ["A1"],
    },
    currentLevel: {
      type: String,
      enum: LEVELS,
      default: "A1",
    },
    completedStages: {
      type: [completedStageSchema],
      default: [],
    },
    vocabularyProgress: {
      type: [vocabularyProgressSchema],
      default: [],
    },
    exerciseProgress: {
      type: [exerciseProgressSchema],
      default: [],
    },
  },
  {
    collection: "user_progress",
    timestamps: true,
  }
);

userProgressSchema.index({ currentLevel: 1 });

export default mongoose.models.UserProgress || mongoose.model("UserProgress", userProgressSchema);
