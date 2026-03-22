import express from "express";

import {
  getAdminContent,
  getAdminOverview,
  getAdminReports,
  getAdminSettings,
  getAdminUsers,
} from "../controllers/admin.controller.js";
import { requireAdmin, requireAuth } from "../middleware/auth.middleware.js";

const router = express.Router();

router.use(requireAuth, requireAdmin);

router.get("/overview", getAdminOverview);
router.get("/users", getAdminUsers);
router.get("/content", getAdminContent);
router.get("/reports", getAdminReports);
router.get("/settings", getAdminSettings);

export default router;
