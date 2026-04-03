// Tin nhắn AI (KHÔNG DÙNG - thay thế bởi LearnMessage)
import mongoose from "mongoose";

import { AI_MESSAGE_SENDERS } from "./constants.js";

const aiMessageSchema = new mongoose.Schema(
  {
    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AiSession",
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    sender: {
      type: String,
      enum: AI_MESSAGE_SENDERS,
      required: true,
    },
    content: {
      type: String,
      required: true,
      trim: true,
    },
    correction: {
      type: String,
      trim: true,
      default: "",
    },
    score: {
      type: Number,
      default: null,
      min: 0,
      max: 10,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    collection: "ai_messages",
    timestamps: false,
  }
);

aiMessageSchema.index({ sessionId: 1, createdAt: 1 });

export default mongoose.models.AiMessage || mongoose.model("AiMessage", aiMessageSchema);
