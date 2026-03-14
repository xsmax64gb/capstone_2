import {
  changePasswordWithOtp,
  login,
  register,
  requestPasswordOtp,
  requestRegisterOtp,
} from "./auth.controller.js";

const healthCheck = (_req, res) => {
  res.status(200).json({
    success: true,
    message: "API is healthy",
    timestamp: new Date().toISOString(),
  });
};

export {
  changePasswordWithOtp,
  healthCheck,
  login,
  register,
  requestPasswordOtp,
  requestRegisterOtp,
};
