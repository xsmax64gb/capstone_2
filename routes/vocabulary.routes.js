import express from "express";

import {
  createAdminVocabulary,
  deleteAdminVocabulary,
  getAdminVocabulary,
  updateAdminVocabulary,
} from "../controllers/vocabulary.controller.js";
import { requireAdmin, requireAuth } from "../middleware/auth.middleware.js";
import { uploadVocabularyImage } from "../middleware/upload.middleware.js";

const router = express.Router();

router.get("/admin/vocabulary", requireAuth, requireAdmin, getAdminVocabulary);
router.post(
  "/admin/vocabulary",
  requireAuth,
  requireAdmin,
  uploadVocabularyImage,
  createAdminVocabulary
);
router.put(
  "/admin/vocabulary/:id",
  requireAuth,
  requireAdmin,
  uploadVocabularyImage,
  updateAdminVocabulary
);
router.delete(
  "/admin/vocabulary/:id",
  requireAuth,
  requireAdmin,
  deleteAdminVocabulary
);

export default router;
