import mongoose from "mongoose";

import { LEARN_MESSAGE_ROLES } from "./constants.js";

const learnMessageSchema = new mongoose.Schema(
  {
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LearnConversation",
      required: true,
      index: true,
    },
    role: {
      type: String,
      enum: LEARN_MESSAGE_ROLES,
      required: true,
    },
    content: { type: String, required: true, trim: true },
    timestamp: { type: Date, default: Date.now },
    grammarErrors: {
      type: [
        {
          message: { type: String, trim: true, default: "" },
          rule: { type: String, trim: true, default: "" },
          span: { type: String, trim: true, default: "" },
        },
      ],
      default: [],
    },
    vocabularyUsed: { type: [String], default: [] },
    pronunciationScore: { type: Number, default: null, min: 0, max: 100 },
    suggestion: { type: String, trim: true, default: "" },
    audioUrl: { type: String, trim: true, default: "" },
    evaluationScore: { type: Number, default: null, min: 0, max: 100 },
  },
  {
    collection: "messages",
    timestamps: false,
  }
);

learnMessageSchema.index({ conversationId: 1, timestamp: 1 });

export default mongoose.models.LearnMessage ||
  mongoose.model("LearnMessage", learnMessageSchema);
