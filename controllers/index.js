import {
  changePassword,
  login,
  register,
  sendChangePasswordOtp,
  sendRegisterOtp,
} from "./auth.controller.js";
import {
  getExerciseById,
  getExerciseHints,
  getExerciseHistory,
  getExerciseLeaderboard,
  getExerciseReview,
  getExerciseSummary,
  getRecommendedExercises,
  listExercises,
  submitExerciseAttempt,
} from "./exercise.controller.js";

const healthCheck = (_req, res) => {
  res.status(200).json({
    success: true,
    message: "API is healthy",
    timestamp: new Date().toISOString(),
  });
};

export {
  changePassword,
  getExerciseById,
  getExerciseHints,
  getExerciseHistory,
  getExerciseLeaderboard,
  getExerciseReview,
  getExerciseSummary,
  getRecommendedExercises,
  healthCheck,
  listExercises,
  login,
  register,
  sendChangePasswordOtp,
  sendRegisterOtp,
  submitExerciseAttempt,
};
