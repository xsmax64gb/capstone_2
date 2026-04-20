import express from "express";

import {
    getAdminRevenueChart,
    getAdminRevenueOverview,
    getAdminRevenueStatistics,
} from "../controllers/revenue.controller.js";
import { requireAdmin, requireAuth } from "../middleware/auth.middleware.js";

const router = express.Router();

router.get("/admin/revenue/overview", requireAuth, requireAdmin, getAdminRevenueOverview);
router.get("/admin/revenue/chart", requireAuth, requireAdmin, getAdminRevenueChart);
router.get("/admin/revenue/statistics", requireAuth, requireAdmin, getAdminRevenueStatistics);

export default router;
