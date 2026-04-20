// Huy hiệu cấp độ (userId, level, biểu tượng, phương thức mở khóa)
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

const levelBadgeSchema = new mongoose.Schema(
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
    badgeIcon: {
      type: String,
      required: true,
      default: "/badges/default.svg",
    },
    unlockMethod: {
      type: String,
      required: true,
      enum: UNLOCK_METHODS,
    },
    unlockedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
  },
  {
    collection: "level_badges",
    timestamps: true,
  }
);

levelBadgeSchema.index({ userId: 1, level: 1 }, { unique: true });

export default mongoose.models.LevelBadge || mongoose.model("LevelBadge", levelBadgeSchema);
