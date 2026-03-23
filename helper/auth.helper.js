import jwt from "jsonwebtoken";

const DEFAULT_JWT_SECRET = "dev-secret-change-me";
const DEFAULT_JWT_EXPIRES_IN = "7d";

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

const verifyAccessToken = (token) => {
  return jwt.verify(token, process.env.JWT_SECRET || DEFAULT_JWT_SECRET);
};

const sanitizeUser = (user) => {
  return {
    id: user._id,
    fullName: user.fullName,
    email: user.email,
    avatarUrl: user.avatarUrl || "",
    bio: user.bio || "",
    nativeLanguage: user.nativeLanguage || "",
    timezone: user.timezone || "",
    role: user.role,
    currentLevel: user.currentLevel,
    exp: user.exp,
    onboardingDone: user.onboardingDone,
    placementScore: user.placementScore,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
};

export {
  sanitizeUser,
  signAccessToken,
  verifyAccessToken,
};
