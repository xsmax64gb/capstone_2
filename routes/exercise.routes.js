import express from "express";

import {
    createAdminExercise,
    deleteAdminExercise,
    getAdminExercises,
    getExerciseById,
    getExerciseHints,
    getExerciseHistory,
    getExerciseLeaderboard,
    getExerciseReview,
    getExerciseSummary,
    getRecommendedExercises,
    listExercises,
    submitExerciseAttempt,
    updateAdminExercise,
} from "../controllers/index.js";
import { requireAdmin, requireAuth } from "../middleware/auth.middleware.js";
import { requireFeatureQuota } from "../middleware/feature-quota.middleware.js";
import { uploadExerciseCoverImage } from "../middleware/upload.middleware.js";

const router = express.Router();

/**
 * @swagger
 * /api/exercises:
 *   get:
 *     summary: List exercises with filters
 *     tags: [Exercises]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: query
 *         schema:
 *           type: string
 *       - in: query
 *         name: level
 *         schema:
 *           type: string
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *       - in: query
 *         name: topic
 *         schema:
 *           type: string
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *       - in: query
 *         name: includeQuestions
 *         schema:
 *           type: boolean
 *     responses:
 *       200:
 *         description: Exercises fetched successfully
 */
router.get("/admin/exercises", requireAuth, requireAdmin, getAdminExercises);
router.post(
    "/admin/exercises",
    requireAuth,
    requireAdmin,
    uploadExerciseCoverImage,
    createAdminExercise
);
router.put(
    "/admin/exercises/:id",
    requireAuth,
    requireAdmin,
    uploadExerciseCoverImage,
    updateAdminExercise
);
router.delete("/admin/exercises/:id", requireAuth, requireAdmin, deleteAdminExercise);

router.use("/exercises", requireAuth);

router.get(
    "/exercises",
    requireFeatureQuota("exercise_library"),
    listExercises
);

/**
 * @swagger
 * /api/exercises/summary:
 *   get:
 *     summary: Get exercise dashboard summary
 *     tags: [Exercises]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Exercise summary fetched successfully
 */
router.get(
    "/exercises/summary",
    requireFeatureQuota("exercise_library"),
    getExerciseSummary
);

/**
 * @swagger
 * /api/exercises/recommended:
 *   get:
 *     summary: Get recommended exercises for current user
 *     tags: [Exercises]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Recommended exercises fetched successfully
 */
router.get(
    "/exercises/recommended",
    requireFeatureQuota("exercise_library"),
    getRecommendedExercises
);

/**
 * @swagger
 * /api/exercises/history:
 *   get:
 *     summary: Get attempt history of current user
 *     tags: [Exercises]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Exercise history fetched successfully
 */
router.get(
    "/exercises/history",
    requireFeatureQuota("exercise_library"),
    getExerciseHistory
);

/**
 * @swagger
 * /api/exercises/{id}:
 *   get:
 *     summary: Get exercise detail by id
 *     tags: [Exercises]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Exercise detail fetched successfully
 *       404:
 *         description: Exercise not found
 */
router.get(
    "/exercises/:id",
    requireFeatureQuota("exercise_library"),
    getExerciseById
);

/**
 * @swagger
 * /api/exercises/{id}/hints:
 *   get:
 *     summary: Get hints for an exercise
 *     tags: [Exercises]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Exercise hints fetched successfully
 */
router.get(
    "/exercises/:id/hints",
    requireFeatureQuota("exercise_library"),
    getExerciseHints
);

/**
 * @swagger
 * /api/exercises/{id}/leaderboard:
 *   get:
 *     summary: Get leaderboard for an exercise
 *     tags: [Exercises]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Leaderboard fetched successfully
 */
router.get(
    "/exercises/:id/leaderboard",
    requireFeatureQuota("exercise_library"),
    getExerciseLeaderboard
);

/**
 * @swagger
 * /api/exercises/{id}/review:
 *   get:
 *     summary: Get answer review for an exercise
 *     tags: [Exercises]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: answers
 *         schema:
 *           type: string
 *         description: Comma-separated answer indices
 *     responses:
 *       200:
 *         description: Exercise review generated successfully
 */
router.get(
    "/exercises/:id/review",
    requireFeatureQuota("exercise_library"),
    getExerciseReview
);

/**
 * @swagger
 * /api/exercises/{id}/submit:
 *   post:
 *     summary: Submit exercise attempt
 *     tags: [Exercises]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               answers:
 *                 type: array
 *                 items:
 *                   type: integer
 *               durationSec:
 *                 type: integer
 *               userName:
 *                 type: string
 *     responses:
 *       201:
 *         description: Exercise submitted successfully
 */
router.post(
    "/exercises/:id/submit",
    requireFeatureQuota("exercise_library", { enforceQuota: true }),
    submitExerciseAttempt
);

export default router;
