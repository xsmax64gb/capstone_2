// Routes cho API quản lý bài kiểm tra (admin)
import express from "express";
import {
  createTest,
  updateTest,
  toggleTest,
  listTests,
  removeTest,
  generateTestWithAi,
} from "../controllers/admin-level-test.controller.js";
import { requireAuth, requireAdmin } from "../middleware/auth.middleware.js";

const router = express.Router();

// Admin test management endpoints
router.post("/generate-ai", requireAuth, requireAdmin, generateTestWithAi);
router.post("/create", requireAuth, requireAdmin, createTest);
router.put("/:testId", requireAuth, requireAdmin, updateTest);
router.patch("/:testId/toggle", requireAuth, requireAdmin, toggleTest);
router.get("/list", requireAuth, requireAdmin, listTests);
router.delete("/:testId", requireAuth, requireAdmin, removeTest);

export default router;
