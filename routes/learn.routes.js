import express from "express";

import {
  adminCreateAchievement,
  adminCreateLearnMap,
  adminCreateStep,
  adminDeleteAchievement,
  adminDeleteLearnMap,
  adminDeleteStep,
  adminGenerateLearnMapDraft,
  adminGenerateStepDraft,
  adminListAchievements,
  adminListLearnMaps,
  adminListSteps,
  adminUpdateAchievement,
  adminUpdateLearnMap,
  adminUpdateStep,
  getLearnConversation,
  getLearnMapBySlug,
  getMyLearnAchievements,
  listLearnMaps,
  postEndLearnConversation,
  postLearnMessageEvaluation,
  postLearnMessageQuick,
  postStartLearnConversation,
} from "../controllers/learn.controller.js";
import { requireAdmin, requireAuth } from "../middleware/auth.middleware.js";

const router = express.Router();

router.get("/learn/maps", requireAuth, listLearnMaps);
router.get("/learn/maps/:slug", requireAuth, getLearnMapBySlug);
router.post("/learn/steps/:stepId/conversations", requireAuth, postStartLearnConversation);
router.get("/learn/conversations/:id", requireAuth, getLearnConversation);
router.post("/learn/conversations/:id/messages/quick", requireAuth, postLearnMessageQuick);
router.post(
  "/learn/conversations/:id/messages/:messageId/evaluation",
  requireAuth,
  postLearnMessageEvaluation
);
router.post("/learn/conversations/:id/end", requireAuth, postEndLearnConversation);
router.get("/learn/achievements/me", requireAuth, getMyLearnAchievements);

router.get("/admin/learn/maps", requireAuth, requireAdmin, adminListLearnMaps);
router.post(
  "/admin/learn/maps/generate-ai",
  requireAuth,
  requireAdmin,
  adminGenerateLearnMapDraft
);
router.post("/admin/learn/maps", requireAuth, requireAdmin, adminCreateLearnMap);
router.put("/admin/learn/maps/:id", requireAuth, requireAdmin, adminUpdateLearnMap);
router.delete("/admin/learn/maps/:id", requireAuth, requireAdmin, adminDeleteLearnMap);

router.get("/admin/learn/maps/:mapId/steps", requireAuth, requireAdmin, adminListSteps);
router.post(
  "/admin/learn/maps/:mapId/steps/generate-ai",
  requireAuth,
  requireAdmin,
  adminGenerateStepDraft
);
router.post("/admin/learn/maps/:mapId/steps", requireAuth, requireAdmin, adminCreateStep);
router.put("/admin/learn/steps/:id", requireAuth, requireAdmin, adminUpdateStep);
router.delete("/admin/learn/steps/:id", requireAuth, requireAdmin, adminDeleteStep);

router.get("/admin/learn/achievements", requireAuth, requireAdmin, adminListAchievements);
router.post("/admin/learn/achievements", requireAuth, requireAdmin, adminCreateAchievement);
router.put("/admin/learn/achievements/:id", requireAuth, requireAdmin, adminUpdateAchievement);
router.delete("/admin/learn/achievements/:id", requireAuth, requireAdmin, adminDeleteAchievement);

export default router;
