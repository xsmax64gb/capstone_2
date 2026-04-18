import Payment from "../models/payment.model.js";
import { PAYMENT_METHODS } from "../models/constants.js";

const DEFAULT_CURRENCY = "VND";
const DEFAULT_PAYMENT_METHOD = "bank_transfer";
const DEFAULT_PAYMENT_QR_TTL_SECONDS = 180;
const MIN_PAYMENT_QR_TTL_SECONDS = 60;
const MAX_PAYMENT_QR_TTL_SECONDS = 30 * 60;
const MIN_BANK_TRANSFER_AMOUNT = 2000;
const EXPIRED_PAYMENT_REASON = "expired";
const CANCELLED_BY_USER_REASON = "cancelled_by_user";

const normalizeTrimmedString = (value) => String(value ?? "").trim();

const toIsoDate = (value) => {
    if (!value) {
        return null;
    }

    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
        return null;
    }

    return date.toISOString();
};

const sanitizeLimit = (value, min = 1, max = 100, fallback = 10) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        return fallback;
    }

    return Math.max(min, Math.min(max, Math.floor(parsed)));
};

const sanitizePositiveInt = (value, fallback, min = 1, max = 86400) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        return fallback;
    }

    return Math.max(min, Math.min(max, Math.floor(parsed)));
};

const resolvePaymentQrTtlSeconds = () =>
    sanitizePositiveInt(
        process.env.PAYMENT_QR_TTL_SECONDS,
        DEFAULT_PAYMENT_QR_TTL_SECONDS,
        MIN_PAYMENT_QR_TTL_SECONDS,
        MAX_PAYMENT_QR_TTL_SECONDS
    );

const resolvePaymentExpiresAt = (baseDate = new Date()) => {
    const ttlSeconds = resolvePaymentQrTtlSeconds();
    return new Date(baseDate.getTime() + ttlSeconds * 1000);
};

const isPaymentExpired = (payment, now = new Date()) => {
    if (!payment || payment.status !== "pending") {
        return false;
    }

    const expiresDate = payment.expiresAt ? new Date(payment.expiresAt) : null;
    if (!expiresDate || Number.isNaN(expiresDate.getTime())) {
        return false;
    }

    return expiresDate.getTime() <= now.getTime();
};

const parsePaymentDate = (value) => {
    if (!value) {
        return null;
    }

    const parsed = value instanceof Date ? new Date(value.getTime()) : new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const canApplyXGatePayment = (payment, { now = new Date(), transactionDate = null } = {}) => {
    if (!payment || payment.status === "paid") {
        return false;
    }

    const expiresAt = parsePaymentDate(payment.expiresAt);
    const paidWithinWindow =
        expiresAt && transactionDate && transactionDate.getTime() <= expiresAt.getTime();

    if (payment.status === "pending") {
        if (!expiresAt) {
            return true;
        }

        return expiresAt.getTime() > now.getTime() || paidWithinWindow;
    }

    return payment.status === "failed"
        && payment.failureReason === EXPIRED_PAYMENT_REASON
        && Boolean(paidWithinWindow);
};

const normalizeCurrency = (value) => {
    const normalized = normalizeTrimmedString(value).toUpperCase();
    return normalized || DEFAULT_CURRENCY;
};

const normalizePaymentMethod = (value) => {
    const normalized = normalizeTrimmedString(value).toLowerCase();
    if (!normalized) {
        return DEFAULT_PAYMENT_METHOD;
    }

    return PAYMENT_METHODS.includes(normalized) ? normalized : null;
};

const pad2 = (value) => String(value).padStart(2, "0");

const toNormalizedScopeQuota = (value) => {
    if (value === null || value === undefined || value === "") {
        return null;
    }

    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
        return null;
    }

    return Math.floor(parsed);
};

const normalizePackageFeatureScopes = (scopeList = [], featureKeys = []) => {
    const mapped = Array.isArray(scopeList)
        ? scopeList
            .map((scope) => ({
                featureKey: normalizeTrimmedString(scope?.featureKey),
                accessLevel: normalizeTrimmedString(scope?.accessLevel).toLowerCase() || "basic",
                quota: toNormalizedScopeQuota(scope?.quota),
                quotaPeriod: normalizeTrimmedString(scope?.quotaPeriod).toLowerCase() || "month",
                note: normalizeTrimmedString(scope?.note),
            }))
            .filter((scope) => scope.featureKey)
        : [];

    if (mapped.length > 0) {
        return mapped;
    }

    return featureKeys
        .map((featureKey) => normalizeTrimmedString(featureKey))
        .filter(Boolean)
        .map((featureKey) => ({
            featureKey,
            accessLevel: "basic",
            quota: null,
            quotaPeriod: "billing_cycle",
            note: "",
        }));
};

const mapPaymentDoc = (doc) => {
    if (!doc) {
        return null;
    }

    const packageFeatureKeys = Array.isArray(doc.packageFeatureKeys)
        ? doc.packageFeatureKeys
        : [];
    const packageFeatureScopes = normalizePackageFeatureScopes(
        doc.packageFeatureScopes,
        packageFeatureKeys
    );

    return {
        id: String(doc._id),
        userId: doc.userId ? String(doc.userId) : null,
        invoiceNumber: doc.invoiceNumber,
        externalRef: doc.externalRef ?? null,
        pricingKey: doc.pricingKey ?? null,
        packageId: doc.packageId ? String(doc.packageId) : null,
        packageSlug: doc.packageSlug ?? null,
        packageName: doc.packageName ?? null,
        packageFeatureKeys,
        packageFeatureScopes,
        amount: Number(doc.amount ?? 0),
        currency: doc.currency,
        paymentMethod: doc.paymentMethod,
        status: doc.status,
        xgateReference: doc.xgateReference ?? null,
        matchedContent: doc.matchedContent ?? null,
        createdAt: toIsoDate(doc.createdAt),
        updatedAt: toIsoDate(doc.updatedAt),
        paidAt: toIsoDate(doc.paidAt),
        syncedAt: toIsoDate(doc.syncedAt),
        expiresAt: toIsoDate(doc.expiresAt),
        failureReason: doc.failureReason ?? null,
        isExpired: isPaymentExpired({
            status: doc.status,
            expiresAt: toIsoDate(doc.expiresAt),
        }),
    };
};

const generateInvoiceNumber = () => {
    const now = new Date();
    const date = `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}`;
    const time = `${pad2(now.getHours())}${pad2(now.getMinutes())}${pad2(now.getSeconds())}`;
    const random = Math.floor(1000 + Math.random() * 9000);

    return `PAY-${date}-${time}-${random}`;
};

const createPendingPayment = async (input = {}) => {
    const amount = Number(input.amount);
    if (!Number.isFinite(amount) || amount < 0) {
        throw new Error("Invalid payment amount");
    }

    const normalizedUserId = normalizeTrimmedString(input.userId);
    if (!normalizedUserId) {
        throw new Error("Payment owner is required");
    }

    const paymentMethod = normalizePaymentMethod(input.paymentMethod);
    if (!paymentMethod) {
        throw new Error(`paymentMethod must be one of: ${PAYMENT_METHODS.join(", ")}`);
    }

    if (paymentMethod === "bank_transfer" && amount < MIN_BANK_TRANSFER_AMOUNT) {
        throw new Error(
            `Bank transfer amount must be at least ${MIN_BANK_TRANSFER_AMOUNT} VND`
        );
    }

    const payload = {
        userId: normalizedUserId,
        userEmail: normalizeTrimmedString(input.userEmail) || null,
        userName: normalizeTrimmedString(input.userName) || null,
        externalRef: normalizeTrimmedString(input.externalRef) || null,
        pricingKey: normalizeTrimmedString(input.pricingKey) || null,
        packageId: normalizeTrimmedString(input.packageId) || null,
        packageSlug: normalizeTrimmedString(input.packageSlug) || null,
        packageName: normalizeTrimmedString(input.packageName) || null,
        packageFeatureKeys: Array.isArray(input.packageFeatureKeys)
            ? input.packageFeatureKeys
                .map((value) => normalizeTrimmedString(value))
                .filter(Boolean)
            : [],
        packageFeatureScopes: normalizePackageFeatureScopes(
            input.packageFeatureScopes,
            input.packageFeatureKeys
        ),
        amount,
        currency: normalizeCurrency(input.currency),
        paymentMethod,
        status: "pending",
        expiresAt: resolvePaymentExpiresAt(),
        failureReason: null,
    };

    const requestedInvoice = normalizeTrimmedString(input.invoiceNumber);
    let initialInvoice = requestedInvoice || generateInvoiceNumber();

    for (let attempt = 0; attempt < 5; attempt += 1) {
        const invoiceNumber = attempt === 0 ? initialInvoice : generateInvoiceNumber();

        try {
            const created = await Payment.create({
                ...payload,
                invoiceNumber,
            });

            return mapPaymentDoc(created);
        } catch (error) {
            if (error?.code === 11000) {
                if (requestedInvoice) {
                    throw new Error("invoiceNumber already exists");
                }

                initialInvoice = generateInvoiceNumber();
                continue;
            }

            throw error;
        }
    }

    throw new Error("Unable to generate unique invoice number");
};

const getPaymentByInvoice = async (invoiceNumber, options = {}) => {
    const normalizedInvoice = normalizeTrimmedString(invoiceNumber);
    if (!normalizedInvoice) {
        return null;
    }

    const filter = { invoiceNumber: normalizedInvoice };
    const normalizedUserId = normalizeTrimmedString(options.userId);
    if (normalizedUserId) {
        filter.userId = normalizedUserId;
    }

    const payment = await Payment.findOne(filter).lean();
    return mapPaymentDoc(payment);
};

const listRecentPayments = async (limit = 10, options = {}) => {
    const safeLimit = sanitizeLimit(limit, 1, 50, 20);
    const filter = {};
    const normalizedUserId = normalizeTrimmedString(options.userId);
    if (normalizedUserId) {
        filter.userId = normalizedUserId;
    }

    const items = await Payment.find(filter)
        .sort({ createdAt: -1 })
        .limit(safeLimit)
        .lean();

    return items.map(mapPaymentDoc);
};

const findLatestPendingPayment = async ({ userId, packageId, paymentMethod } = {}) => {
    const normalizedUserId = normalizeTrimmedString(userId);
    const normalizedPackageId = normalizeTrimmedString(packageId);
    const normalizedMethod = normalizePaymentMethod(paymentMethod);

    if (!normalizedUserId || !normalizedPackageId || !normalizedMethod) {
        return null;
    }

    const now = new Date();
    const payment = await Payment.findOne({
        userId: normalizedUserId,
        packageId: normalizedPackageId,
        paymentMethod: normalizedMethod,
        status: "pending",
        $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
    })
        .sort({ createdAt: -1 })
        .lean();

    return mapPaymentDoc(payment);
};

const listPendingPayments = async (limit = 200) => {
    const safeLimit = sanitizeLimit(limit, 1, 500, 200);
    const items = await Payment.find({ status: "pending" })
        .sort({ createdAt: 1 })
        .limit(safeLimit)
        .lean();

    return items.map(mapPaymentDoc);
};

const expireOverduePendingPayments = async ({ reason = EXPIRED_PAYMENT_REASON } = {}) => {
    const now = new Date();
    const result = await Payment.updateMany(
        {
            status: "pending",
            expiresAt: { $ne: null, $lte: now },
        },
        {
            $set: {
                status: "failed",
                failureReason: reason,
                syncedAt: now,
            },
        }
    );

    return Number(result.modifiedCount ?? 0);
};

const markPaymentExpiredByInvoice = async ({
    invoiceNumber,
    reason = EXPIRED_PAYMENT_REASON,
    force = false,
} = {}) => {
    const normalizedInvoice = normalizeTrimmedString(invoiceNumber);
    if (!normalizedInvoice) {
        return null;
    }

    const now = new Date();
    const filter = {
        invoiceNumber: normalizedInvoice,
        status: "pending",
    };

    if (!force) {
        filter.expiresAt = { $ne: null, $lte: now };
    }

    const expired = await Payment.findOneAndUpdate(
        filter,
        {
            $set: {
                status: "failed",
                failureReason: reason,
                syncedAt: now,
            },
        },
        {
            new: true,
        }
    ).lean();

    return mapPaymentDoc(expired);
};

const cancelPendingPaymentByInvoice = async ({
    invoiceNumber,
    userId,
    reason = CANCELLED_BY_USER_REASON,
} = {}) => {
    const normalizedInvoice = normalizeTrimmedString(invoiceNumber);
    if (!normalizedInvoice) {
        return null;
    }

    const filter = {
        invoiceNumber: normalizedInvoice,
        status: "pending",
    };

    const normalizedUserId = normalizeTrimmedString(userId);
    if (normalizedUserId) {
        filter.userId = normalizedUserId;
    }

    const cancelled = await Payment.findOneAndUpdate(
        filter,
        {
            $set: {
                status: "failed",
                failureReason: normalizeTrimmedString(reason) || CANCELLED_BY_USER_REASON,
                syncedAt: new Date(),
            },
        },
        {
            new: true,
        }
    ).lean();

    return mapPaymentDoc(cancelled);
};

const countPendingPayments = async () => Payment.countDocuments({ status: "pending" });

const markPaymentPaidByInvoice = async ({
    invoiceNumber,
    xgateReference,
    matchedContent,
    transactionDate,
}) => {
    const normalizedInvoice = normalizeTrimmedString(invoiceNumber);
    if (!normalizedInvoice) {
        return 0;
    }

    const now = new Date();
    const normalizedTransactionDate = parsePaymentDate(transactionDate);
    const payment = await Payment.findOne({
        invoiceNumber: normalizedInvoice,
    });

    if (!payment) {
        return 0;
    }

    if (!canApplyXGatePayment(payment, { now, transactionDate: normalizedTransactionDate })) {
        if (payment.status === "pending") {
            await markPaymentExpiredByInvoice({
                invoiceNumber: normalizedInvoice,
            });
        }

        return 0;
    }

    payment.status = "paid";
    payment.xgateReference = normalizeTrimmedString(xgateReference) || null;
    payment.matchedContent =
        typeof matchedContent === "string" && matchedContent.length > 0
            ? matchedContent
            : null;
    payment.paidAt = payment.paidAt || normalizedTransactionDate || now;
    payment.syncedAt = now;
    payment.failureReason = null;

    await payment.save();
    return 1;
};

const markPaymentSyncedAt = async (invoiceNumber) => {
    const normalizedInvoice = normalizeTrimmedString(invoiceNumber);
    if (!normalizedInvoice) {
        return 0;
    }

    const result = await Payment.updateOne(
        { invoiceNumber: normalizedInvoice },
        {
            $set: {
                syncedAt: new Date(),
            },
        }
    );

    return Number(result.modifiedCount ?? 0);
};

const getLatestSyncedAt = async () => {
    const latest = await Payment.findOne({ syncedAt: { $ne: null } })
        .sort({ syncedAt: -1 })
        .select("syncedAt")
        .lean();

    return toIsoDate(latest?.syncedAt ?? null);
};

export {
    cancelPendingPaymentByInvoice,
    countPendingPayments,
    createPendingPayment,
    expireOverduePendingPayments,
    findLatestPendingPayment,
    generateInvoiceNumber,
    getLatestSyncedAt,
    getPaymentByInvoice,
    isPaymentExpired,
    listPendingPayments,
    listRecentPayments,
    markPaymentExpiredByInvoice,
    mapPaymentDoc,
    markPaymentPaidByInvoice,
    markPaymentSyncedAt,
    resolvePaymentQrTtlSeconds,
    normalizePaymentMethod,
};
