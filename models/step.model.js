import mongoose from "mongoose";

import { LEARN_SCORING_DIFFICULTIES, STEP_TYPES } from "./constants.js";

const bossTaskSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
  },
  { _id: false }
);

const stepSchema = new mongoose.Schema(
  {
    mapId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Map",
      required: true,
      index: true,
    },
    order: { type: Number, required: true, default: 0 },
    title: { type: String, required: true, trim: true },
    type: { type: String, enum: STEP_TYPES, required: true },
    scenarioTitle: { type: String, trim: true, default: "" },
    scenarioContext: { type: String, trim: true, default: "" },
    scenarioScript: { type: String, trim: true, default: "" },
    aiPersona: { type: String, trim: true, default: "" },
    aiSystemPrompt: { type: String, trim: true, default: "" },
    openingMessage: { type: String, trim: true, default: "" },
    xpReward: { type: Number, default: 0, min: 0 },
    minTurns: { type: Number, default: 1, min: 0 },
    gradingDifficulty: {
      type: String,
      enum: LEARN_SCORING_DIFFICULTIES,
      default: "medium",
    },
    minimumPassScore: { type: Number, default: null, min: 0, max: 100 },
    passCriteria: { type: [String], default: [] },
    vocabularyFocus: { type: [String], default: [] },
    grammarFocus: { type: [String], default: [] },
    bossTasks: { type: [bossTaskSchema], default: [] },
    bossHPMax: { type: Number, default: 100, min: 1 },
    playerHPMax: { type: Number, default: 100, min: 1 },
    bossName: { type: String, trim: true, default: "" },
  },
  {
    collection: "steps",
    timestamps: false,
  }
);

stepSchema.index({ mapId: 1, order: 1 });

export default mongoose.models.Step || mongoose.model("Step", stepSchema);
