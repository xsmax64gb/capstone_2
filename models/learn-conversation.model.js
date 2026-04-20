// Cuộc hội thoại học tập (userId, stepId, mapId, status, score, XP earned, mistakes)
import mongoose from "mongoose";

import { LEARN_CONVERSATION_STATUSES } from "./constants.js";

const learnConversationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    stepId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Step",
      required: true,
      index: true,
    },
    mapId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Map",
      required: true,
      index: true,
    },
    attempt: { type: Number, default: 1, min: 1 },
    startedAt: { type: Date, default: Date.now },
    endedAt: { type: Date, default: null },
    durationSec: { type: Number, default: null, min: 0 },
    status: {
      type: String,
      enum: LEARN_CONVERSATION_STATUSES,
      default: "in_progress",
    },
    xpEarned: { type: Number, default: 0, min: 0 },
    score: { type: Number, default: null, min: 0, max: 100 },
    aiFeedback: { type: String, trim: true, default: "" },
    mistakeCount: { type: Number, default: 0, min: 0 },
    goalsAchieved: { type: [String], default: [] },
  },
  {
    collection: "conversations",
    timestamps: false,
  }
);

learnConversationSchema.index({ userId: 1, stepId: 1 });
learnConversationSchema.index({ userId: 1, status: 1 });

export default mongoose.models.LearnConversation ||
  mongoose.model("LearnConversation", learnConversationSchema);
