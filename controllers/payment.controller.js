import { PAYMENT_METHODS } from "../models/constants.js";
import {
    cancelPendingPaymentByInvoice,
    createPendingPayment,
    expireOverduePendingPayments,
    findLatestPendingPayment,
    getPaymentByInvoice,
    isPaymentExpired,
    listRecentPayments,
    markPaymentExpiredByInvoice,
    normalizePaymentMethod,
} from "../services/payment.service.js";
import {
    buildPaymentQrData,
    getPaymentQrSetupError,
} from "../services/payment-qr.service.js";
import {
    createPaymentPackage,
    getPaymentPackageBySelector,
    getPaymentPackagesCatalog,
    updatePaymentPackage,
} from "../services/payment-package.service.js";
import { getUserFeatureQuotaOverview } from "../services/feature-quota.service.js";
import { runPaymentSync, runPaymentSyncForInvoice } from "../services/payment-sync.service.js";

const MIN_BANK_TRANSFER_AMOUNT = 2000;

const normalizeTrimmedString = (value) => String(value ?? "").trim();

const sanitizeLimit = (value, fallback = 20, min = 1, max = 50) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        return fallback;
    }

    return Math.max(min, Math.min(max, Math.floor(parsed)));
};

const normalizeExternalRef = (value) =>
    normalizeTrimmedString(value).toUpperCase().replace(/[^A-Z0-9]/g, "");

const shouldManageAllPayments = (req) => req.user?.role === "admin";

const resolveBusinessErrorStatus = (error) => {
    if (Number.isInteger(error?.statusCode)) {
        return error.statusCode;
    }

    if (error?.code === 11000) {
        return 400;
    }

    const lowerMessage = String(error?.message || "").toLowerCase();
    if (
        lowerMessage.includes("invalid") ||
        lowerMessage.includes("required") ||
        lowerMessage.includes("unknown") ||
        lowerMessage.includes("only") ||
        lowerMessage.includes("valid active") ||
        lowerMessage.includes("minimum") ||
        lowerMessage.includes("at least") ||
        lowerMessage.includes("default free") ||
        lowerMessage.includes("does not require") ||
        lowerMessage.includes("active_package_limit_exceeded")
    ) {
        return 400;
    }

    if (lowerMessage.includes("not found")) {
        return 404;
    }

    return 500;
};

const buildSkippedSyncSummary = (message) => {
    const now = new Date().toISOString();
    return {
        source: "manual",
        startedAt: now,
        finishedAt: now,
        pendingChecked: 0,
        matchedPayments: 0,
        updatedPayments: 0,
        xgateRequests: 0,
        xgateTransactions: 0,
        skippedByRateLimit: false,
        status: "skipped",
        message,
    };
};

const expirePaymentIfNeeded = async (payment) => {
    if (!payment || !isPaymentExpired(payment)) {
        return payment;
    }

    const expiredPayment = await markPaymentExpiredByInvoice({
        invoiceNumber: payment.invoiceNumber,
    });

    if (expiredPayment) {
        return expiredPayment;
    }

    return {
        ...payment,
        status: "failed",
        failureReason: payment.failureReason || "expired",
        isExpired: true,
    };
};

const enrichPayment = (payment) => {
    if (!payment) {
        return null;
    }

    const paymentStatus = payment.status;
    const allowDisplayQr =
        payment.paymentMethod === "bank_transfer" && paymentStatus !== "failed";

    return {
        ...payment,
        paymentQr: allowDisplayQr ? buildPaymentQrData(payment) : null,
        paymentQrSetupError: allowDisplayQr
            ? getPaymentQrSetupError(payment.paymentMethod)
            : null,
    };
};

const resolvePaymentPackageForCheckout = async (payload = {}) => {
    const selectedPackage = await getPaymentPackageBySelector({
        packageId: payload.packageId,
        packageSlug: payload.packageSlug,
        pricingKey: payload.pricingKey,
        activeOnly: true,
    });

    if (!selectedPackage) {
        throw new Error("A valid active payment package is required");
    }

    return selectedPackage;
};

const validatePackageForCheckout = ({ selectedPackage, paymentMethod }) => {
    const packagePrice = Number(selectedPackage?.price ?? 0);

    if (selectedPackage?.isDefault || packagePrice <= 0) {
        throw new Error("Default free package does not require checkout");
    }

    if (paymentMethod === "bank_transfer" && packagePrice < MIN_BANK_TRANSFER_AMOUNT) {
        throw new Error(
            `Bank transfer amount must be at least ${MIN_BANK_TRANSFER_AMOUNT} VND`
        );
    }
};

const getPayments = async (req, res) => {
    try {
        await expireOverduePendingPayments();

        const invoiceNumber = normalizeTrimmedString(req.query.invoice_number);
        const ownerFilter = shouldManageAllPayments(req)
            ? {}
            : { userId: req.user.id };

        if (invoiceNumber) {
            const payment = await expirePaymentIfNeeded(
                await getPaymentByInvoice(invoiceNumber, ownerFilter)
            );
            return res.status(200).json({
                success: true,
                message: payment
                    ? "Payment retrieved successfully"
                    : "Payment not found",
                data: payment ? enrichPayment(payment) : null,
            });
        }

        const limit = sanitizeLimit(req.query.limit, 20, 1, 50);
        const items = await listRecentPayments(limit, ownerFilter);

        return res.status(200).json({
            success: true,
            message: "Payments retrieved successfully",
            data: items.map(enrichPayment),
            total: items.length,
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Failed to fetch payments",
            error: error.message,
        });
    }
};

const createPayment = async (req, res) => {
    try {
        await expireOverduePendingPayments();

        const paymentMethod = normalizePaymentMethod(req.body?.paymentMethod);
        if (!paymentMethod) {
            return res.status(400).json({
                success: false,
                message: `paymentMethod must be one of: ${PAYMENT_METHODS.join(", ")}`,
            });
        }

        const selectedPackage = await resolvePaymentPackageForCheckout(req.body);
        validatePackageForCheckout({ selectedPackage, paymentMethod });
        const existingPendingPayment = await findLatestPendingPayment({
            userId: req.user.id,
            packageId: selectedPackage.id,
            paymentMethod,
        });

        if (existingPendingPayment) {
            return res.status(200).json({
                success: true,
                message: "Existing pending payment reused successfully",
                data: enrichPayment(existingPendingPayment),
            });
        }

        const createdPayment = await createPendingPayment({
            userId: req.user.id,
            userEmail: req.user.email,
            userName: req.user.fullName || req.user.name,
            externalRef: req.body?.externalRef,
            pricingKey: selectedPackage.slug,
            packageId: selectedPackage.id,
            packageSlug: selectedPackage.slug,
            packageName: selectedPackage.name,
            packageFeatureKeys: selectedPackage.featureKeys,
            packageFeatureScopes: selectedPackage.featureScopes,
            amount: selectedPackage.price,
            currency: req.body?.currency,
            paymentMethod,
        });

        return res.status(201).json({
            success: true,
            message: "Payment created successfully",
            data: enrichPayment(createdPayment),
        });
    } catch (error) {
        return res.status(resolveBusinessErrorStatus(error)).json({
            success: false,
            message: "Failed to create payment",
            error: error.message,
        });
    }
};

const reconcilePayment = async (req, res) => {
    try {
        await expireOverduePendingPayments();

        const invoiceNumber = normalizeTrimmedString(req.body?.invoiceNumber);
        if (!invoiceNumber) {
            return res.status(400).json({
                success: false,
                message: "invoiceNumber is required",
            });
        }

        const ownerFilter = shouldManageAllPayments(req)
            ? {}
            : { userId: req.user.id };
        const currentPayment = await expirePaymentIfNeeded(
            await getPaymentByInvoice(invoiceNumber, ownerFilter)
        );
        if (!currentPayment) {
            return res.status(404).json({
                success: false,
                message: "Payment not found",
            });
        }

        if (
            currentPayment.status === "failed" &&
            currentPayment.failureReason === "expired"
        ) {
            return res.status(200).json({
                success: true,
                message: "Payment expired. Please create a new invoice.",
                data: {
                    invoiceNumber,
                    allowProceed: false,
                    payment: enrichPayment(currentPayment),
                    syncSummary: buildSkippedSyncSummary(
                        "Invoice expired before reconciliation"
                    ),
                },
            });
        }

        const syncSummary = await runPaymentSyncForInvoice({
            invoiceNumber,
            source: "manual",
        });
        const payment = await expirePaymentIfNeeded(
            await getPaymentByInvoice(invoiceNumber, ownerFilter)
        );

        if (!payment) {
            return res.status(404).json({
                success: false,
                message: "Payment not found",
            });
        }

        const allowProceed = payment.status === "paid";

        return res.status(200).json({
            success: true,
            message: allowProceed
                ? "Payment is paid and ready to proceed"
                : "Payment is still pending",
            data: {
                invoiceNumber,
                allowProceed,
                payment: enrichPayment(payment),
                syncSummary,
            },
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Failed to reconcile payment",
            error: error.message,
        });
    }
};

const cancelPayment = async (req, res) => {
    try {
        await expireOverduePendingPayments();

        const invoiceNumber = normalizeTrimmedString(req.body?.invoiceNumber);
        if (!invoiceNumber) {
            return res.status(400).json({
                success: false,
                message: "invoiceNumber is required",
            });
        }

        const ownerFilter = shouldManageAllPayments(req)
            ? {}
            : { userId: req.user.id };

        const currentPayment = await expirePaymentIfNeeded(
            await getPaymentByInvoice(invoiceNumber, ownerFilter)
        );

        if (!currentPayment) {
            return res.status(404).json({
                success: false,
                message: "Payment not found",
            });
        }

        if (currentPayment.status !== "pending") {
            return res.status(200).json({
                success: true,
                message: "Payment is no longer pending",
                data: {
                    invoiceNumber,
                    cancelled: false,
                    payment: enrichPayment(currentPayment),
                },
            });
        }

        const cancelledPayment = await cancelPendingPaymentByInvoice({
            invoiceNumber,
            userId: ownerFilter.userId,
        });

        if (!cancelledPayment) {
            const latestPayment = await getPaymentByInvoice(invoiceNumber, ownerFilter);

            return res.status(200).json({
                success: true,
                message: "Payment state changed before cancellation",
                data: {
                    invoiceNumber,
                    cancelled: false,
                    payment: latestPayment ? enrichPayment(latestPayment) : null,
                },
            });
        }

        return res.status(200).json({
            success: true,
            message: "Payment cancelled successfully",
            data: {
                invoiceNumber,
                cancelled: true,
                payment: enrichPayment(cancelledPayment),
            },
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Failed to cancel payment",
            error: error.message,
        });
    }
};

const syncPayments = async (_req, res) => {
    try {
        const summary = await runPaymentSync({ source: "manual" });

        return res.status(200).json({
            success: true,
            message: "Payment sync completed",
            data: summary,
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Failed to sync payments",
            error: error.message,
        });
    }
};

const verifyPayment = async (req, res) => {
    try {
        await expireOverduePendingPayments();

        const action = normalizeTrimmedString(req.body?.action).toLowerCase();

        if (action === "create") {
            const paymentMethod = normalizePaymentMethod(req.body?.paymentMethod);
            if (!paymentMethod) {
                return res.status(400).json({
                    success: false,
                    message: `paymentMethod must be one of: ${PAYMENT_METHODS.join(", ")}`,
                });
            }

            const selectedPackage = await resolvePaymentPackageForCheckout(req.body);
            validatePackageForCheckout({ selectedPackage, paymentMethod });
            const existingPendingPayment = await findLatestPendingPayment({
                userId: req.user.id,
                packageId: selectedPackage.id,
                paymentMethod,
            });

            if (existingPendingPayment) {
                return res.status(200).json({
                    success: true,
                    message: "Verification create action reused existing payment",
                    data: {
                        action,
                        allowProceed: existingPendingPayment.status === "paid",
                        payment: enrichPayment(existingPendingPayment),
                        nextStep:
                            existingPendingPayment.status === "paid"
                                ? "proceed"
                                : "show_qr_and_wait_for_sync",
                    },
                });
            }

            const createdPayment = await createPendingPayment({
                userId: req.user.id,
                userEmail: req.user.email,
                userName: req.user.fullName || req.user.name,
                externalRef: req.body?.externalRef,
                pricingKey: selectedPackage.slug,
                packageId: selectedPackage.id,
                packageSlug: selectedPackage.slug,
                packageName: selectedPackage.name,
                packageFeatureKeys: selectedPackage.featureKeys,
                packageFeatureScopes: selectedPackage.featureScopes,
                amount: selectedPackage.price,
                currency: req.body?.currency,
                paymentMethod,
            });

            return res.status(201).json({
                success: true,
                message: "Verification create action completed",
                data: {
                    action,
                    allowProceed: createdPayment.status === "paid",
                    payment: enrichPayment(createdPayment),
                    nextStep:
                        createdPayment.status === "paid"
                            ? "proceed"
                            : "show_qr_and_wait_for_sync",
                },
            });
        }

        if (action === "verify") {
            const invoiceNumber = normalizeTrimmedString(req.body?.invoiceNumber);
            if (!invoiceNumber) {
                return res.status(400).json({
                    success: false,
                    message: "invoiceNumber is required for verify action",
                });
            }

            const ownerFilter = shouldManageAllPayments(req)
                ? {}
                : { userId: req.user.id };
            const payment = await expirePaymentIfNeeded(
                await getPaymentByInvoice(invoiceNumber, ownerFilter)
            );
            if (!payment) {
                return res.status(404).json({
                    success: false,
                    message: "Payment not found",
                });
            }

            const expectedRef = normalizeExternalRef(req.body?.externalRef);
            const actualRef = normalizeExternalRef(payment.externalRef);

            if (expectedRef && actualRef && expectedRef !== actualRef) {
                return res.status(400).json({
                    success: false,
                    message: "externalRef does not match payment record",
                });
            }

            const allowProceed = payment.status === "paid";
            const isExpiredPayment =
                payment.status === "failed" && payment.failureReason === "expired";

            return res.status(200).json({
                success: true,
                message: allowProceed
                    ? "Payment verification succeeded"
                    : isExpiredPayment
                        ? "Payment verification expired"
                        : "Payment verification pending",
                data: {
                    action,
                    allowProceed,
                    payment: enrichPayment(payment),
                    decision: allowProceed
                        ? "proceed"
                        : isExpiredPayment
                            ? "create_new_invoice"
                            : "wait_for_payment",
                },
            });
        }

        return res.status(400).json({
            success: false,
            message: "action must be one of: create, verify",
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Failed to verify payment",
            error: error.message,
        });
    }
};

const getPaymentPackages = async (req, res) => {
    try {
        const includeInactive =
            shouldManageAllPayments(req) &&
            normalizeTrimmedString(req.query.include_inactive).toLowerCase() ===
            "true";
        const data = await getPaymentPackagesCatalog({ includeInactive });

        return res.status(200).json({
            success: true,
            message: "Payment packages retrieved successfully",
            data,
            total: data.packages.length,
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Failed to fetch payment packages",
            error: error.message,
        });
    }
};

const getMyFeatureQuotas = async (req, res) => {
    try {
        if (!req.user?.id) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized",
            });
        }

        const data = await getUserFeatureQuotaOverview({
            userId: req.user.id,
        });

        return res.status(200).json({
            success: true,
            message: "Feature quotas retrieved successfully",
            data,
        });
    } catch (error) {
        const statusCode = resolveBusinessErrorStatus(error);
        const errorMessage =
            String(error?.message || "").trim() ||
            "Failed to fetch feature quotas";

        return res.status(statusCode).json({
            success: false,
            message: errorMessage,
            error: errorMessage,
            errorCode: error?.code || null,
            details: error?.data || error?.details || null,
        });
    }
};

const postPaymentPackage = async (req, res) => {
    try {
        const createdPackage = await createPaymentPackage(req.body || {});

        return res.status(201).json({
            success: true,
            message: "Payment package created successfully",
            data: createdPackage,
        });
    } catch (error) {
        const statusCode = resolveBusinessErrorStatus(error);
        const errorMessage =
            String(error?.message || "").trim() || "Failed to create payment package";

        return res.status(statusCode).json({
            success: false,
            message: errorMessage,
            error: errorMessage,
            errorCode: error?.code || null,
            details: error?.details || null,
        });
    }
};

const patchPaymentPackage = async (req, res) => {
    try {
        const updatedPackage = await updatePaymentPackage(
            req.params.packageId,
            req.body || {}
        );

        return res.status(200).json({
            success: true,
            message: "Payment package updated successfully",
            data: updatedPackage,
        });
    } catch (error) {
        const statusCode = resolveBusinessErrorStatus(error);
        const errorMessage =
            String(error?.message || "").trim() || "Failed to update payment package";

        return res.status(statusCode).json({
            success: false,
            message: errorMessage,
            error: errorMessage,
            errorCode: error?.code || null,
            details: error?.details || null,
        });
    }
};

export {
    cancelPayment,
    createPayment,
    getPaymentPackages,
    getMyFeatureQuotas,
    getPayments,
    patchPaymentPackage,
    postPaymentPackage,
    reconcilePayment,
    syncPayments,
    verifyPayment,
};
