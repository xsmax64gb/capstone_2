// Lưu thông tin người dùng (email, mật khẩu, tên, role, cấp độ, exp, avatar, bio)
import mongoose from "mongoose";

import { LEVELS, USER_ROLES } from "./constants.js";

const userSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: USER_ROLES,
      default: "user",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    deactivatedAt: {
      type: Date,
      default: null,
    },
    currentLevel: {
      type: String,
      enum: LEVELS,
      default: "A1",
    },
    exp: {
      type: Number,
      default: 0,
      min: 0,
    },
    onboardingDone: { //test trình độ đầu vào
      type: Boolean,
      default: false,
    },
    placementScore: {
      type: Number,
      default: 0,
      min: 0,
    },
    placementCompletedAt: {
      type: Date,
      default: null,
    },
    avatarUrl: {
      type: String,
      trim: true,
      default: "",
    },
    bio: {
      type: String,
      trim: true,
      default: "",
      maxlength: 500,
    },
    nativeLanguage: {
      type: String,
      trim: true,
      default: "",
    },
    timezone: {
      type: String,
      trim: true,
      default: "",
    },
    targetLanguage: {
      type: String,
      trim: true,
      default: "en",
    },
    streakDays: {
      type: Number,
      default: 0,
      min: 0,
    },
    lastActiveAt: {
      type: Date,
      default: null,
    },
  },
  {
    collection: "users",
    timestamps: true,
  }
);

userSchema.index({ role: 1, isActive: 1, currentLevel: 1 });

export default mongoose.models.User || mongoose.model("User", userSchema);
