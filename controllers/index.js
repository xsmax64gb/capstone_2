import {
  changePassword,
  login,
  register,
} from "./auth.controller.js";

const healthCheck = (_req, res) => {
  res.status(200).json({
    success: true,
    message: "API is healthy",
    timestamp: new Date().toISOString(),
  });
};

export {
  changePassword,
  healthCheck,
  login,
  register,
};
