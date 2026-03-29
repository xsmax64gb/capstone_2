import mongoose from "mongoose";

import { LEVELS, PLACEMENT_SKILL_TYPES } from "./constants.js";

const PLACEMENT_QUESTION_TYPES = ["mcq", "true_false", "fill_blank"];

const placementQuestionSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
      trim: true,
    },
    prompt: {
      type: String,
      required: true,
      trim: true,
    },
    instruction: {
      type: String,
      trim: true,
      default: "",
    },
    passage: {
      type: String,
      trim: true,
      default: "",
    },
    type: {
      type: String,
      enum: PLACEMENT_QUESTION_TYPES,
      default: "mcq",
    },
    options: {
      type: [String],
      default: [],
      validate: {
        validator: (options) => Array.isArray(options) && options.length >= 2,
        message: "Placement test questions must have at least 2 options",
      },
    },
    correctOptionIndex: {
      type: Number,
      required: true,
      min: 0,
    },
    skillType: {
      type: String,
      enum: PLACEMENT_SKILL_TYPES,
      required: true,
    },
    targetLevel: {
      type: String,
      enum: LEVELS,
      default: "A1",
    },
    weight: {
      type: Number,
      default: 1,
      min: 1,
    },
    explanation: {
      type: String,
      trim: true,
      default: "",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { _id: false }
);

const placementLevelRuleSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
      trim: true,
    },
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
    instructions: {
      type: String,
      trim: true,
      default: "",
    },
    durationMinutes: {
      type: Number,
      default: 10,
      min: 1,
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
      default: false,
    },
  },
  {
    collection: "placement_tests",
    timestamps: true,
  }
);

placementTestSchema.index({ isActive: 1, updatedAt: -1 });

export default mongoose.models.PlacementTest ||
  mongoose.model("PlacementTest", placementTestSchema);
