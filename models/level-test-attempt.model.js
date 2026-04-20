// Lần thử kiểm tra cấp độ (userId, testId, câu trả lời, điểm số, kết quả)
import mongoose from "mongoose";

const levelTestAttemptAnswerSchema = new mongoose.Schema(
  {
    sectionIndex: {
      type: Number,
      required: true,
      min: 0,
    },
    questionIndex: {
      type: Number,
      required: true,
      min: 0,
    },
    userAnswer: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    isCorrect: {
      type: Boolean,
      default: false,
    },
    pointsEarned: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { _id: false }
);

const levelTestAttemptSectionScoreSchema = new mongoose.Schema(
  {
    sectionName: {
      type: String,
      required: true,
      trim: true,
    },
    score: {
      type: Number,
      required: true,
      min: 0,
    },
    maxScore: {
      type: Number,
      required: true,
      min: 0,
    },
    percentage: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
  },
  { _id: false }
);

const levelTestAttemptSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    testId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LevelTest",
      required: true,
    },
    level: {
      type: Number,
      required: true,
      min: 1,
      max: 6,
    },
    answers: {
      type: [levelTestAttemptAnswerSchema],
      default: [],
    },
    sectionScores: {
      type: [levelTestAttemptSectionScoreSchema],
      default: [],
    },
    totalScore: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    passed: {
      type: Boolean,
      required: true,
    },
    startedAt: {
      type: Date,
      required: true,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    timeSpent: {
      type: Number, // in seconds
      default: 0,
      min: 0,
    },
  },
  {
    collection: "level_test_attempts",
    timestamps: true,
  }
);

levelTestAttemptSchema.index({ userId: 1, level: 1, createdAt: -1 });
levelTestAttemptSchema.index({ testId: 1 });

export default mongoose.models.LevelTestAttempt ||
  mongoose.model("LevelTestAttempt", levelTestAttemptSchema);
