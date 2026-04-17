import mongoose from "mongoose";

import ExerciseAttempt from "../models/exercise-attempt.model.js";
import LearnConversation from "../models/learn-conversation.model.js";
import PaymentPackage from "../models/payment-package.model.js";
import Payment from "../models/payment.model.js";
import VocabularyAttempt from "../models/vocabulary-attempt.model.js";

const DEFAULT_FREE_PACKAGE_SLUG = "free";

const FEATURE_LABELS = {
    ai_speaking: "Luyen noi voi AI",
    exercise_library: "Thu vien bai tap",
    vocabulary_library: "Thu vien tu vung",
};

const QUOTA_PERIOD_LABELS = {
    day: "ngay",
    week: "tuan",
    month: "thang",
    billing_cycle: "chu ky goi",
    lifetime: "tron doi",
};

const SUPPORTED_FEATURE_KEYS = new Set(Object.keys(FEATURE_LABELS));

const FEATURE_USAGE_CONFIG = {
    ai_speaking: {
        model: LearnConversation,
        dateField: "startedAt",
    },
    exercise_library: {
        model: ExerciseAttempt,
        dateField: "submittedAt",
    },
    vocabulary_library: {
        model: VocabularyAttempt,
        dateField: "submittedAt",
    },
};

const BILLING_CYCLE_MONTH_SPAN = {
    month: 1,
    quarter: 3,
    year: 12,
};

const normalizeTrimmedString = (value) => String(value ?? "").trim();

const toSafeDate = (value, fallback = null) => {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
        return fallback;
    }

    return date;
};

const normalizeFeatureKeys = (featureKeys) =>
    Array.from(
        new Set(
            Array.isArray(featureKeys)
                ? featureKeys
                    .map((featureKey) => normalizeTrimmedString(featureKey))
                    .filter(Boolean)
                : []
        )
    );

const toNormalizedQuota = (value) => {
    if (value === null || value === undefined || value === "") {
        return null;
    }

    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
        return null;
    }

    return Math.floor(parsed);
};

const normalizeFeatureScopeList = (scopeList = []) =>
    Array.isArray(scopeList)
        ? scopeList
            .map((scopeItem) => ({
                featureKey: normalizeTrimmedString(scopeItem?.featureKey),
                accessLevel:
                    normalizeTrimmedString(scopeItem?.accessLevel).toLowerCase() ||
                    "basic",
                quota: toNormalizedQuota(scopeItem?.quota),
                quotaPeriod:
                    normalizeTrimmedString(scopeItem?.quotaPeriod).toLowerCase() ||
                    "month",
                note: normalizeTrimmedString(scopeItem?.note),
            }))
            .filter((scopeItem) => scopeItem.featureKey)
        : [];

const buildScopeByFeatureKey = ({ featureKeys, featureScopes }) => {
    const scopeMap = new Map(
        normalizeFeatureScopeList(featureScopes).map((scopeItem) => [
            scopeItem.featureKey,
            scopeItem,
        ])
    );

    const normalizedFeatureKeys = normalizeFeatureKeys(featureKeys);

    return new Map(
        normalizedFeatureKeys
            .map((featureKey) => {
                const scope = scopeMap.get(featureKey);
                if (!scope) {
                    return null;
                }

                return [featureKey, scope];
            })
            .filter(Boolean)
    );
};

const createQuotaError = ({
    statusCode = 400,
    code,
    message,
    data = null,
}) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.code = code;
    error.data = data;
    return error;
};

const resolveLatestPaidPackage = async (userId) => {
    const latestPaidPayment = await Payment.findOne({
        userId,
        status: "paid",
    })
        .sort({ paidAt: -1, createdAt: -1 })
        .select(
            "packageId packageSlug packageName packageFeatureKeys packageFeatureScopes paidAt createdAt"
        )
        .lean();

    if (!latestPaidPayment) {
        return null;
    }

    let packageDoc = null;
    if (latestPaidPayment.packageId && mongoose.Types.ObjectId.isValid(latestPaidPayment.packageId)) {
        packageDoc = await PaymentPackage.findById(latestPaidPayment.packageId)
            .select("name slug billingCycle featureKeys featureScopes")
            .lean();
    }

    const featureKeys =
        normalizeFeatureKeys(latestPaidPayment.packageFeatureKeys).length > 0
            ? normalizeFeatureKeys(latestPaidPayment.packageFeatureKeys)
            : normalizeFeatureKeys(packageDoc?.featureKeys);

    const scopeByFeatureKey = buildScopeByFeatureKey({
        featureKeys,
        featureScopes:
            normalizeFeatureScopeList(latestPaidPayment.packageFeatureScopes).length > 0
                ? latestPaidPayment.packageFeatureScopes
                : packageDoc?.featureScopes,
    });

    return {
        source: "paid_payment",
        packageName:
            normalizeTrimmedString(latestPaidPayment.packageName) ||
            normalizeTrimmedString(packageDoc?.name) ||
            "Paid package",
        packageSlug:
            normalizeTrimmedString(latestPaidPayment.packageSlug) ||
            normalizeTrimmedString(packageDoc?.slug) ||
            null,
        billingCycle:
            normalizeTrimmedString(packageDoc?.billingCycle).toLowerCase() || "month",
        anchorDate:
            toSafeDate(latestPaidPayment.paidAt) ||
            toSafeDate(latestPaidPayment.createdAt) ||
            new Date(),
        scopeByFeatureKey,
    };
};

const resolveDefaultFreePackage = async () => {
    const defaultPackage = await PaymentPackage.findOne({
        isActive: true,
        $or: [{ isDefault: true }, { slug: DEFAULT_FREE_PACKAGE_SLUG }],
    })
        .sort({ isDefault: -1, updatedAt: -1 })
        .lean();

    if (!defaultPackage) {
        return null;
    }

    const featureKeys = normalizeFeatureKeys(defaultPackage.featureKeys);
    const scopeByFeatureKey = buildScopeByFeatureKey({
        featureKeys,
        featureScopes: defaultPackage.featureScopes,
    });

    return {
        source: "default_package",
        packageName: normalizeTrimmedString(defaultPackage.name) || "Free",
        packageSlug: normalizeTrimmedString(defaultPackage.slug) || DEFAULT_FREE_PACKAGE_SLUG,
        billingCycle:
            normalizeTrimmedString(defaultPackage.billingCycle).toLowerCase() || "month",
        anchorDate: toSafeDate(defaultPackage.createdAt) || new Date(),
        scopeByFeatureKey,
    };
};

const resolveUserEntitlement = async (userId) => {
    const paidPackage = await resolveLatestPaidPackage(userId);
    if (paidPackage) {
        return paidPackage;
    }

    const defaultPackage = await resolveDefaultFreePackage();
    if (defaultPackage) {
        return defaultPackage;
    }

    throw createQuotaError({
        statusCode: 500,
        code: "FEATURE_PACKAGE_NOT_CONFIGURED",
        message:
            "He thong chua co goi mac dinh cho nguoi dung. Vui long cau hinh goi Free mac dinh.",
    });
};

const toUtcStartOfDay = (date) =>
    new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

const addUtcDays = (date, days) => new Date(date.getTime() + days * 24 * 60 * 60 * 1000);

const addUtcMonths = (date, months) => {
    const next = new Date(date.getTime());
    next.setUTCMonth(next.getUTCMonth() + months);
    return next;
};

const resolveBillingCycleWindow = ({ billingCycle, anchorDate, now }) => {
    const normalizedBillingCycle = normalizeTrimmedString(billingCycle).toLowerCase();
    if (normalizedBillingCycle === "one_time") {
        return {
            start: new Date(0),
            end: null,
        };
    }

    const monthSpan = BILLING_CYCLE_MONTH_SPAN[normalizedBillingCycle] || 1;
    const safeAnchorDate = toSafeDate(anchorDate, null);

    if (!safeAnchorDate) {
        const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
        return {
            start,
            end: addUtcMonths(start, monthSpan),
        };
    }

    let start = new Date(safeAnchorDate.getTime());
    let end = addUtcMonths(start, monthSpan);

    while (end.getTime() <= now.getTime()) {
        start = end;
        end = addUtcMonths(start, monthSpan);
    }

    return {
        start,
        end,
    };
};

const resolveQuotaWindow = ({ quotaPeriod, billingCycle, anchorDate, now = new Date() }) => {
    const normalizedQuotaPeriod = normalizeTrimmedString(quotaPeriod).toLowerCase() || "month";

    if (normalizedQuotaPeriod === "lifetime") {
        return {
            start: new Date(0),
            end: null,
        };
    }

    if (normalizedQuotaPeriod === "billing_cycle") {
        return resolveBillingCycleWindow({
            billingCycle,
            anchorDate,
            now,
        });
    }

    if (normalizedQuotaPeriod === "day") {
        const start = toUtcStartOfDay(now);
        return {
            start,
            end: addUtcDays(start, 1),
        };
    }

    if (normalizedQuotaPeriod === "week") {
        const startOfDay = toUtcStartOfDay(now);
        const currentWeekDay = (startOfDay.getUTCDay() + 6) % 7;
        const start = addUtcDays(startOfDay, -currentWeekDay);

        return {
            start,
            end: addUtcDays(start, 7),
        };
    }

    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    return {
        start,
        end: addUtcMonths(start, 1),
    };
};

const countFeatureUsage = async ({ userId, featureKey, start, end }) => {
    const usageConfig = FEATURE_USAGE_CONFIG[featureKey];
    if (!usageConfig) {
        return 0;
    }

    const dateFilter = end
        ? { $gte: start, $lt: end }
        : { $gte: start };

    return usageConfig.model.countDocuments({
        userId,
        [usageConfig.dateField]: dateFilter,
    });
};

const ensureFeatureAccessAndQuota = async ({
    userId,
    featureKey,
    enforceQuota = false,
} = {}) => {
    const normalizedFeatureKey = normalizeTrimmedString(featureKey);

    if (!SUPPORTED_FEATURE_KEYS.has(normalizedFeatureKey)) {
        throw createQuotaError({
            statusCode: 400,
            code: "FEATURE_NOT_SUPPORTED",
            message: `Unsupported feature key: ${normalizedFeatureKey}`,
        });
    }

    const entitlement = await resolveUserEntitlement(userId);
    const scope = entitlement.scopeByFeatureKey.get(normalizedFeatureKey);

    if (!scope) {
        throw createQuotaError({
            statusCode: 403,
            code: "FEATURE_NOT_ENABLED",
            message: `${FEATURE_LABELS[normalizedFeatureKey]} chua duoc mo trong goi hien tai.`,
            data: {
                featureKey: normalizedFeatureKey,
                packageName: entitlement.packageName,
                packageSlug: entitlement.packageSlug,
            },
        });
    }

    const quotaValue = toNormalizedQuota(scope.quota);
    if (!enforceQuota || quotaValue === null) {
        return {
            featureKey: normalizedFeatureKey,
            featureLabel: FEATURE_LABELS[normalizedFeatureKey],
            packageName: entitlement.packageName,
            packageSlug: entitlement.packageSlug,
            accessLevel: scope.accessLevel,
            quota: quotaValue,
            used: null,
            remaining: null,
            quotaPeriod: scope.quotaPeriod,
            quotaPeriodLabel:
                QUOTA_PERIOD_LABELS[scope.quotaPeriod] || scope.quotaPeriod || "thang",
            periodStart: null,
            periodEnd: null,
            source: entitlement.source,
        };
    }

    const quotaWindow = resolveQuotaWindow({
        quotaPeriod: scope.quotaPeriod,
        billingCycle: entitlement.billingCycle,
        anchorDate: entitlement.anchorDate,
    });

    const usedCount = await countFeatureUsage({
        userId,
        featureKey: normalizedFeatureKey,
        start: quotaWindow.start,
        end: quotaWindow.end,
    });

    const remaining = Math.max(0, quotaValue - usedCount);
    if (usedCount >= quotaValue) {
        throw createQuotaError({
            statusCode: 429,
            code: "FEATURE_QUOTA_EXCEEDED",
            message: `Ban da dung het quota ${FEATURE_LABELS[normalizedFeatureKey]} (${quotaValue} luot/${QUOTA_PERIOD_LABELS[scope.quotaPeriod] || scope.quotaPeriod}).`,
            data: {
                featureKey: normalizedFeatureKey,
                featureLabel: FEATURE_LABELS[normalizedFeatureKey],
                packageName: entitlement.packageName,
                packageSlug: entitlement.packageSlug,
                accessLevel: scope.accessLevel,
                quota: quotaValue,
                used: usedCount,
                remaining: 0,
                quotaPeriod: scope.quotaPeriod,
                quotaPeriodLabel:
                    QUOTA_PERIOD_LABELS[scope.quotaPeriod] || scope.quotaPeriod || "thang",
                periodStart: quotaWindow.start.toISOString(),
                periodEnd: quotaWindow.end ? quotaWindow.end.toISOString() : null,
                source: entitlement.source,
            },
        });
    }

    return {
        featureKey: normalizedFeatureKey,
        featureLabel: FEATURE_LABELS[normalizedFeatureKey],
        packageName: entitlement.packageName,
        packageSlug: entitlement.packageSlug,
        accessLevel: scope.accessLevel,
        quota: quotaValue,
        used: usedCount,
        remaining,
        quotaPeriod: scope.quotaPeriod,
        quotaPeriodLabel:
            QUOTA_PERIOD_LABELS[scope.quotaPeriod] || scope.quotaPeriod || "thang",
        periodStart: quotaWindow.start.toISOString(),
        periodEnd: quotaWindow.end ? quotaWindow.end.toISOString() : null,
        source: entitlement.source,
    };
};

const getUserFeatureQuotaOverview = async ({ userId } = {}) => {
    const normalizedUserId = normalizeTrimmedString(userId);
    if (!normalizedUserId) {
        throw createQuotaError({
            statusCode: 400,
            code: "FEATURE_QUOTA_INVALID_USER",
            message: "userId is required to resolve feature quota overview",
        });
    }

    const entitlement = await resolveUserEntitlement(normalizedUserId);
    const featureKeys = Array.from(SUPPORTED_FEATURE_KEYS);

    const features = await Promise.all(
        featureKeys.map(async (featureKey) => {
            const scope = entitlement.scopeByFeatureKey.get(featureKey);

            if (!scope) {
                return {
                    featureKey,
                    featureLabel: FEATURE_LABELS[featureKey],
                    enabled: false,
                    accessLevel: null,
                    quota: null,
                    used: null,
                    remaining: null,
                    isUnlimited: false,
                    isBlocked: true,
                    quotaPeriod: null,
                    quotaPeriodLabel: null,
                    periodStart: null,
                    periodEnd: null,
                    note: "",
                };
            }

            const quotaValue = toNormalizedQuota(scope.quota);
            const quotaPeriodLabel =
                QUOTA_PERIOD_LABELS[scope.quotaPeriod] || scope.quotaPeriod || "thang";

            if (quotaValue === null) {
                return {
                    featureKey,
                    featureLabel: FEATURE_LABELS[featureKey],
                    enabled: true,
                    accessLevel: scope.accessLevel,
                    quota: null,
                    used: null,
                    remaining: null,
                    isUnlimited: true,
                    isBlocked: false,
                    quotaPeriod: scope.quotaPeriod,
                    quotaPeriodLabel,
                    periodStart: null,
                    periodEnd: null,
                    note: scope.note,
                };
            }

            const quotaWindow = resolveQuotaWindow({
                quotaPeriod: scope.quotaPeriod,
                billingCycle: entitlement.billingCycle,
                anchorDate: entitlement.anchorDate,
            });

            const usedCount = await countFeatureUsage({
                userId: normalizedUserId,
                featureKey,
                start: quotaWindow.start,
                end: quotaWindow.end,
            });

            const remaining = Math.max(0, quotaValue - usedCount);

            return {
                featureKey,
                featureLabel: FEATURE_LABELS[featureKey],
                enabled: true,
                accessLevel: scope.accessLevel,
                quota: quotaValue,
                used: usedCount,
                remaining,
                isUnlimited: false,
                isBlocked: usedCount >= quotaValue,
                quotaPeriod: scope.quotaPeriod,
                quotaPeriodLabel,
                periodStart: quotaWindow.start.toISOString(),
                periodEnd: quotaWindow.end ? quotaWindow.end.toISOString() : null,
                note: scope.note,
            };
        })
    );

    return {
        generatedAt: new Date().toISOString(),
        packageName: entitlement.packageName,
        packageSlug: entitlement.packageSlug,
        billingCycle: entitlement.billingCycle,
        source: entitlement.source,
        features,
    };
};

export { ensureFeatureAccessAndQuota, getUserFeatureQuotaOverview };