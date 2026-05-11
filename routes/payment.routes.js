import express from "express";

import {
    cancelPayment,
    createPayment,
    getMyFeatureQuotas,
    getPaymentPackages,
    getPayments,
    handleXGatePaymentWebhook,
    patchPaymentPackage,
    postPaymentPackage,
    reconcilePayment,
    removePaymentPackage,
    syncPayments,
    verifyPayment,
} from "../controllers/payment.controller.js";
import { requireAdmin, requireAuth } from "../middleware/auth.middleware.js";

const router = express.Router();

router.post("/payments/xgate/webhook", handleXGatePaymentWebhook);
router.get("/payments", requireAuth, getPayments);
router.post("/payments", requireAuth, createPayment);
router.post("/payments/cancel", requireAuth, cancelPayment);
router.post("/payments/reconcile", requireAuth, reconcilePayment);
router.post("/payments/sync", requireAuth, requireAdmin, syncPayments);
router.post("/payments/verify", requireAuth, verifyPayment);
router.get("/feature-quotas", requireAuth, getMyFeatureQuotas);

router.get("/payment-packages", requireAuth, getPaymentPackages);
router.post("/payment-packages", requireAuth, requireAdmin, postPaymentPackage);
router.patch(
    "/payment-packages/:packageId",
    requireAuth,
    requireAdmin,
    patchPaymentPackage
);
router.delete(
    "/payment-packages/:packageId",
    requireAuth,
    requireAdmin,
    removePaymentPackage
);

export default router;
