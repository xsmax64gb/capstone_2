// Phiên hội thoại AI của user (level, stage, score, feedback: grammar, vocabulary, fluency, relevance)
import mongoose from "mongoose";

import { LEVELS, AI_SESSION_STATUSES } from "./constants.js";

const aiSessionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    aiLevelId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AiLevel",
      default: null,
    },
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
    stageName: {
      type: String,
      required: true,
      trim: true,
    },
    startedAt: {
      type: Date,
      default: Date.now,
    },
    endedAt: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: AI_SESSION_STATUSES,
      default: "in_progress",
    },
    totalScore: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    passed: {
      type: Boolean,
      default: false,
    },
    feedback: {
      grammar: {
        type: Number,
        default: 0,
        min: 0,
        max: 100,
      },
      vocabulary: {
        type: Number,
        default: 0,
        min: 0,
        max: 100,
      },
      fluency: {
        type: Number,
        default: 0,
        min: 0,
        max: 100,
      },
      relevance: {
        type: Number,
        default: 0,
        min: 0,
        max: 100,
      },
      summary: {
        type: String,
        trim: true,
        default: "",
      },
    },
    totalTurns: {
      type: Number,
      default: 0,
      min: 0,
    },
    lastMessageAt: {
      type: Date,
      default: null,
    },
  },
  {
    collection: "ai_sessions",
    timestamps: true,
  }
);

aiSessionSchema.index({ userId: 1, status: 1, createdAt: -1 });
aiSessionSchema.index({ userId: 1, level: 1, stageId: 1 });

export default mongoose.models.AiSession || mongoose.model("AiSession", aiSessionSchema);
