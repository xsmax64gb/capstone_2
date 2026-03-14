import mongoose from "mongoose";

import { LEVELS } from "./constants.js";

const vocabularySchema = new mongoose.Schema(
  {
    word: {
      type: String,
      required: true,
      trim: true,
    },
    meaning: {
      type: String,
      required: true,
      trim: true,
    },
    phonetic: {
      type: String,
      trim: true,
      default: "",
    },
    example: {
      type: String,
      trim: true,
      default: "",
    },
    level: {
      type: String,
      enum: LEVELS,
      required: true,
    },
    topic: {
      type: String,
      trim: true,
      default: "general",
    },
    imageUrl: {
      type: String,
      trim: true,
      default: "",
    },
    audioUrl: {
      type: String,
      trim: true,
      default: "",
    },
  },
  {
    collection: "vocabularies",
    timestamps: true,
  }
);

vocabularySchema.index({ level: 1, topic: 1 });
vocabularySchema.index({ word: 1, level: 1 });

export default mongoose.models.Vocabulary || mongoose.model("Vocabulary", vocabularySchema);
