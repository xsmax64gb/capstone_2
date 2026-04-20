// Cấp độ người dùng (level, XP, ngưỡng, trạng thái kiểm tra)
import mongoose from "mongoose";

const userLevelSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    currentLevel: {
      type: Number,
      required: true,
      default: 1,
      min: 1,
      max: 6,
    },
    totalXp: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    // Cached for performance
    nextLevelThreshold: {
      type: Number,
      required: true,
    },
    // Track if user is eligible for test
    testAvailable: {
      type: Boolean,
      default: false,
    },
    // For retry logic
    lastTestAttemptAt: {
      type: Date,
      default: null,
    },
    // For retry XP requirement
    xpAtLastFailedTest: {
      type: Number,
      default: null,
    },
  },
  {
    collection: "user_levels",
    timestamps: true,
  }
);

userLevelSchema.index({ currentLevel: 1 });

export default mongoose.models.UserLevel || mongoose.model("UserLevel", userLevelSchema);
