import mongoose from "mongoose";

import { OTP_TYPES } from "./constants.js";

const otpSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    code: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: OTP_TYPES,
      required: true,
    },
    expiredAt: {
      type: Date,
      required: true,
    },
    used: {
      type: Boolean,
      default: false,
    },
    usedAt: {
      type: Date,
      default: null,
    },
  },
  {
    collection: "otps",
    timestamps: true,
  }
);

otpSchema.index({ email: 1, type: 1, used: 1 });
otpSchema.index({ expiredAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.models.Otp || mongoose.model("Otp", otpSchema);
