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
    const fromName = process.env.SENDGRID_FROM_NAME || "SmartLingo";

    if (!apiKey) {
        throw new Error("SENDGRID_API_KEY is not configured");
    }

    if (!fromEmail) {
        throw new Error("SENDGRID_FROM_EMAIL is not configured");
    }

    sendgridMail.setApiKey(apiKey);
    return {
        fromEmail,
        fromName,
    };
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
                const { fromEmail, fromName } = ensureSendGridConfigured();
        const emailTitle = purpose === "register" ? "Register OTP" : "Password Change OTP";

        await sendgridMail.send({
            to: email,
                        from: {
                                email: fromEmail,
                                name: fromName,
                        },
                        subject: `[SmartLingo] ${emailTitle}`,
                        text: `Your OTP code is: ${code}. It will expire in ${OTP_EXPIRES_MINUTES} minutes.`,
                        html: `
                            <div style="margin:0;padding:24px;background:#f3f4f6;font-family:Arial,sans-serif;color:#111827;">
                                <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
                                    <div style="padding:20px 24px;background:#0f172a;color:#f8fafc;">
                                        <h2 style="margin:0;font-size:20px;">SmartLingo</h2>
                                        <p style="margin:8px 0 0;font-size:13px;opacity:0.9;">Email verification</p>
                                    </div>
                                    <div style="padding:24px;">
                                        <p style="margin:0 0 12px;font-size:14px;color:#334155;">Use this OTP to continue:</p>
                                        <div style="display:inline-block;padding:12px 20px;border-radius:10px;background:#f8fafc;border:1px solid #cbd5e1;font-size:28px;letter-spacing:8px;font-weight:700;color:#0f172a;">
                                            ${code}
                                        </div>
                                        <p style="margin:16px 0 0;font-size:13px;color:#64748b;">This OTP expires in ${OTP_EXPIRES_MINUTES} minutes.</p>
                                    </div>
                                </div>
                            </div>
                        `,
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
        return { valid: false, message: "Không tìm thấy OTP, vui lòng gửi lại mã mới" };
    }

    if (otp.expiresAt.getTime() <= Date.now()) {
        await Otp.deleteOne({ _id: otp._id });
        return { valid: false, message: "Mã OTP đã hết hạn, vui lòng gửi lại mã mới" };
    }

    if (otp.codeHash !== toOtpHash(code)) {
        return { valid: false, message: "Mã OTP không đúng" };
    }

    await Otp.deleteOne({ _id: otp._id });
    return { valid: true };
};

export {
    issueOtp,
    verifyOtp,
};
