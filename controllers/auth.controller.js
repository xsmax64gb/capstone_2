import bcrypt from "bcryptjs";

import { Otp, User, UserProgress } from "../models/index.js";
import {
  buildOtpDebugPayload,
  generateOtpCode,
  getOtpExpiryDate,
  getOtpExpiryMinutes,
  sanitizeUser,
  signAccessToken,
} from "../helper/auth.helper.js";

const OTP_TYPES = {
  REGISTER: "register",
  FORGOT_PASSWORD: "forgot_password",
};

const SALT_ROUNDS = 10;

const isValidEmail = (email) => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

const getLatestValidOtp = async (email, type) => {
  return Otp.findOne({
    email: email.toLowerCase(),
    type,
    used: false,
    expiredAt: { $gt: new Date() },
  }).sort({ createdAt: -1 });
};

const requestRegisterOtp = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || !isValidEmail(email)) {
      return res.status(400).json({
        success: false,
        message: "A valid email is required",
      });
    }

    const normalizedEmail = email.toLowerCase();
    const existingUser = await User.findOne({ email: normalizedEmail });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "Email is already registered",
      });
    }

    await Otp.updateMany(
      { email: normalizedEmail, type: OTP_TYPES.REGISTER, used: false },
      { used: true, usedAt: new Date() }
    );

    const otpCode = generateOtpCode();
    const otp = await Otp.create({
      email: normalizedEmail,
      code: otpCode,
      type: OTP_TYPES.REGISTER,
      expiredAt: getOtpExpiryDate(),
    });

    return res.status(201).json({
      success: true,
      message: "Registration OTP created successfully",
      expiresInMinutes: getOtpExpiryMinutes(),
      otpId: otp._id,
      ...buildOtpDebugPayload(otpCode),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to create registration OTP",
    });
  }
};

const register = async (req, res) => {
  try {
    const { fullName, email, password, otp } = req.body;

    if (!fullName || !email || !password || !otp) {
      return res.status(400).json({
        success: false,
        message: "fullName, email, password, and otp are required",
      });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({
        success: false,
        message: "A valid email is required",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters",
      });
    }

    const normalizedEmail = email.toLowerCase();
    const existingUser = await User.findOne({ email: normalizedEmail });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "Email is already registered",
      });
    }

    const latestOtp = await getLatestValidOtp(normalizedEmail, OTP_TYPES.REGISTER);

    if (!latestOtp || latestOtp.code !== otp) {
      return res.status(400).json({
        success: false,
        message: "OTP is invalid or expired",
      });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await User.create({
      fullName,
      email: normalizedEmail,
      passwordHash,
    });

    await UserProgress.create({
      userId: user._id,
      currentLevel: user.currentLevel,
      unlockedLevels: [user.currentLevel],
    });

    latestOtp.used = true;
    latestOtp.usedAt = new Date();
    await latestOtp.save();

    const token = signAccessToken(user);

    return res.status(201).json({
      success: true,
      message: "Register successfully",
      data: {
        token,
        user: sanitizeUser(user),
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Register failed",
    });
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "email and password are required",
      });
    }

    const normalizedEmail = email.toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const isPasswordMatched = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordMatched) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const token = signAccessToken(user);

    return res.status(200).json({
      success: true,
      message: "Login successfully",
      data: {
        token,
        user: sanitizeUser(user),
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Login failed",
    });
  }
};

const requestPasswordOtp = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || !isValidEmail(email)) {
      return res.status(400).json({
        success: false,
        message: "A valid email is required",
      });
    }

    const normalizedEmail = email.toLowerCase();
    const existingUser = await User.findOne({ email: normalizedEmail });

    if (!existingUser) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    await Otp.updateMany(
      { email: normalizedEmail, type: OTP_TYPES.FORGOT_PASSWORD, used: false },
      { used: true, usedAt: new Date() }
    );

    const otpCode = generateOtpCode();
    const otp = await Otp.create({
      email: normalizedEmail,
      code: otpCode,
      type: OTP_TYPES.FORGOT_PASSWORD,
      expiredAt: getOtpExpiryDate(),
    });

    return res.status(201).json({
      success: true,
      message: "Password OTP created successfully",
      expiresInMinutes: getOtpExpiryMinutes(),
      otpId: otp._id,
      ...buildOtpDebugPayload(otpCode),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to create password OTP",
    });
  }
};

const changePasswordWithOtp = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "email, otp, and newPassword are required",
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: "New password must be at least 6 characters",
      });
    }

    const normalizedEmail = email.toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const latestOtp = await getLatestValidOtp(normalizedEmail, OTP_TYPES.FORGOT_PASSWORD);

    if (!latestOtp || latestOtp.code !== otp) {
      return res.status(400).json({
        success: false,
        message: "OTP is invalid or expired",
      });
    }

    user.passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await user.save();

    latestOtp.used = true;
    latestOtp.usedAt = new Date();
    await latestOtp.save();

    return res.status(200).json({
      success: true,
      message: "Password changed successfully",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to change password",
    });
  }
};

export {
  changePasswordWithOtp,
  login,
  register,
  requestPasswordOtp,
  requestRegisterOtp,
};
