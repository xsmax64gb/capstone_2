import express from "express";

import {
  activateAdminPlacementTest,
  confirmPlacementResult,
  createAdminPlacementTest,
  deleteAdminPlacementTest,
  getActivePlacementTest,
  getAdminPlacementTestById,
  getAdminPlacementTests,
  getPlacementAttemptById,
  skipPlacementTest,
  submitPlacementTest,
  updateAdminPlacementTest,
} from "../controllers/index.js";
import { requireAdmin, requireAuth } from "../middleware/auth.middleware.js";

const router = express.Router();

router.get("/admin/placement-tests", requireAuth, requireAdmin, getAdminPlacementTests);
router.get(
  "/admin/placement-tests/:id",
  requireAuth,
  requireAdmin,
  getAdminPlacementTestById
);
router.post(
  "/admin/placement-tests",
  requireAuth,
  requireAdmin,
  createAdminPlacementTest
);
router.put(
  "/admin/placement-tests/:id",
  requireAuth,
  requireAdmin,
  updateAdminPlacementTest
);
router.patch(
  "/admin/placement-tests/:id/activate",
  requireAuth,
  requireAdmin,
  activateAdminPlacementTest
);
router.delete(
  "/admin/placement-tests/:id",
  requireAuth,
  requireAdmin,
  deleteAdminPlacementTest
);

router.get("/placement-tests/active", requireAuth, getActivePlacementTest);
router.post("/placement-tests/submit", requireAuth, submitPlacementTest);
router.get(
  "/placement-tests/attempts/:attemptId",
  requireAuth,
  getPlacementAttemptById
);
router.post("/placement-tests/confirm", requireAuth, confirmPlacementResult);
router.post("/placement-tests/skip", requireAuth, skipPlacementTest);

export default router;
