// Routes cho API bài kiểm tra cấp độ
import express from "express";
import {
  checkTestAvailability,
  startTest,
  submitTest,
} from "../controllers/level-test.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";

const router = express.Router();

// Level test endpoints
router.get("/available", requireAuth, checkTestAvailability);
router.post("/start", requireAuth, startTest);
router.post("/submit", requireAuth, submitTest);

export default router;
