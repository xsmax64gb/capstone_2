import { ensureFeatureAccessAndQuota } from "../services/feature-quota.service.js";
import { logMonitoringEvent } from "../helper/monitoring.helper.js";

const requireFeatureQuota = (featureKey, { enforceQuota = false } = {}) => {
    return async (req, res, next) => {
        try {
            if (!req.user?.id) {
                return res.status(401).json({
                    success: false,
                    message: "Unauthorized",
                });
            }

            if (req.user.role === "admin") {
                return next();
            }

            const quotaContext = await ensureFeatureAccessAndQuota({
                userId: req.user.id,
                featureKey,
                enforceQuota,
            });

            req.featureQuota = quotaContext;
            return next();
        } catch (error) {
            const statusCode = Number.isInteger(error?.statusCode)
                ? error.statusCode
                : 500;
            const message =
                String(error?.message || "").trim() ||
                "Feature quota validation failed";

            if (error?.code === "FEATURE_QUOTA_EXCEEDED") {
                logMonitoringEvent({
                    event: "feature_quota_blocked",
                    source: "feature-quota.middleware",
                    data: {
                        method: req.method,
                        path: req.originalUrl || req.url,
                        userId: req.user?.id || null,
                        featureKey,
                        errorCode: error?.code || null,
                        statusCode,
                        quota: error?.data?.quota ?? null,
                        used: error?.data?.used ?? null,
                        remaining: error?.data?.remaining ?? null,
                        quotaPeriod: error?.data?.quotaPeriod || null,
                        packageSlug: error?.data?.packageSlug || null,
                    },
                });
            }

            return res.status(statusCode).json({
                success: false,
                message,
                error: message,
                errorCode: error?.code || null,
                data: error?.data || null,
            });
        }
    };
};

export { requireFeatureQuota };