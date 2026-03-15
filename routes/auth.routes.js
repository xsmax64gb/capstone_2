import express from "express";

import {
  changePassword,
  login,
  register,
  sendChangePasswordOtp,
  sendRegisterOtp,
} from "../controllers/index.js";

const router = express.Router();

/**
 * @swagger
 * /api/auth/register/send-otp:
 *   post:
 *     summary: Send OTP for register flow
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SendOtpBody'
 *     responses:
 *       200:
 *         description: OTP sent successfully
 */
router.post("/register/send-otp", sendRegisterOtp);

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Register a new user with OTP
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RegisterBody'
 *     responses:
 *       201:
 *         description: User registered successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 */
router.post("/register", register);

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Login with email and password
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginBody'
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 */
router.post("/login", login);

/**
 * @swagger
 * /api/auth/password/send-otp:
 *   post:
 *     summary: Send OTP for password change flow
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SendOtpBody'
 *     responses:
 *       200:
 *         description: OTP sent successfully
 */
router.post("/password/send-otp", sendChangePasswordOtp);

/**
 * @swagger
 * /api/auth/password/change:
 *   post:
 *     summary: Change password with OTP
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ChangePasswordBody'
 *     responses:
 *       200:
 *         description: Password changed successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/BasicResponse'
 */
router.post("/password/change", changePassword);

export default router;
