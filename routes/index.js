import express from "express";

import adminRouter from "./admin.routes.js";
import authRouter from "./auth.routes.js";
import exerciseRouter from "./exercise.routes.js";
import { healthCheck } from "../controllers/index.js";

const router = express.Router();

/**
 * @swagger
 * /api/health:
 *   get:
 *     summary: Check API health
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: API is healthy
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/BasicResponse'
 *                 - type: object
 *                   properties:
 *                     timestamp:
 *                       type: string
 *                       format: date-time
 */
router.get("/health", healthCheck);
router.use("/admin", adminRouter);
router.use("/auth", authRouter);
router.use("/exercises", exerciseRouter);

export default router;
