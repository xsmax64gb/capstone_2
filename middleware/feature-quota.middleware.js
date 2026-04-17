import { ensureFeatureAccessAndQuota } from "../services/feature-quota.service.js";

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