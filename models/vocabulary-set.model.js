// Bộ từ vựng (name, description, level, topic, image, isActive, sortOrder)
import mongoose from "mongoose";

import { LEVELS, VOCABULARY_SET_SOURCES } from "./constants.js";

const vocabularySetSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    level: {
      type: String,
      enum: LEVELS,
      default: "A1",
    },
    topic: {
      type: String,
      trim: true,
      default: "general",
    },
    coverImageUrl: {
      type: String,
      trim: true,
      default: "",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    sortOrder: {
      type: Number,
      default: 0,
      min: 0,
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    source: {
      type: String,
      enum: VOCABULARY_SET_SOURCES,
      default: "catalog",
    },
    aiMeta: {
      topic: { type: String, trim: true, default: "" },
      additionalInstruction: { type: String, trim: true, default: "" },
      includePronunciation: { type: Boolean, default: false },
      includeMeaning: { type: Boolean, default: true },
      includeExample: { type: Boolean, default: false },
    },
  },
  {
    collection: "vocabulary_sets",
    timestamps: true,
  }
);

vocabularySetSchema.index({ name: 1 });
vocabularySetSchema.index({ level: 1, topic: 1, isActive: 1 });
vocabularySetSchema.index({ updatedAt: -1 });
vocabularySetSchema.index({ ownerId: 1, updatedAt: -1 });

export default mongoose.models.VocabularySet || mongoose.model("VocabularySet", vocabularySetSchema);
