import express from "express";

import {
  createAdminVocabulary,
  createAdminVocabularyWord,
  createAdminVocabularyWordsBulk,
  createPersonalVocabularySetFromAi,
  createPersonalVocabularySetManual,
  deleteAdminVocabulary,
  deleteAdminVocabularyWord,
  deletePersonalVocabularySet,
  generatePersonalVocabularyFromPdf,
  generatePersonalVocabularyFromPrompt,
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
  updatePersonalVocabularySet,
} from "../controllers/index.js";
import { requireAdmin, requireAuth } from "../middleware/auth.middleware.js";
import { requireFeatureQuota } from "../middleware/feature-quota.middleware.js";
import {
  uploadVocabularyAiPdf,
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

router.get(
  "/vocabularies",
  requireFeatureQuota("vocabulary_library"),
  listVocabularies
);

router.get(
  "/vocabularies/summary",
  requireFeatureQuota("vocabulary_library"),
  getVocabularySummary
);

router.get(
  "/vocabularies/recommended",
  requireFeatureQuota("vocabulary_library"),
  getRecommendedVocabularies
);

router.get(
  "/vocabularies/history",
  requireFeatureQuota("vocabulary_library"),
  getVocabularyHistory
);

router.post(
  "/vocabularies/personal/generate-prompt",
  requireFeatureQuota("ai_vocabulary_builder", { enforceQuota: true }),
  generatePersonalVocabularyFromPrompt
);
router.post(
  "/vocabularies/personal/generate-pdf",
  requireFeatureQuota("ai_vocabulary_builder", { enforceQuota: true }),
  uploadVocabularyAiPdf,
  generatePersonalVocabularyFromPdf
);
router.post(
  "/vocabularies/personal/manual",
  requireFeatureQuota("vocabulary_library"),
  createPersonalVocabularySetManual
);
router.post(
  "/vocabularies/personal/ai",
  requireFeatureQuota("ai_vocabulary_builder", { enforceQuota: true }),
  createPersonalVocabularySetFromAi
);
router.put(
  "/vocabularies/personal/:id",
  requireFeatureQuota("vocabulary_library"),
  updatePersonalVocabularySet
);
router.delete(
  "/vocabularies/personal/:id",
  requireFeatureQuota("vocabulary_library"),
  deletePersonalVocabularySet
);

router.get(
  "/vocabularies/:id",
  requireFeatureQuota("vocabulary_library"),
  getVocabularyById
);

router.get(
  "/vocabularies/:id/hints",
  requireFeatureQuota("vocabulary_library"),
  getVocabularyHints
);

router.get(
  "/vocabularies/:id/leaderboard",
  requireFeatureQuota("vocabulary_library"),
  getVocabularyLeaderboard
);

router.get(
  "/vocabularies/:id/review",
  requireFeatureQuota("vocabulary_library"),
  getVocabularyReview
);

router.post(
  "/vocabularies/:id/submit",
  requireFeatureQuota("vocabulary_library", { enforceQuota: true }),
  submitVocabularyAttempt
);

export default router;
