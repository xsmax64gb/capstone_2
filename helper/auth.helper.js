import jwt from "jsonwebtoken";

const DEFAULT_JWT_SECRET = "dev-secret-change-me";
const DEFAULT_JWT_EXPIRES_IN = "7d";
const DEFAULT_OTP_EXPIRES_MINUTES = 10;

const isProduction = process.env.NODE_ENV === "production";

const getOtpExpiryMinutes = () => {
  const minutes = Number(process.env.OTP_EXPIRES_MINUTES || DEFAULT_OTP_EXPIRES_MINUTES);
  return Number.isNaN(minutes) || minutes <= 0 ? DEFAULT_OTP_EXPIRES_MINUTES : minutes;
};

const generateOtpCode = () => {
  return String(Math.floor(100000 + Math.random() * 900000));
};

const getOtpExpiryDate = () => {
  const minutes = getOtpExpiryMinutes();
  return new Date(Date.now() + minutes * 60 * 1000);
};

const signAccessToken = (user) => {
  return jwt.sign(
    {
      sub: user._id.toString(),
      email: user.email,
      role: user.role,
      currentLevel: user.currentLevel,
    },
    process.env.JWT_SECRET || DEFAULT_JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRES_IN || DEFAULT_JWT_EXPIRES_IN,
    }
  );
};

const sanitizeUser = (user) => {
  return {
    id: user._id,
    fullName: user.fullName,
    email: user.email,
    role: user.role,
    currentLevel: user.currentLevel,
    exp: user.exp,
    onboardingDone: user.onboardingDone,
    placementScore: user.placementScore,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
};

const buildOtpDebugPayload = (otpCode) => {
  if (isProduction) {
    return {};
  }

  return {
    otp: otpCode,
  };
};

export {
  buildOtpDebugPayload,
  generateOtpCode,
  getOtpExpiryDate,
  getOtpExpiryMinutes,
  sanitizeUser,
  signAccessToken,
};
