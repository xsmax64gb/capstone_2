import mongoose from "mongoose";

const OTP_PURPOSES = ["register", "change_password"];

const otpSchema = new mongoose.Schema(
    {
        email: {
            type: String,
            required: true,
            lowercase: true,
            trim: true,
            index: true,
        },
        purpose: {
            type: String,
            enum: OTP_PURPOSES,
            required: true,
            index: true,
        },
        codeHash: {
            type: String,
            required: true,
        },
        expiresAt: {
            type: Date,
            required: true,
        },
    },
    {
        collection: "otps",
        timestamps: true,
    }
);

otpSchema.index({ email: 1, purpose: 1 }, { unique: true });
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export { OTP_PURPOSES };
export default mongoose.models.Otp || mongoose.model("Otp", otpSchema);
