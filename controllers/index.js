import {
  changePassword,
  login,
  register,
  sendChangePasswordOtp,
  sendRegisterOtp,
} from "./auth.controller.js";
import {
  createAdminAiLevel,
  deleteAdminAiLevel,
  getAdminAiLevels,
  updateAdminAiLevel,
  uploadAdminImage,
} from "./ai.controller.js";
import {
  createAdminExercise,
  deleteAdminExercise,
  getAdminExercises,
  getExerciseById,
  getExerciseHints,
  getExerciseHistory,
  getExerciseLeaderboard,
  getExerciseReview,
  getExerciseSummary,
  getRecommendedExercises,
  listExercises,
  submitExerciseAttempt,
  updateAdminExercise,
} from "./exercise.controller.js";
import {
  getAdminOverview,
  getAdminReports,
  getAdminUsers,
} from "./user.controller.js";
import {
  createAdminVocabulary,
  deleteAdminVocabulary,
  getAdminVocabulary,
  updateAdminVocabulary,
} from "./vocabulary.controller.js";

const healthCheck = (_req, res) => {
  res.status(200).json({
    success: true,
    message: "API is healthy",
    timestamp: new Date().toISOString(),
  });
};

export {
  changePassword,
  createAdminAiLevel,
  createAdminExercise,
  createAdminVocabulary,
  deleteAdminAiLevel,
  deleteAdminExercise,
  deleteAdminVocabulary,
  getAdminAiLevels,
  getAdminExercises,
  getAdminOverview,
  getAdminReports,
  getAdminUsers,
  getAdminVocabulary,
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
  updateAdminAiLevel,
  updateAdminExercise,
  updateAdminVocabulary,
  uploadAdminImage,
};
