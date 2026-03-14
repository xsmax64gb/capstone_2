import { User } from "../models/index.js";
import { verifyAccessToken } from "../helper/auth.helper.js";

const extractBearerToken = (authorizationHeader = "") => {
    const [scheme, token] = String(authorizationHeader).split(" ");
    if (scheme?.toLowerCase() !== "bearer" || !token) {
        return null;
    }
    return token;
};

const attachUserFromToken = async (req, _res, next) => {
    try {
        const token = extractBearerToken(req.headers.authorization);
        if (!token) {
            return next();
        }

        const payload = verifyAccessToken(token);
        const userId = payload?.sub;
        if (!userId) {
            return next();
        }

        const user = await User.findById(userId)
            .select("_id fullName email role currentLevel")
            .lean();

        if (!user) {
            return next();
        }

        req.user = {
            id: user._id.toString(),
            ID: user._id.toString(),
            email: user.email,
            role: user.role,
            currentLevel: user.currentLevel,
            fullName: user.fullName,
            name: user.fullName,
        };

        return next();
    } catch (_error) {
        return next();
    }
};

const requireAuth = (req, res, next) => {
    if (!req.user?.id) {
        return res.status(401).json({
            success: false,
            message: "Unauthorized",
        });
    }

    return next();
};

export {
    attachUserFromToken,
    requireAuth,
};
