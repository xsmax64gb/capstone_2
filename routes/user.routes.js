import express from "express";

import {
  createAdminUser,
  deleteAdminUser,
  deleteCurrentUserAvatar,
  getAdminOverview,
  getAdminReports,
  getAdminUserById,
  getAdminUsers,
  getCurrentUserProfile,
  resetAdminUserPassword,
  updateAdminUser,
  updateAdminUserRole,
  updateAdminUserStatus,
  updateCurrentUserAvatar,
  updateCurrentUserProfile,
} from "../controllers/user.controller.js";
import {
  adminSendInboxNotification,
  getMyInboxNotifications,
  getUnreadInboxCount,
  markAllInboxNotificationsRead,
  markInboxNotificationRead,
} from "../controllers/inbox-notification.controller.js";
import { requireAdmin, requireAuth } from "../middleware/auth.middleware.js";
import { uploadAvatarImage } from "../middleware/upload.middleware.js";

const router = express.Router();

router.get("/me/profile", requireAuth, getCurrentUserProfile);
router.put("/me/profile", requireAuth, updateCurrentUserProfile);
router.patch("/me/profile/avatar", requireAuth, uploadAvatarImage, updateCurrentUserAvatar);
router.delete("/me/profile/avatar", requireAuth, deleteCurrentUserAvatar);

router.get("/me/notifications", requireAuth, getMyInboxNotifications);
router.get("/me/notifications/unread-count", requireAuth, getUnreadInboxCount);
router.patch("/me/notifications/read-all", requireAuth, markAllInboxNotificationsRead);
router.patch("/me/notifications/:id/read", requireAuth, markInboxNotificationRead);

router.get("/admin/overview", requireAuth, requireAdmin, getAdminOverview);
router.get("/admin/users", requireAuth, requireAdmin, getAdminUsers);
router.get("/admin/users/:id", requireAuth, requireAdmin, getAdminUserById);
router.post("/admin/users", requireAuth, requireAdmin, createAdminUser);
router.put("/admin/users/:id", requireAuth, requireAdmin, updateAdminUser);
router.patch("/admin/users/:id/role", requireAuth, requireAdmin, updateAdminUserRole);
router.patch("/admin/users/:id/status", requireAuth, requireAdmin, updateAdminUserStatus);
router.patch("/admin/users/:id/password", requireAuth, requireAdmin, resetAdminUserPassword);
router.delete("/admin/users/:id", requireAuth, requireAdmin, deleteAdminUser);
router.get("/admin/reports", requireAuth, requireAdmin, getAdminReports);
router.post("/admin/notifications", requireAuth, requireAdmin, adminSendInboxNotification);

export default router;
