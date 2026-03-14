import express from "express";

import {
  changePasswordWithOtp,
  login,
  register,
  requestPasswordOtp,
  requestRegisterOtp,
} from "../controllers/index.js";

const router = express.Router();

router.post("/register/request-otp", requestRegisterOtp);
router.post("/register", register);
router.post("/login", login);
router.post("/password/request-otp", requestPasswordOtp);
router.post("/password/change", changePasswordWithOtp);

export default router;
