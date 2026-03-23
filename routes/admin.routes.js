import express from "express";

import {
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
  updateAdminAiLevel,
  updateAdminExercise,
  updateAdminVocabulary,
  uploadAdminImage,
} from "../controllers/admin.controller.js";
import { requireAdmin, requireAuth } from "../middleware/auth.middleware.js";
import { uploadSingleImage } from "../middleware/upload.middleware.js";

const router = express.Router();

router.use(requireAuth, requireAdmin);

router.get("/overview", getAdminOverview);
router.get("/users", getAdminUsers);
router.get("/exercises", getAdminExercises);
router.post("/exercises", createAdminExercise);
router.put("/exercises/:id", updateAdminExercise);
router.delete("/exercises/:id", deleteAdminExercise);
router.get("/vocabulary", getAdminVocabulary);
router.post("/vocabulary", createAdminVocabulary);
router.put("/vocabulary/:id", updateAdminVocabulary);
router.delete("/vocabulary/:id", deleteAdminVocabulary);
router.get("/ai-levels", getAdminAiLevels);
router.post("/ai-levels", createAdminAiLevel);
router.put("/ai-levels/:id", updateAdminAiLevel);
router.delete("/ai-levels/:id", deleteAdminAiLevel);
router.post("/upload/image", uploadSingleImage, uploadAdminImage);
router.get("/reports", getAdminReports);

export default router;
