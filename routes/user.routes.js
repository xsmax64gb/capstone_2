import express from "express";

import {
  deleteCurrentUserAvatar,
  getAdminOverview,
  getAdminReports,
  getAdminUsers,
  getCurrentUserProfile,
  updateCurrentUserAvatar,
  updateCurrentUserProfile,
} from "../controllers/user.controller.js";
import { requireAdmin, requireAuth } from "../middleware/auth.middleware.js";
import { uploadAvatarImage } from "../middleware/upload.middleware.js";

const router = express.Router();

router.get("/me/profile", requireAuth, getCurrentUserProfile);
router.put("/me/profile", requireAuth, updateCurrentUserProfile);
router.patch("/me/profile/avatar", requireAuth, uploadAvatarImage, updateCurrentUserAvatar);
router.delete("/me/profile/avatar", requireAuth, deleteCurrentUserAvatar);

router.get("/admin/overview", requireAuth, requireAdmin, getAdminOverview);
router.get("/admin/users", requireAuth, requireAdmin, getAdminUsers);
router.get("/admin/reports", requireAuth, requireAdmin, getAdminReports);

export default router;
