// Lịch sử cấp độ (userId, level, phương thức mở khóa, điểm số, thời gian)
import mongoose from "mongoose";

const LEVEL_NAMES = [
  "Beginner",
  "Elementary",
  "Pre-Intermediate",
  "Intermediate",
  "Upper-Intermediate",
  "Advanced",
];

const UNLOCK_METHODS = ["test_passed", "auto_advanced"];

const levelHistorySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    level: {
      type: Number,
      required: true,
      min: 1,
      max: 6,
    },
    levelName: {
      type: String,
      required: true,
      enum: LEVEL_NAMES,
    },
    unlockMethod: {
      type: String,
      required: true,
      enum: UNLOCK_METHODS,
    },
    testScore: {
      type: Number,
      min: 0,
      max: 100,
      default: null,
    },
    testAttemptId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LevelTestAttempt",
      default: null,
    },
    unlockedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
  },
  {
    collection: "level_history",
    timestamps: true,
  }
);

levelHistorySchema.index({ userId: 1, level: 1 });
levelHistorySchema.index({ userId: 1, unlockedAt: -1 });

export default mongoose.models.LevelHistory || mongoose.model("LevelHistory", levelHistorySchema);
