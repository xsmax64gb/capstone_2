import express from "express";

import {
  createAdminVocabulary,
  createAdminVocabularyWord,
  createAdminVocabularyWordsBulk,
  deleteAdminVocabulary,
  deleteAdminVocabularyWord,
  getAdminVocabulary,
  getAdminVocabularyById,
  getAdminVocabularyWords,
  updateAdminVocabulary,
  updateAdminVocabularyWord,
} from "../controllers/vocabulary.controller.js";
import { requireAdmin, requireAuth } from "../middleware/auth.middleware.js";
import {
  uploadVocabularyCoverImage,
} from "../middleware/upload.middleware.js";

const router = express.Router();

router.get("/admin/vocabulary", requireAuth, requireAdmin, getAdminVocabulary);
router.get("/admin/vocabulary/:id", requireAuth, requireAdmin, getAdminVocabularyById);
router.get("/admin/vocabulary/:id/words", requireAuth, requireAdmin, getAdminVocabularyWords);
router.post(
  "/admin/vocabulary",
  requireAuth,
  requireAdmin,
  uploadVocabularyCoverImage,
  createAdminVocabulary
);
router.put(
  "/admin/vocabulary/:id",
  requireAuth,
  requireAdmin,
  uploadVocabularyCoverImage,
  updateAdminVocabulary
);
router.delete(
  "/admin/vocabulary/:id",
  requireAuth,
  requireAdmin,
  deleteAdminVocabulary
);
router.post(
  "/admin/vocabulary/:id/words",
  requireAuth,
  requireAdmin,
  createAdminVocabularyWord
);
router.post(
  "/admin/vocabulary/:id/words/bulk",
  requireAuth,
  requireAdmin,
  createAdminVocabularyWordsBulk
);
router.put(
  "/admin/vocabulary/:id/words/:wordId",
  requireAuth,
  requireAdmin,
  updateAdminVocabularyWord
);
router.delete(
  "/admin/vocabulary/:id/words/:wordId",
  requireAuth,
  requireAdmin,
  deleteAdminVocabularyWord
);

export default router;
