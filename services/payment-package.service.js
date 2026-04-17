import mongoose from "mongoose";
import PaymentPackage, {
    FEATURE_SCOPE_PERIODS,
    PAYMENT_PACKAGE_BILLING_CYCLES,
} from "../models/payment-package.model.js";

const MAX_ACTIVE_PAYMENT_PACKAGES = 3;
const MIN_PAID_PACKAGE_PRICE = 2000;
const DEFAULT_FREE_PACKAGE_SLUG = "free";
const DEFAULT_FREE_PACKAGE_NAME = "Free";
const FEATURE_ACCESS_LEVEL_OPTIONS = ["basic", "standard", "advanced", "full"];
const FEATURE_SCOPE_PERIOD_LOOKUP = new Set(FEATURE_SCOPE_PERIODS);
const FEATURE_ACCESS_LEVEL_LOOKUP = new Set(FEATURE_ACCESS_LEVEL_OPTIONS);

const PAYMENT_PACKAGE_FEATURE_CATALOG = [
    {
        key: "ai_speaking",
        label: "Luyện nói với AI",
        description: "Trò chuyện thời gian thực với AI và nhận phản hồi ngay.",
        category: "Speaking",
    },
    {
        key: "exercise_library",
        label: "Thư viện bài tập",
        description: "Mở toàn bộ bài tập ngữ pháp và đọc hiểu theo cấp độ.",
        category: "Practice",
    },
    {
        key: "vocabulary_library",
        label: "Thư viện từ vựng",
        description: "Học, lưu và ôn tập từ vựng theo chủ đề.",
        category: "Từ vựng",
    },
];

const FEATURE_SCOPE_PRESETS_BY_TIER = {
    go: {
        ai_speaking: {
            accessLevel: "basic",
            quota: 50,
            quotaPeriod: "month",
            note: "Tối đa 50 lượt luyện nói AI mỗi tháng.",
        },
        exercise_library: {
            accessLevel: "standard",
            quota: 120,
            quotaPeriod: "week",
            note: "Mở thư viện bài tập với 120 lượt/tuần.",
        },
        vocabulary_library: {
            accessLevel: "standard",
            quota: 300,
            quotaPeriod: "week",
            note: "Ôn tập và học mới tối đa 300 mục/tuần.",
        },
    },
    plus: {
        ai_speaking: {
            accessLevel: "advanced",
            quota: 240,
            quotaPeriod: "month",
            note: "Tối đa 240 lượt luyện nói AI mỗi tháng.",
        },
        exercise_library: {
            accessLevel: "advanced",
            quota: 500,
            quotaPeriod: "week",
            note: "Mở rộng kho bài tập với 500 lượt/tuần.",
        },
        vocabulary_library: {
            accessLevel: "advanced",
            quota: 1200,
            quotaPeriod: "week",
            note: "Mở rộng ôn tập từ vựng 1.200 mục/tuần.",
        },
    },
    pro: {
        ai_speaking: {
            accessLevel: "full",
            quota: 1200,
            quotaPeriod: "month",
            note: "Tối đa 1.200 lượt luyện nói AI mỗi tháng.",
        },
        exercise_library: {
            accessLevel: "full",
            quota: null,
            quotaPeriod: "billing_cycle",
            note: "Mở đầy đủ thư viện bài tập không giới hạn.",
        },
        vocabulary_library: {
            accessLevel: "full",
            quota: null,
            quotaPeriod: "billing_cycle",
            note: "Mở đầy đủ thư viện từ vựng không giới hạn.",
        },
    },
};

const PAYMENT_PACKAGE_FEATURE_LOOKUP = new Set(
    PAYMENT_PACKAGE_FEATURE_CATALOG.map((item) => item.key)
);

const buildActiveLimitExceededError = ({ operation, activeCount }) => {
    const normalizedOperation = normalizeTrimmedString(operation).toLowerCase();
    const operationLabel =
        normalizedOperation === "create"
            ? "tạo gói mới ở trạng thái đang mở"
            : "kích hoạt gói";

    const error = new Error(
        `Không thể ${operationLabel} vì đã có ${activeCount}/${MAX_ACTIVE_PAYMENT_PACKAGES} gói trả phí đang mở. Vui lòng tắt bớt ít nhất 1 gói trước khi tiếp tục.`
    );

    error.code = "ACTIVE_PACKAGE_LIMIT_EXCEEDED";
    error.statusCode = 400;
    error.details = {
        operation: normalizedOperation || "activate",
        activeCount,
        activeLimit: MAX_ACTIVE_PAYMENT_PACKAGES,
    };

    return error;
};

const normalizeTrimmedString = (value) => String(value ?? "").trim();

const normalizeCurrency = (value) => {
    const normalized = normalizeTrimmedString(value).toUpperCase();
    return normalized || "VND";
};

const normalizeSlug = (value) =>
    normalizeTrimmedString(value)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");

const isDefaultPackageIdentity = ({ slug, price, isDefault } = {}) => {
    if (isDefault === true) {
        return true;
    }

    const normalizedSlug = normalizeSlug(slug);
    if (normalizedSlug === DEFAULT_FREE_PACKAGE_SLUG) {
        return true;
    }

    const normalizedPrice = Number(price);
    return Number.isFinite(normalizedPrice) && normalizedPrice === 0;
};

const sanitizeFeatureKeys = (featureKeys) =>
    Array.isArray(featureKeys)
        ? Array.from(
            new Set(
                featureKeys
                    .map((featureKey) => normalizeTrimmedString(featureKey))
                    .filter(
                        (featureKey) =>
                            featureKey && PAYMENT_PACKAGE_FEATURE_LOOKUP.has(featureKey)
                    )
            )
        )
        : [];

const normalizeBillingCycle = (value) => {
    const normalized = normalizeTrimmedString(value).toLowerCase();
    if (!normalized) {
        return "month";
    }

    return PAYMENT_PACKAGE_BILLING_CYCLES.includes(normalized)
        ? normalized
        : null;
};

const normalizeAccessLevel = (value) => {
    const normalized = normalizeTrimmedString(value).toLowerCase();
    if (!normalized) {
        return "basic";
    }

    return FEATURE_ACCESS_LEVEL_LOOKUP.has(normalized) ? normalized : null;
};

const normalizeQuotaPeriod = (value) => {
    const normalized = normalizeTrimmedString(value).toLowerCase();
    if (!normalized) {
        return "month";
    }

    return FEATURE_SCOPE_PERIOD_LOOKUP.has(normalized) ? normalized : null;
};

const toQuotaValue = (value) => {
    if (value === null || value === undefined || value === "") {
        return null;
    }

    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
        throw new Error("featureScopes.quota must be a non-negative number or null");
    }

    return Math.floor(parsed);
};

const resolveTierFromIdentity = ({ slug, name }) => {
    const normalized = `${normalizeTrimmedString(slug)} ${normalizeTrimmedString(name)}`
        .toLowerCase()
        .trim();

    if (normalized.includes("pro")) {
        return "pro";
    }

    if (normalized.includes("plus")) {
        return "plus";
    }

    if (normalized.includes("go")) {
        return "go";
    }

    return "go";
};

const buildDefaultScope = ({ featureKey, packageSlug, packageName }) => {
    const tier = resolveTierFromIdentity({ slug: packageSlug, name: packageName });
    const tierPreset = FEATURE_SCOPE_PRESETS_BY_TIER[tier]?.[featureKey];

    if (tierPreset) {
        return {
            featureKey,
            accessLevel: tierPreset.accessLevel,
            quota: tierPreset.quota,
            quotaPeriod: tierPreset.quotaPeriod,
            note: tierPreset.note,
        };
    }

    return {
        featureKey,
        accessLevel: "basic",
        quota: null,
        quotaPeriod: "billing_cycle",
        note: "Mở theo quyền mặc định của gói.",
    };
};

const normalizeFeatureScopeItem = ({ item, fallbackFeatureKey }) => {
    const featureKey = normalizeTrimmedString(item?.featureKey || fallbackFeatureKey);
    if (!featureKey) {
        throw new Error("featureScopes.featureKey is required");
    }

    if (!PAYMENT_PACKAGE_FEATURE_LOOKUP.has(featureKey)) {
        throw new Error(`Unknown feature key in featureScopes: ${featureKey}`);
    }

    const accessLevel = normalizeAccessLevel(item?.accessLevel);
    if (!accessLevel) {
        throw new Error(
            `featureScopes.accessLevel must be one of: ${FEATURE_ACCESS_LEVEL_OPTIONS.join(", ")}`
        );
    }

    const quota = toQuotaValue(item?.quota);
    const quotaPeriod = normalizeQuotaPeriod(item?.quotaPeriod);
    if (!quotaPeriod) {
        throw new Error(
            `featureScopes.quotaPeriod must be one of: ${FEATURE_SCOPE_PERIODS.join(", ")}`
        );
    }

    return {
        featureKey,
        accessLevel,
        quota,
        quotaPeriod,
        note: normalizeTrimmedString(item?.note),
    };
};

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

const toSafeNumber = (value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const mapPaymentPackageDoc = (doc) => {
    if (!doc) {
        return null;
    }

    const featureKeys = sanitizeFeatureKeys(doc.featureKeys);
    const featureScopeByKey = new Map();

    if (Array.isArray(doc.featureScopes)) {
        for (const scopeItem of doc.featureScopes) {
            try {
                const normalizedScope = normalizeFeatureScopeItem({
                    item: scopeItem,
                    fallbackFeatureKey: scopeItem?.featureKey,
                });
                featureScopeByKey.set(normalizedScope.featureKey, normalizedScope);
            } catch (_error) {
                // Ignore malformed scopes stored previously and fallback to defaults.
            }
        }
    }

    const featureScopes = featureKeys.map((featureKey) => {
        if (featureScopeByKey.has(featureKey)) {
            return featureScopeByKey.get(featureKey);
        }

        return buildDefaultScope({
            featureKey,
            packageSlug: doc.slug,
            packageName: doc.name,
        });
    });

    return {
        id: String(doc._id),
        name: doc.name,
        slug: doc.slug,
        isDefault: isDefaultPackageIdentity({
            slug: doc.slug,
            price: doc.price,
            isDefault: doc.isDefault,
        }),
        description: doc.description || "",
        price: Number(doc.price ?? 0),
        currency: doc.currency || "VND",
        billingCycle: doc.billingCycle || "month",
        featureKeys,
        featureScopes,
        isActive: Boolean(doc.isActive),
        displayOrder: Number(doc.displayOrder ?? 0),
        createdAt: toIsoDate(doc.createdAt),
        updatedAt: toIsoDate(doc.updatedAt),
    };
};

const getPaymentPackageFeatureCatalog = () =>
    PAYMENT_PACKAGE_FEATURE_CATALOG.map((item) => ({ ...item }));

const normalizeFeatureKeys = (featureKeys) => {
    if (!Array.isArray(featureKeys)) {
        throw new Error("featureKeys must be an array");
    }

    const normalized = Array.from(
        new Set(
            featureKeys
                .map((value) => normalizeTrimmedString(value))
                .filter(Boolean)
        )
    );

    if (normalized.length === 0) {
        throw new Error("At least one feature must be selected");
    }

    const invalidFeature = normalized.find(
        (featureKey) => !PAYMENT_PACKAGE_FEATURE_LOOKUP.has(featureKey)
    );
    if (invalidFeature) {
        throw new Error(`Unknown feature key: ${invalidFeature}`);
    }

    return normalized;
};

const normalizeFeatureScopes = ({
    featureScopes,
    featureKeys,
    packageSlug,
    packageName,
}) => {
    const scopedByFeature = new Map();

    if (Array.isArray(featureScopes)) {
        for (const scopeItem of featureScopes) {
            const normalizedScope = normalizeFeatureScopeItem({
                item: scopeItem,
                fallbackFeatureKey: scopeItem?.featureKey,
            });

            if (!featureKeys.includes(normalizedScope.featureKey)) {
                throw new Error(
                    `featureScopes contains key not enabled in featureKeys: ${normalizedScope.featureKey}`
                );
            }

            scopedByFeature.set(normalizedScope.featureKey, normalizedScope);
        }
    }

    return featureKeys.map((featureKey) => {
        if (scopedByFeature.has(featureKey)) {
            return scopedByFeature.get(featureKey);
        }

        return buildDefaultScope({
            featureKey,
            packageSlug,
            packageName,
        });
    });
};

const ensureActiveLimit = async ({
    shouldBeActive,
    excludeId = null,
    operation = "activate",
} = {}) => {
    if (!shouldBeActive) {
        return;
    }

    const filter = {
        isActive: true,
        slug: { $ne: DEFAULT_FREE_PACKAGE_SLUG },
    };
    if (excludeId && mongoose.Types.ObjectId.isValid(excludeId)) {
        filter._id = { $ne: new mongoose.Types.ObjectId(excludeId) };
    }

    const activeCount = await PaymentPackage.countDocuments(filter);
    if (activeCount >= MAX_ACTIVE_PAYMENT_PACKAGES) {
        throw buildActiveLimitExceededError({
            operation,
            activeCount,
        });
    }
};

const buildPaymentPackagePayload = (input = {}) => {
    const name = normalizeTrimmedString(input.name);
    const slug =
        normalizeSlug(input.slug) || normalizeSlug(input.packageSlug) || normalizeSlug(name);
    const description = normalizeTrimmedString(input.description);
    const billingCycle = normalizeBillingCycle(input.billingCycle);
    const price = Number(input.price);
    const displayOrder = Math.max(0, Math.floor(toSafeNumber(input.displayOrder, 0)));
    const featureKeys = normalizeFeatureKeys(input.featureKeys);

    if (!name) {
        throw new Error("Package name is required");
    }

    if (!slug) {
        throw new Error("Package slug is required");
    }

    if (!billingCycle) {
        throw new Error(
            `billingCycle must be one of: ${PAYMENT_PACKAGE_BILLING_CYCLES.join(", ")}`
        );
    }

    if (!Number.isFinite(price) || price < 0) {
        throw new Error("Package price must be a valid non-negative number");
    }

    const isDefault = isDefaultPackageIdentity({
        slug,
        price,
        isDefault: input.isDefault,
    });

    if (isDefault) {
        if (slug !== DEFAULT_FREE_PACKAGE_SLUG) {
            throw new Error(
                `Default free package slug must be '${DEFAULT_FREE_PACKAGE_SLUG}'`
            );
        }

        if (price !== 0) {
            throw new Error("Default free package must have price 0");
        }
    } else if (price < MIN_PAID_PACKAGE_PRICE) {
        throw new Error(
            `Paid package price must be at least ${MIN_PAID_PACKAGE_PRICE} VND`
        );
    }

    const featureScopes = normalizeFeatureScopes({
        featureScopes: input.featureScopes,
        featureKeys,
        packageSlug: slug,
        packageName: name,
    });

    return {
        name,
        slug,
        description,
        price,
        currency: normalizeCurrency(input.currency),
        billingCycle,
        featureKeys,
        featureScopes,
        isDefault,
        isActive: isDefault ? true : input.isActive === true,
        displayOrder,
    };
};

const listPaymentPackages = async ({ includeInactive = false } = {}) => {
    const filter = includeInactive ? {} : { isActive: true };
    const packages = await PaymentPackage.find(filter)
        .sort({ displayOrder: 1, price: 1, name: 1 })
        .lean();

    return packages.map(mapPaymentPackageDoc);
};

const getPaymentPackagesCatalog = async ({ includeInactive = false } = {}) => ({
    packages: await listPaymentPackages({ includeInactive }),
    featureCatalog: getPaymentPackageFeatureCatalog(),
    scopeConfig: {
        accessLevelOptions: [...FEATURE_ACCESS_LEVEL_OPTIONS],
        quotaPeriodOptions: [...FEATURE_SCOPE_PERIODS],
    },
    activeLimit: MAX_ACTIVE_PAYMENT_PACKAGES,
});

const createPaymentPackage = async (input = {}) => {
    const payload = buildPaymentPackagePayload(input);
    await ensureActiveLimit({
        shouldBeActive: payload.isActive,
        operation: "create",
    });

    const created = await PaymentPackage.create(payload);
    return mapPaymentPackageDoc(created);
};

const updatePaymentPackage = async (packageId, input = {}) => {
    const normalizedId = normalizeTrimmedString(packageId);
    if (!mongoose.Types.ObjectId.isValid(normalizedId)) {
        throw new Error("Invalid payment package id");
    }

    const existing = await PaymentPackage.findById(normalizedId);
    if (!existing) {
        throw new Error("Payment package not found");
    }

    const existingIsDefault = isDefaultPackageIdentity({
        slug: existing.slug,
        price: existing.price,
        isDefault: existing.isDefault,
    });

    if (existingIsDefault) {
        const nextFeatureKeys = Array.isArray(input.featureKeys)
            ? normalizeFeatureKeys(input.featureKeys)
            : sanitizeFeatureKeys(existing.featureKeys);

        if (nextFeatureKeys.length === 0) {
            throw new Error("Default free package must keep at least one enabled feature");
        }

        const featureScopes = normalizeFeatureScopes({
            featureScopes: Array.isArray(input.featureScopes)
                ? input.featureScopes
                : existing.featureScopes,
            featureKeys: nextFeatureKeys,
            packageSlug: existing.slug,
            packageName: existing.name,
        });

        existing.featureKeys = nextFeatureKeys;
        existing.featureScopes = featureScopes;
        existing.isDefault = true;
        existing.isActive = true;
        existing.price = 0;
        existing.slug = DEFAULT_FREE_PACKAGE_SLUG;
        existing.name = normalizeTrimmedString(existing.name) || DEFAULT_FREE_PACKAGE_NAME;

        await existing.save();
        return mapPaymentPackageDoc(existing);
    }

    const payload = buildPaymentPackagePayload({
        ...existing.toObject(),
        ...input,
    });

    if (payload.isDefault) {
        throw new Error("Cannot convert a paid package to default free package");
    }

    const shouldActivate = payload.isActive && !existing.isActive;
    await ensureActiveLimit({
        shouldBeActive: shouldActivate,
        excludeId: existing._id,
        operation: "activate",
    });

    Object.assign(existing, payload);
    await existing.save();

    return mapPaymentPackageDoc(existing);
};

const getPaymentPackageBySelector = async ({
    packageId,
    packageSlug,
    pricingKey,
    activeOnly = false,
} = {}) => {
    const normalizedId = normalizeTrimmedString(packageId);
    const normalizedSlug = normalizeSlug(packageSlug || pricingKey);
    const filter = activeOnly ? { isActive: true } : {};

    let found = null;
    if (normalizedId && mongoose.Types.ObjectId.isValid(normalizedId)) {
        found = await PaymentPackage.findOne({
            _id: new mongoose.Types.ObjectId(normalizedId),
            ...filter,
        }).lean();
    }

    if (!found && normalizedSlug) {
        found = await PaymentPackage.findOne({
            slug: normalizedSlug,
            ...filter,
        }).lean();
    }

    return mapPaymentPackageDoc(found);
};

export {
    FEATURE_ACCESS_LEVEL_OPTIONS,
    MAX_ACTIVE_PAYMENT_PACKAGES,
    createPaymentPackage,
    getPaymentPackageBySelector,
    getPaymentPackageFeatureCatalog,
    getPaymentPackagesCatalog,
    listPaymentPackages,
    normalizeSlug,
    updatePaymentPackage,
};
