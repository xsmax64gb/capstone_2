// Kết quả làm bài từ vựng (mode: flashcards/quiz, answers, score, duration)
import mongoose from "mongoose";

const vocabularyAttemptSchema = new mongoose.Schema(
  {
    setId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "VocabularySet",
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    userName: {
      type: String,
      trim: true,
      default: "",
    },
    mode: {
      type: String,
      enum: ["flashcards", "quiz"],
      required: true,
    },
    answers: {
      type: [
        {
          wordId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Vocabulary",
            required: true,
          },
          selectedIndex: {
            type: Number,
            default: null,
          },
          selectedText: {
            type: String,
            default: "",
          },
          correct: {
            type: Boolean,
            required: true,
          },
        },
      ],
      default: [],
    },
    score: {
      type: Number,
      default: 0,
      min: 0,
    },
    total: {
      type: Number,
      default: 0,
      min: 0,
    },
    percent: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    durationSec: {
      type: Number,
      default: 0,
      min: 0,
    },
    earnedXp: {
      type: Number,
      default: 0,
      min: 0,
    },
    submittedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    collection: "vocabulary_attempts",
    timestamps: true,
  }
);

vocabularyAttemptSchema.index({ userId: 1, submittedAt: -1 });
vocabularyAttemptSchema.index({ setId: 1, submittedAt: -1 });

export default mongoose.models.VocabularyAttempt ||
  mongoose.model("VocabularyAttempt", vocabularyAttemptSchema);
