import express from "express";

import {
  createAdminAiLevel,
  deleteAdminAiLevel,
  getAdminAiLevels,
  updateAdminAiLevel,
  uploadAdminImage,
} from "../controllers/ai.controller.js";
import { requireAdmin, requireAuth } from "../middleware/auth.middleware.js";
import { uploadSingleImage } from "../middleware/upload.middleware.js";

const router = express.Router();

router.get("/admin/ai-levels", requireAuth, requireAdmin, getAdminAiLevels);
router.post("/admin/ai-levels", requireAuth, requireAdmin, createAdminAiLevel);
router.put("/admin/ai-levels/:id", requireAuth, requireAdmin, updateAdminAiLevel);
router.delete("/admin/ai-levels/:id", requireAuth, requireAdmin, deleteAdminAiLevel);
router.post(
  "/admin/upload/image",
  requireAuth,
  requireAdmin,
  uploadSingleImage,
  uploadAdminImage
);

export default router;
