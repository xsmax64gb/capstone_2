import express from "express";

import authRouter from "./auth.routes.js";
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
router.use("/auth", authRouter);

export default router;
