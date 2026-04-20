// Trận chiến boss (userId, mapId, HP, tasks, completion status, result, XP bonus, items unlocked)
import mongoose from "mongoose";

import { BOSS_RESULTS } from "./constants.js";

const bossBattleTaskSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    completed: { type: Boolean, default: false },
  },
  { _id: false }
);

const bossBattleSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    mapId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Map",
      required: true,
      index: true,
    },
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LearnConversation",
      required: true,
      unique: true,
    },
    bossName: { type: String, trim: true, default: "" },
    bossHPMax: { type: Number, default: 100, min: 1 },
    bossHPCurrent: { type: Number, default: 100, min: 0 },
    playerHPMax: { type: Number, default: 100, min: 1 },
    playerHPCurrent: { type: Number, default: 100, min: 0 },
    tasks: { type: [bossBattleTaskSchema], default: [] },
    tasksCompleted: { type: Number, default: 0, min: 0 },
    tasksRequired: { type: Number, default: 0, min: 0 },
    result: {
      type: String,
      enum: BOSS_RESULTS,
    },
    xpBonus: { type: Number, default: 0, min: 0 },
    itemsUnlocked: { type: [String], default: [] },
    attemptedAt: { type: Date, default: Date.now },
  },
  {
    collection: "boss_battles",
    timestamps: false,
  }
);

bossBattleSchema.index({ userId: 1, mapId: 1 });

export default mongoose.models.BossBattle ||
  mongoose.model("BossBattle", bossBattleSchema);
