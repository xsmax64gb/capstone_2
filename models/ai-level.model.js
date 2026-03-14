import mongoose from "mongoose";

import { LEVELS, AI_STAGE_TYPES } from "./constants.js";

const aiStageSchema = new mongoose.Schema(
  {
    stageId: {
      type: String,
      required: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    order: {
      type: Number,
      required: true,
      min: 1,
    },
    type: {
      type: String,
      enum: AI_STAGE_TYPES,
      default: "normal",
    },
    context: {
      type: String,
      required: true,
      trim: true,
    },
    aiRole: {
      type: String,
      required: true,
      trim: true,
    },
    objective: {
      type: String,
      required: true,
      trim: true,
    },
    systemPrompt: {
      type: String,
      required: true,
      trim: true,
    },
    suggestedVocabulary: {
      type: [String],
      default: [],
    },
    passRules: {
      minScore: {
        type: Number,
        default: 60,
        min: 0,
        max: 100,
      },
      minTurns: {
        type: Number,
        default: 4,
        min: 1,
      },
    },
    rewards: {
      exp: {
        type: Number,
        default: 0,
        min: 0,
      },
      unlockNextLevel: {
        type: String,
        default: null,
        validate: {
          validator: (value) => value === null || LEVELS.includes(value),
          message: "unlockNextLevel must be a valid CEFR level or null",
        },
      },
    },
  },
  { _id: false }
);

const aiLevelSchema = new mongoose.Schema(
  {
    level: {
      type: String,
      enum: LEVELS,
      required: true,
      unique: true,
    },
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
    unlockRequirement: {
      minPlacementLevel: {
        type: String,
        enum: LEVELS,
        required: true,
      },
    },
    stages: {
      type: [aiStageSchema],
      default: [],
      validate: {
        validator: (stages) => {
          const stageIds = stages.map((stage) => stage.stageId);
          return stageIds.length === new Set(stageIds).size;
        },
        message: "Each stageId must be unique inside an ai level document",
      },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    collection: "ai_levels",
    timestamps: true,
  }
);

aiLevelSchema.index({ isActive: 1 });

export default mongoose.models.AiLevel || mongoose.model("AiLevel", aiLevelSchema);
