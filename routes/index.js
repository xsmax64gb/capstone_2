import express from "express";

import authRouter from "./auth.routes.js";
import { healthCheck } from "../controllers/index.js";

const router = express.Router();

router.get("/health", healthCheck);
router.use("/auth", authRouter);

export default router;
