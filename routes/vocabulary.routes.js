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
  getRecommendedVocabularies,
  getVocabularyById,
  getVocabularyHints,
  getVocabularyHistory,
  getVocabularyLeaderboard,
  getVocabularyReview,
  getVocabularySummary,
  listVocabularies,
  submitVocabularyAttempt,
  updateAdminVocabulary,
  updateAdminVocabularyWord,
} from "../controllers/index.js";
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

// ─── User-facing vocabulary routes ─────────────────────────────────────────────

router.use("/vocabularies", requireAuth);

router.get("/vocabularies", listVocabularies);

router.get("/vocabularies/summary", getVocabularySummary);

router.get("/vocabularies/recommended", getRecommendedVocabularies);

router.get("/vocabularies/history", getVocabularyHistory);

router.get("/vocabularies/:id", getVocabularyById);

router.get("/vocabularies/:id/hints", getVocabularyHints);

router.get("/vocabularies/:id/leaderboard", getVocabularyLeaderboard);

router.get("/vocabularies/:id/review", getVocabularyReview);

router.post("/vocabularies/:id/submit", submitVocabularyAttempt);

export default router;
