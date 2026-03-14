import express from "express";

import {
    getExerciseById,
    getExerciseHints,
    getExerciseHistory,
    getExerciseLeaderboard,
    getExerciseReview,
    getExerciseSummary,
    getRecommendedExercises,
    listExercises,
    submitExerciseAttempt,
} from "../controllers/index.js";

const router = express.Router();

router.get("/", listExercises);
router.get("/summary", getExerciseSummary);
router.get("/recommended", getRecommendedExercises);
router.get("/history", getExerciseHistory);
router.get("/:id", getExerciseById);
router.get("/:id/hints", getExerciseHints);
router.get("/:id/leaderboard", getExerciseLeaderboard);
router.get("/:id/review", getExerciseReview);
router.post("/:id/submit", submitExerciseAttempt);

export default router;
