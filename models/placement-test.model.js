import mongoose from "mongoose";

import { LEVELS, PLACEMENT_SKILL_TYPES } from "./constants.js";

const placementQuestionSchema = new mongoose.Schema(
  {
    question: {
      type: String,
      required: true,
      trim: true,
    },
    options: {
      type: [String],
      required: true,
      validate: {
        validator: (options) => Array.isArray(options) && options.length >= 2,
        message: "Placement test questions must have at least 2 options",
      },
    },
    correctAnswer: {
      type: String,
      required: true,
      trim: true,
    },
    skillType: {
      type: String,
      enum: PLACEMENT_SKILL_TYPES,
      required: true,
    },
    score: {
      type: Number,
      default: 1,
      min: 1,
    },
  },
  { _id: false }
);

const placementLevelRuleSchema = new mongoose.Schema(
  {
    minScore: {
      type: Number,
      required: true,
      min: 0,
    },
    maxScore: {
      type: Number,
      required: true,
      min: 0,
    },
    level: {
      type: String,
      enum: LEVELS,
      required: true,
    },
  },
  { _id: false }
);

const placementTestSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    questions: {
      type: [placementQuestionSchema],
      default: [],
    },
    levelRules: {
      type: [placementLevelRuleSchema],
      default: [],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    collection: "placement_tests",
    timestamps: true,
  }
);

placementTestSchema.index({ isActive: 1, createdAt: -1 });

export default mongoose.models.PlacementTest || mongoose.model("PlacementTest", placementTestSchema);
