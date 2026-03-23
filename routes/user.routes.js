import express from "express";

import {
  getAdminOverview,
  getAdminReports,
  getAdminUsers,
} from "../controllers/user.controller.js";
import { requireAdmin, requireAuth } from "../middleware/auth.middleware.js";

const router = express.Router();

router.get("/admin/overview", requireAuth, requireAdmin, getAdminOverview);
router.get("/admin/users", requireAuth, requireAdmin, getAdminUsers);
router.get("/admin/reports", requireAuth, requireAdmin, getAdminReports);

export default router;
