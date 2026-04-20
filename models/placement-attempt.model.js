// Kết quả kiểm tra trình độ của user (answers, scores, pass status, profile snapshot)
import mongoose from "mongoose";

import { LEVELS, PLACEMENT_SKILL_TYPES } from "./constants.js";

const placementProfileSnapshotSchema = new mongoose.Schema(
  {
    selectedLanguage: {
      type: String,
      trim: true,
      default: "vi",
    },
    selectedLevel: {
      type: String,
      enum: LEVELS,
      default: "A1",
    },
    weeklyHours: {
      type: Number,
      default: 0,
      min: 0,
    },
    displayName: {
      type: String,
      trim: true,
      default: "",
    },
    jobTitle: {
      type: String,
      trim: true,
      default: "",
    },
    selectedGoals: {
      type: [String],
      default: [],
    },
    startedAt: {
      type: Date,
      default: null,
    },
  },
  { _id: false }
);

const placementAnswerSchema = new mongoose.Schema(
  {
    questionId: {
      type: String,
      required: true,
      trim: true,
    },
    selectedOptionIndex: {
      type: Number,
      default: null,
      min: 0,
    },
    isCorrect: {
      type: Boolean,
      default: false,
    },
    earnedScore: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { _id: false }
);

const placementSkillBreakdownSchema = new mongoose.Schema(
  {
    skillType: {
      type: String,
      enum: PLACEMENT_SKILL_TYPES,
      required: true,
    },
    earnedScore: {
      type: Number,
      default: 0,
      min: 0,
    },
    maxScore: {
      type: Number,
      default: 0,
      min: 0,
    },
    percent: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
  },
  { _id: false }
);

const placementAttemptSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    testId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PlacementTest",
      default: null,
    },
    testTitle: {
      type: String,
      trim: true,
      default: "",
    },
    status: {
      type: String,
      enum: ["pending_confirmation", "confirmed", "skipped"],
      default: "pending_confirmation",
    },
    skipped: {
      type: Boolean,
      default: false,
    },
    profileSnapshot: {
      type: placementProfileSnapshotSchema,
      default: null,
    },
    answers: {
      type: [placementAnswerSchema],
      default: [],
    },
    rawScore: {
      type: Number,
      default: 0,
      min: 0,
    },
    maxScore: {
      type: Number,
      default: 0,
      min: 0,
    },
    percent: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    detectedLevel: {
      type: String,
      enum: LEVELS,
      default: "A1",
    },
    confirmedLevel: {
      type: String,
      enum: LEVELS,
      default: null,
    },
    skillBreakdown: {
      type: [placementSkillBreakdownSchema],
      default: [],
    },
    completedAt: {
      type: Date,
      default: null,
    },
    confirmedAt: {
      type: Date,
      default: null,
    },
  },
  {
    collection: "placement_attempts",
    timestamps: true,
  }
);

placementAttemptSchema.index({ userId: 1, createdAt: -1 });
placementAttemptSchema.index({ userId: 1, status: 1, createdAt: -1 });

export default mongoose.models.PlacementAttempt ||
  mongoose.model("PlacementAttempt", placementAttemptSchema);
