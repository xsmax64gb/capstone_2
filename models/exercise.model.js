import mongoose from "mongoose";

import { LEVELS, EXERCISE_TYPES } from "./constants.js";

const exerciseQuestionSchema = new mongoose.Schema(
  {
    question: {
      type: String,
      required: true,
      trim: true,
    },
    options: {
      type: [String],
      default: [],
    },
    correctAnswer: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    explanation: {
      type: String,
      trim: true,
      default: "",
    },
    score: {
      type: Number,
      default: 1,
      min: 1,
    },
  },
  { _id: false }
);

const exerciseSchema = new mongoose.Schema(
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
    type: {
      type: String,
      enum: EXERCISE_TYPES,
      required: true,
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
    questions: {
      type: [exerciseQuestionSchema],
      default: [],
    },
    rewards: {
      exp: {
        type: Number,
        default: 0,
        min: 0,
      },
    },
  },
  {
    collection: "exercises",
    timestamps: true,
  }
);

exerciseSchema.index({ level: 1, topic: 1, type: 1 });

export default mongoose.models.Exercise || mongoose.model("Exercise", exerciseSchema);
