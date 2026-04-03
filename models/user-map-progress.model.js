// Tiến độ user trên map (status: locked/active/completed, current step, XP earned, stars, boss defeated)
import mongoose from "mongoose";

import { MAP_PROGRESS_STATUSES } from "./constants.js";

const userMapProgressSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    mapId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Map",
      required: true,
    },
    status: {
      type: String,
      enum: MAP_PROGRESS_STATUSES,
      default: "locked",
    },
    unlockedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    currentStepId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Step",
      default: null,
    },
    totalXPEarned: { type: Number, default: 0, min: 0 },
    stepsCompleted: { type: Number, default: 0, min: 0 },
    bossDefeated: { type: Boolean, default: false },
    bossAttempts: { type: Number, default: 0, min: 0 },
    stars: { type: Number, default: 0, min: 0, max: 3 },
    updatedAt: { type: Date, default: Date.now },
  },
  {
    collection: "user_map_progress",
    timestamps: false,
  }
);

userMapProgressSchema.index({ userId: 1, mapId: 1 }, { unique: true });
userMapProgressSchema.index({ userId: 1, status: 1 });

export default mongoose.models.UserMapProgress ||
  mongoose.model("UserMapProgress", userMapProgressSchema);
