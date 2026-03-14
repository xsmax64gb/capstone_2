import mongoose from "mongoose";

import { LEVELS, EXERCISE_TYPES } from "./constants.js";

const exerciseQuestionSchema = new mongoose.Schema(
  {
    prompt: {
      type: String,
      trim: true,
      default: "",
    },
    question: {
      type: String,
      required: false,
      trim: true,
      default: "",
    },
    options: {
      type: [String],
      default: [],
    },
    correctAnswer: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    correctIndex: {
      type: Number,
      min: 0,
      default: null,
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
  { _id: true }
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
    coverImage: {
      type: String,
      trim: true,
      default: "",
    },
    skills: {
      type: [String],
      default: [],
    },
    durationMinutes: {
      type: Number,
      min: 1,
      default: 8,
    },
    questionCount: {
      type: Number,
      min: 0,
      default: 0,
    },
    rewardsXp: {
      type: Number,
      min: 0,
      default: null,
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

exerciseSchema.pre("save", function updateDerivedFields(next) {
  if (!this.questionCount || this.questionCount <= 0) {
    this.questionCount = Array.isArray(this.questions) ? this.questions.length : 0;
  }

  if (this.rewardsXp === null || this.rewardsXp === undefined) {
    this.rewardsXp = this.rewards?.exp ?? 0;
  }

  if ((!this.rewards || this.rewards.exp === undefined || this.rewards.exp === null) && this.rewardsXp !== null) {
    this.rewards = {
      exp: this.rewardsXp,
    };
  }

  next();
});

export default mongoose.models.Exercise || mongoose.model("Exercise", exerciseSchema);
