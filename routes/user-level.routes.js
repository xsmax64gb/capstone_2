// Routes cho API cấp độ người dùng
import express from "express";
import {
  getCurrentLevel,
  getLevelProgressionHistory,
} from "../controllers/user-level.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";

const router = express.Router();

// User level endpoints
router.get("/level", requireAuth, getCurrentLevel);
router.get("/level-history", requireAuth, getLevelProgressionHistory);

export default router;
