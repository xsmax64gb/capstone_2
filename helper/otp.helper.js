import crypto from "crypto";
import sendgridMail from "@sendgrid/mail";

import { Otp } from "../models/index.js";

const OTP_EXPIRES_MINUTES = Number(process.env.OTP_EXPIRES_MINUTES || 10);

const toOtpHash = (code) => {
    return crypto.createHash("sha256").update(String(code)).digest("hex");
};

const generateOtpCode = () => {
    return String(Math.floor(100000 + Math.random() * 900000));
};

const ensureSendGridConfigured = () => {
    const apiKey = process.env.SENDGRID_API_KEY;
    const fromEmail = process.env.SENDGRID_FROM_EMAIL;

    if (!apiKey) {
        throw new Error("SENDGRID_API_KEY is not configured");
    }

    if (!fromEmail) {
        throw new Error("SENDGRID_FROM_EMAIL is not configured");
    }

    sendgridMail.setApiKey(apiKey);
    return fromEmail;
};

const getSendGridErrorInfo = (error) => {
    const responseBody = error?.response?.body || null;
    const statusCode = error?.code || error?.response?.statusCode || "unknown";
    const firstError = Array.isArray(responseBody?.errors) ? responseBody.errors[0] : null;

    return {
        statusCode,
        responseBody,
        detailMessage: firstError?.message || error?.message || "SendGrid request failed",
        detailField: firstError?.field || null,
        detailHelp: firstError?.help || null,
    };
};

const sendOtpEmail = async ({ email, code, purpose }) => {
    try {
        const fromEmail = ensureSendGridConfigured();
        const emailTitle = purpose === "register" ? "Register OTP" : "Password Change OTP";

        await sendgridMail.send({
            to: email,
            from: fromEmail,
            subject: `[ELapp] ${emailTitle}`,
            text: `Your OTP code is: ${code}. It will expire in ${OTP_EXPIRES_MINUTES} minutes.`,
            html: `<p>Your OTP code is: <strong>${code}</strong></p><p>This code will expire in ${OTP_EXPIRES_MINUTES} minutes.</p>`,
        });
    } catch (error) {
        const {
            statusCode,
            responseBody,
            detailMessage,
            detailField,
            detailHelp,
        } = getSendGridErrorInfo(error);

        console.error("[OTP][SendGrid] Failed to send OTP email", {
            purpose,
            toEmail: email,
            statusCode,
            responseBody,
            detailMessage,
            detailField,
            detailHelp,
            rawError: error?.message,
        });

        if (responseBody) {
            console.error("[OTP][SendGrid] Response body", JSON.stringify(responseBody, null, 2));
        }

        throw new Error(`SendGrid error (${statusCode}): ${detailMessage}`);
    }
};

const issueOtp = async ({ email, purpose }) => {
    const code = generateOtpCode();
    const codeHash = toOtpHash(code);
    const expiresAt = new Date(Date.now() + OTP_EXPIRES_MINUTES * 60 * 1000);

    await Otp.findOneAndUpdate(
        { email, purpose },
        {
            email,
            purpose,
            codeHash,
            expiresAt,
        },
        {
            upsert: true,
            new: true,
            setDefaultsOnInsert: true,
        }
    );

    await sendOtpEmail({ email, code, purpose });
};

const verifyOtp = async ({ email, purpose, code }) => {
    const otp = await Otp.findOne({ email, purpose });

    if (!otp) {
        return { valid: false, message: "OTP not found or expired" };
    }

    if (otp.expiresAt.getTime() <= Date.now()) {
        await Otp.deleteOne({ _id: otp._id });
        return { valid: false, message: "OTP has expired" };
    }

    if (otp.codeHash !== toOtpHash(code)) {
        return { valid: false, message: "Invalid OTP" };
    }

    await Otp.deleteOne({ _id: otp._id });
    return { valid: true };
};

export {
    issueOtp,
    verifyOtp,
};
