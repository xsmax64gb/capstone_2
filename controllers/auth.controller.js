import bcrypt from "bcryptjs";

import { User, UserProgress } from "../models/index.js";
import { sanitizeUser, signAccessToken } from "../helper/auth.helper.js";
import { issueOtp, verifyOtp } from "../helper/otp.helper.js";

const SALT_ROUNDS = 10;

const isValidEmail = (email) => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
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

    const otpVerification = await verifyOtp({
      email: normalizedEmail,
      purpose: "register",
      code: otp,
    });

    if (!otpVerification.valid) {
      return res.status(400).json({
        success: false,
        message: otpVerification.message,
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

const sendRegisterOtp = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "email is required",
      });
    }

    if (!isValidEmail(email)) {
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

    await issueOtp({
      email: normalizedEmail,
      purpose: "register",
    });

    return res.status(200).json({
      success: true,
      message: "OTP sent successfully",
    });
  } catch (error) {
    console.error("[Auth][sendRegisterOtp] Failed", {
      email: req.body?.email,
      message: error?.message,
      stack: error?.stack,
      sendgridResponse: error?.response?.body,
    });

    return res.status(500).json({
      success: false,
      message: error.message || "Failed to send OTP",
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

    if (user.isActive === false) {
      return res.status(403).json({
        success: false,
        message: "This account has been deactivated. Please contact an administrator.",
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

const changePassword = async (req, res) => {
  try {
    const { email, newPassword, otp } = req.body;

    if (!email || !newPassword || !otp) {
      return res.status(400).json({
        success: false,
        message: "email, newPassword, and otp are required",
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

    const otpVerification = await verifyOtp({
      email: normalizedEmail,
      purpose: "change_password",
      code: otp,
    });

    if (!otpVerification.valid) {
      return res.status(400).json({
        success: false,
        message: otpVerification.message,
      });
    }

    user.passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await user.save();

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

const sendChangePasswordOtp = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "email is required",
      });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({
        success: false,
        message: "A valid email is required",
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

    await issueOtp({
      email: normalizedEmail,
      purpose: "change_password",
    });

    return res.status(200).json({
      success: true,
      message: "OTP sent successfully",
    });
  } catch (error) {
    console.error("[Auth][sendChangePasswordOtp] Failed", {
      email: req.body?.email,
      message: error?.message,
      stack: error?.stack,
      sendgridResponse: error?.response?.body,
    });

    return res.status(500).json({
      success: false,
      message: error.message || "Failed to send OTP",
    });
  }
};

export {
  changePassword,
  login,
  register,
  sendChangePasswordOtp,
  sendRegisterOtp,
};
