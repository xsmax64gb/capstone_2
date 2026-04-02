import bcrypt from "bcryptjs";
import mongoose from "mongoose";

import {
    AiSession,
    Exercise,
    ExerciseAttempt,
    User,
    UserProgress,
    Vocabulary,
} from "../models/index.js";
import { AI_SESSION_STATUSES, LEVELS, USER_ROLES } from "../models/constants.js";
import { sanitizeUser } from "../helper/auth.helper.js";
import { uploadImageFile } from "../helper/upload.helper.js";

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const SALT_ROUNDS = 10;
const DEFAULT_PAGE_LIMIT = 20;
const MAX_PAGE_LIMIT = 100;

const ADMIN_USER_SELECT_FIELDS =
    "fullName email role isActive currentLevel exp onboardingDone placementScore avatarUrl bio nativeLanguage timezone lastActiveAt createdAt updatedAt";
const ADMIN_USER_SORT_FIELDS = new Set([
    "createdAt",
    "updatedAt",
    "fullName",
    "email",
    "exp",
    "placementScore",
    "lastActiveAt",
]);

const toIsoDate = (value) => {
    const date = value instanceof Date ? value : new Date(value);

    if (Number.isNaN(date.getTime())) {
        return null;
    }

    return date.toISOString();
};

const toSafeInt = (value, fallback = 0) => {
    const parsed = Number.parseInt(String(value ?? ""), 10);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeTrimmedString = (value) => String(value ?? "").trim();

const normalizeEmail = (value) => normalizeTrimmedString(value).toLowerCase();

const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const parseBooleanFromAny = (value) => {
    if (typeof value === "boolean") {
        return value;
    }

    if (value === undefined || value === null) {
        return null;
    }

    const normalized = String(value).trim().toLowerCase();
    if (["true", "1", "yes", "y"].includes(normalized)) {
        return true;
    }

    if (["false", "0", "no", "n"].includes(normalized)) {
        return false;
    }

    return null;
};

const parseBooleanFilter = (value) => {
    if (value === undefined || value === null || value === "" || value === "all") {
        return null;
    }

    return parseBooleanFromAny(value);
};

const getUnlockedLevelsUpTo = (level) => {
    const levelIndex = LEVELS.indexOf(level);

    if (levelIndex < 0) {
        return ["A1"];
    }

    return LEVELS.slice(0, levelIndex + 1);
};

const updateUserProgressLevel = async (userId, level) => {
    await UserProgress.findOneAndUpdate(
        { userId },
        {
            $set: { currentLevel: level },
            $setOnInsert: { userId },
            $addToSet: {
                unlockedLevels: { $each: getUnlockedLevelsUpTo(level) },
            },
        },
        {
            upsert: true,
            new: true,
            setDefaultsOnInsert: true,
        }
    );
};

const buildDayBuckets = (days) => {
    const today = new Date();
    const buckets = [];

    for (let offset = days - 1; offset >= 0; offset -= 1) {
        const date = new Date(today.getTime() - offset * DAY_IN_MS);
        const key = date.toISOString().slice(0, 10);

        buckets.push({
            key,
            label: date.toLocaleDateString("en-CA", {
                month: "short",
                day: "2-digit",
            }),
            date,
        });
    }

    return buckets;
};

const getLevelBreakdown = (users) =>
    LEVELS.map((level) => ({
        level,
        count: users.filter((user) => user.currentLevel === level).length,
    }));

const getRoleBreakdown = (users) =>
    USER_ROLES.map((role) => ({
        role,
        count: users.filter((user) => user.role === role).length,
    }));

const getStatusBreakdown = (users) => [
    {
        status: "active",
        count: users.filter((user) => user.isActive !== false).length,
    },
    {
        status: "inactive",
        count: users.filter((user) => user.isActive === false).length,
    },
];

const serializeUser = (user) => ({
    id: String(user._id),
    fullName: user.fullName,
    email: user.email,
    avatarUrl: user.avatarUrl || "",
    bio: user.bio || "",
    nativeLanguage: user.nativeLanguage || "",
    timezone: user.timezone || "",
    role: user.role,
    isActive: Boolean(user.isActive ?? true),
    currentLevel: user.currentLevel,
    exp: user.exp ?? 0,
    onboardingDone: Boolean(user.onboardingDone),
    placementScore: user.placementScore ?? 0,
    lastActiveAt: toIsoDate(user.lastActiveAt),
    createdAt: toIsoDate(user.createdAt),
    updatedAt: toIsoDate(user.updatedAt),
});

const getCurrentUserProfile = async (req, res) => {
    try {
        const userId = req.user?.id;

        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            });
        }

        return res.status(200).json({
            success: true,
            message: "Profile fetched successfully",
            data: sanitizeUser(user),
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to fetch profile",
        });
    }
};

const updateCurrentUserAvatar = async (req, res) => {
    try {
        const userId = req.user?.id;
        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            });
        }

        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: "Avatar file is required",
            });
        }

        const uploadResult = await uploadImageFile(req.file, {
            folder: "users/avatars",
            tags: ["avatar", "profile"],
        });

        user.avatarUrl = uploadResult.secureUrl || uploadResult.url || "";
        await user.save();

        return res.status(200).json({
            success: true,
            message: "Avatar updated successfully",
            data: sanitizeUser(user),
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to update avatar",
        });
    }
};

const updateCurrentUserProfile = async (req, res) => {
    try {
        const userId = req.user?.id;
        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            });
        }

        const payload = req.body || {};

        if (payload.fullName !== undefined) {
            user.fullName = String(payload.fullName).trim();
        }

        if (payload.bio !== undefined) {
            user.bio = String(payload.bio).trim();
        }

        if (payload.nativeLanguage !== undefined) {
            user.nativeLanguage = String(payload.nativeLanguage).trim();
        }

        if (payload.timezone !== undefined) {
            user.timezone = String(payload.timezone).trim();
        }

        await user.save();

        return res.status(200).json({
            success: true,
            message: "Profile updated successfully",
            data: sanitizeUser(user),
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to update profile",
        });
    }
};

const deleteCurrentUserAvatar = async (req, res) => {
    try {
        const userId = req.user?.id;
        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            });
        }

        user.avatarUrl = "";
        await user.save();

        return res.status(200).json({
            success: true,
            message: "Avatar removed successfully",
            data: sanitizeUser(user),
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to delete avatar",
        });
    }
};

const getAdminOverview = async (_req, res) => {
    try {
        const sevenDaysAgo = new Date(Date.now() - 7 * DAY_IN_MS);

        const [
            totalUsers,
            onboardingCompleted,
            adminUsers,
            totalAttempts,
            attemptsLast7Days,
            activeAiSessions,
            totalExercises,
            totalVocabularies,
            recentUsers,
            recentAttempts,
            recentAiSessions,
        ] = await Promise.all([
            User.countDocuments({}),
            User.countDocuments({ onboardingDone: true }),
            User.countDocuments({ role: "admin" }),
            ExerciseAttempt.countDocuments({}),
            ExerciseAttempt.countDocuments({ submittedAt: { $gte: sevenDaysAgo } }),
            AiSession.countDocuments({ status: "in_progress" }),
            Exercise.countDocuments({}),
            Vocabulary.countDocuments({}),
            User.find({})
                .sort({ createdAt: -1 })
                .limit(4)
                .select("fullName email role createdAt")
                .lean(),
            ExerciseAttempt.find({})
                .sort({ submittedAt: -1 })
                .limit(4)
                .select("userName score total submittedAt")
                .lean(),
            AiSession.find({})
                .sort({ updatedAt: -1 })
                .limit(4)
                .select("stageName status updatedAt totalScore")
                .lean(),
        ]);

        const feed = [
            ...recentUsers.map((item) => ({
                type: "user",
                title: item.fullName || item.email,
                detail: `${item.email} joined with role ${item.role}.`,
                timestamp: toIsoDate(item.createdAt),
            })),
            ...recentAttempts.map((item) => ({
                type: "exercise_attempt",
                title: item.userName || "Anonymous learner",
                detail: `Submitted an exercise with score ${item.score}/${item.total}.`,
                timestamp: toIsoDate(item.submittedAt),
            })),
            ...recentAiSessions.map((item) => ({
                type: "ai_session",
                title: item.stageName || "AI speaking session",
                detail: `Status: ${item.status}. Score: ${item.totalScore ?? 0}.`,
                timestamp: toIsoDate(item.updatedAt),
            })),
        ]
            .filter((item) => item.timestamp)
            .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)))
            .slice(0, 6);

        return res.status(200).json({
            success: true,
            message: "Admin overview fetched successfully",
            data: {
                summary: {
                    totalUsers,
                    onboardingCompleted,
                    onboardingPending: Math.max(0, totalUsers - onboardingCompleted),
                    adminUsers,
                    totalAttempts,
                    attemptsLast7Days,
                    activeAiSessions,
                    totalContentItems: totalExercises + totalVocabularies,
                },
                systemSnapshot: {
                    uptime: process.uptime(),
                    status: "healthy",
                    apiTimestamp: new Date().toISOString(),
                    totals: {
                        exercises: totalExercises,
                        vocabularies: totalVocabularies,
                    },
                },
                recentActivity: feed,
            },
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to fetch admin overview",
        });
    }
};

const getAdminUsers = async (req, res) => {
    try {
        const queryText = normalizeTrimmedString(req.query.query);
        const roleFilter = USER_ROLES.includes(String(req.query.role))
            ? String(req.query.role)
            : "all";
        const levelFilter = LEVELS.includes(String(req.query.level))
            ? String(req.query.level)
            : "all";
        const onboardingDoneFilter = parseBooleanFilter(req.query.onboardingDone);
        const isActiveFilter = parseBooleanFilter(req.query.isActive);

        const page = Math.max(1, toSafeInt(req.query.page, 1));
        const limit = Math.min(MAX_PAGE_LIMIT, Math.max(1, toSafeInt(req.query.limit, DEFAULT_PAGE_LIMIT)));
        const sortByRaw = normalizeTrimmedString(req.query.sortBy);
        const sortBy = ADMIN_USER_SORT_FIELDS.has(sortByRaw) ? sortByRaw : "createdAt";
        const sortOrder = String(req.query.sortOrder).toLowerCase() === "asc" ? "asc" : "desc";
        const sortDirection = sortOrder === "asc" ? 1 : -1;

        const filter = {};

        if (queryText) {
            filter.$or = [
                { fullName: { $regex: queryText, $options: "i" } },
                { email: { $regex: queryText, $options: "i" } },
            ];
        }

        if (roleFilter !== "all") {
            filter.role = roleFilter;
        }

        if (levelFilter !== "all") {
            filter.currentLevel = levelFilter;
        }

        if (onboardingDoneFilter !== null) {
            filter.onboardingDone = onboardingDoneFilter;
        }

        if (isActiveFilter !== null) {
            filter.isActive = isActiveFilter;
        }

        const skip = (page - 1) * limit;
        const sortObject =
            sortBy === "createdAt" ? { createdAt: sortDirection } : { [sortBy]: sortDirection, createdAt: -1 };

        const [summaryUsers, filteredTotal, users] = await Promise.all([
            User.find({})
                .select("role currentLevel onboardingDone placementScore isActive")
                .lean(),
            User.countDocuments(filter),
            User.find(filter)
                .sort(sortObject)
                .skip(skip)
                .limit(limit)
                .select(ADMIN_USER_SELECT_FIELDS)
                .lean(),
        ]);

        const summary = {
            totalUsers: summaryUsers.length,
            onboardingCompleted: summaryUsers.filter((user) => user.onboardingDone).length,
            onboardingPending: summaryUsers.filter((user) => !user.onboardingDone).length,
            adminUsers: summaryUsers.filter((user) => user.role === "admin").length,
            activeUsers: summaryUsers.filter((user) => user.isActive !== false).length,
            inactiveUsers: summaryUsers.filter((user) => user.isActive === false).length,
            averagePlacementScore: summaryUsers.length
                ? Math.round(
                    summaryUsers.reduce((sum, user) => sum + (user.placementScore ?? 0), 0) /
                    summaryUsers.length
                )
                : 0,
        };

        return res.status(200).json({
            success: true,
            message: "Admin users fetched successfully",
            data: {
                summary,
                breakdowns: {
                    byLevel: getLevelBreakdown(summaryUsers),
                    byRole: getRoleBreakdown(summaryUsers),
                    byStatus: getStatusBreakdown(summaryUsers),
                },
                filters: {
                    query: queryText,
                    role: roleFilter,
                    level: levelFilter,
                    onboardingDone: onboardingDoneFilter,
                    isActive: isActiveFilter,
                    sortBy,
                    sortOrder,
                },
                pagination: {
                    page,
                    limit,
                    total: filteredTotal,
                    totalPages: Math.max(1, Math.ceil(filteredTotal / limit)),
                },
                users: users.map(serializeUser),
            },
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to fetch admin users",
        });
    }
};

const createAdminUser = async (req, res) => {
    try {
        const payload = req.body || {};

        const fullName = normalizeTrimmedString(payload.fullName);
        const email = normalizeEmail(payload.email);
        const password = String(payload.password ?? "");
        const role = payload.role === undefined ? "admin" : normalizeTrimmedString(payload.role);
        const currentLevel = payload.currentLevel === undefined ? "A1" : normalizeTrimmedString(payload.currentLevel);
        const exp = Math.max(0, toSafeInt(payload.exp, 0));
        const onboardingDone = parseBooleanFromAny(payload.onboardingDone);
        const isActive = parseBooleanFromAny(payload.isActive);

        if (!fullName || !email || !password) {
            return res.status(400).json({
                success: false,
                message: "fullName, email, and password are required",
            });
        }

        if (!isValidEmail(email)) {
            return res.status(400).json({
                success: false,
                message: "A valid email is required",
            });
        }

        if (password.length < 6) {
            return res.status(400).json({
                success: false,
                message: "Password must be at least 6 characters",
            });
        }

        if (!USER_ROLES.includes(role)) {
            return res.status(400).json({
                success: false,
                message: `role must be one of: ${USER_ROLES.join(", ")}`,
            });
        }

        if (!LEVELS.includes(currentLevel)) {
            return res.status(400).json({
                success: false,
                message: `currentLevel must be one of: ${LEVELS.join(", ")}`,
            });
        }

        if (onboardingDone === null && payload.onboardingDone !== undefined) {
            return res.status(400).json({
                success: false,
                message: "onboardingDone must be a boolean",
            });
        }

        if (isActive === null && payload.isActive !== undefined) {
            return res.status(400).json({
                success: false,
                message: "isActive must be a boolean",
            });
        }

        const existingUser = await User.findOne({ email }).lean();
        if (existingUser) {
            return res.status(409).json({
                success: false,
                message: "Email is already registered",
            });
        }

        const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
        const user = await User.create({
            fullName,
            email,
            passwordHash,
            role,
            currentLevel,
            exp,
            onboardingDone: onboardingDone ?? false,
            isActive: isActive ?? true,
            deactivatedAt: isActive === false ? new Date() : null,
            bio: normalizeTrimmedString(payload.bio),
            nativeLanguage: normalizeTrimmedString(payload.nativeLanguage),
            timezone: normalizeTrimmedString(payload.timezone),
            avatarUrl: normalizeTrimmedString(payload.avatarUrl),
        });

        await updateUserProgressLevel(user._id, user.currentLevel);

        return res.status(201).json({
            success: true,
            message: "Admin user created successfully",
            data: serializeUser(user),
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to create admin user",
        });
    }
};

const getAdminUserById = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid user id",
            });
        }

        const user = await User.findById(id).select(ADMIN_USER_SELECT_FIELDS).lean();

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            });
        }

        return res.status(200).json({
            success: true,
            message: "Admin user fetched successfully",
            data: serializeUser(user),
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to fetch admin user",
        });
    }
};

const updateAdminUser = async (req, res) => {
    try {
        const { id } = req.params;
        const payload = req.body || {};

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid user id",
            });
        }

        const user = await User.findById(id);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            });
        }

        const isSelf = String(user._id) === String(req.user?.id);

        if (payload.fullName !== undefined) {
            const fullName = normalizeTrimmedString(payload.fullName);
            if (!fullName) {
                return res.status(400).json({
                    success: false,
                    message: "fullName cannot be empty",
                });
            }
            user.fullName = fullName;
        }

        if (payload.email !== undefined) {
            const email = normalizeEmail(payload.email);

            if (!isValidEmail(email)) {
                return res.status(400).json({
                    success: false,
                    message: "A valid email is required",
                });
            }

            const existingUser = await User.findOne({ email }).lean();
            if (existingUser && String(existingUser._id) !== String(user._id)) {
                return res.status(409).json({
                    success: false,
                    message: "Email is already registered",
                });
            }

            user.email = email;
        }

        const nextRole =
            payload.role !== undefined ? normalizeTrimmedString(payload.role) : user.role;
        const nextIsActiveRaw =
            payload.isActive !== undefined ? parseBooleanFromAny(payload.isActive) : Boolean(user.isActive ?? true);
        const nextIsActive =
            payload.isActive === undefined ? Boolean(user.isActive ?? true) : nextIsActiveRaw;

        if (payload.role !== undefined && !USER_ROLES.includes(nextRole)) {
            return res.status(400).json({
                success: false,
                message: `role must be one of: ${USER_ROLES.join(", ")}`,
            });
        }

        if (payload.isActive !== undefined && nextIsActiveRaw === null) {
            return res.status(400).json({
                success: false,
                message: "isActive must be a boolean",
            });
        }

        if (isSelf && payload.role !== undefined && nextRole !== "admin") {
            return res.status(400).json({
                success: false,
                message: "You cannot remove your own admin role",
            });
        }

        if (isSelf && payload.isActive !== undefined && nextIsActive === false) {
            return res.status(400).json({
                success: false,
                message: "You cannot deactivate your own account",
            });
        }

        if (
            user.role === "admin" &&
            user.isActive !== false &&
            (nextRole !== "admin" || nextIsActive === false)
        ) {
            const otherActiveAdmins = await User.countDocuments({
                _id: { $ne: user._id },
                role: "admin",
                isActive: true,
            });

            if (otherActiveAdmins <= 0) {
                return res.status(400).json({
                    success: false,
                    message: "At least one active admin account must be kept",
                });
            }
        }

        if (payload.currentLevel !== undefined) {
            const currentLevel = normalizeTrimmedString(payload.currentLevel);
            if (!LEVELS.includes(currentLevel)) {
                return res.status(400).json({
                    success: false,
                    message: `currentLevel must be one of: ${LEVELS.join(", ")}`,
                });
            }
            user.currentLevel = currentLevel;
        }

        if (payload.exp !== undefined) {
            const exp = toSafeInt(payload.exp, user.exp ?? 0);
            if (exp < 0) {
                return res.status(400).json({
                    success: false,
                    message: "exp must be a non-negative number",
                });
            }
            user.exp = exp;
        }

        if (payload.onboardingDone !== undefined) {
            const onboardingDone = parseBooleanFromAny(payload.onboardingDone);
            if (onboardingDone === null) {
                return res.status(400).json({
                    success: false,
                    message: "onboardingDone must be a boolean",
                });
            }
            user.onboardingDone = onboardingDone;
        }

        if (payload.bio !== undefined) {
            user.bio = normalizeTrimmedString(payload.bio);
        }

        if (payload.nativeLanguage !== undefined) {
            user.nativeLanguage = normalizeTrimmedString(payload.nativeLanguage);
        }

        if (payload.timezone !== undefined) {
            user.timezone = normalizeTrimmedString(payload.timezone);
        }

        if (payload.avatarUrl !== undefined) {
            user.avatarUrl = normalizeTrimmedString(payload.avatarUrl);
        }

        user.role = nextRole;
        user.isActive = nextIsActive;
        user.deactivatedAt = nextIsActive ? null : user.deactivatedAt || new Date();

        await user.save();

        if (payload.currentLevel !== undefined) {
            await updateUserProgressLevel(user._id, user.currentLevel);
        }

        return res.status(200).json({
            success: true,
            message: "Admin user updated successfully",
            data: serializeUser(user),
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to update admin user",
        });
    }
};

const updateAdminUserRole = async (req, res) => {
    try {
        const { id } = req.params;
        const role = normalizeTrimmedString(req.body?.role);

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid user id",
            });
        }

        if (!USER_ROLES.includes(role)) {
            return res.status(400).json({
                success: false,
                message: `role must be one of: ${USER_ROLES.join(", ")}`,
            });
        }

        const user = await User.findById(id);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            });
        }

        const isSelf = String(user._id) === String(req.user?.id);

        if (isSelf && role !== "admin") {
            return res.status(400).json({
                success: false,
                message: "You cannot remove your own admin role",
            });
        }

        if (user.role === "admin" && user.isActive !== false && role !== "admin") {
            const otherActiveAdmins = await User.countDocuments({
                _id: { $ne: user._id },
                role: "admin",
                isActive: true,
            });

            if (otherActiveAdmins <= 0) {
                return res.status(400).json({
                    success: false,
                    message: "At least one active admin account must be kept",
                });
            }
        }

        user.role = role;
        await user.save();

        return res.status(200).json({
            success: true,
            message: "User role updated successfully",
            data: serializeUser(user),
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to update user role",
        });
    }
};

const updateAdminUserStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const nextStatus = parseBooleanFromAny(req.body?.isActive);

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid user id",
            });
        }

        if (nextStatus === null) {
            return res.status(400).json({
                success: false,
                message: "isActive must be a boolean",
            });
        }

        const user = await User.findById(id);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            });
        }

        const isSelf = String(user._id) === String(req.user?.id);

        if (isSelf && nextStatus === false) {
            return res.status(400).json({
                success: false,
                message: "You cannot deactivate your own account",
            });
        }

        if (user.role === "admin" && user.isActive !== false && nextStatus === false) {
            const otherActiveAdmins = await User.countDocuments({
                _id: { $ne: user._id },
                role: "admin",
                isActive: true,
            });

            if (otherActiveAdmins <= 0) {
                return res.status(400).json({
                    success: false,
                    message: "At least one active admin account must be kept",
                });
            }
        }

        user.isActive = nextStatus;
        user.deactivatedAt = nextStatus ? null : user.deactivatedAt || new Date();
        await user.save();

        return res.status(200).json({
            success: true,
            message: "User status updated successfully",
            data: serializeUser(user),
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to update user status",
        });
    }
};

const resetAdminUserPassword = async (req, res) => {
    try {
        const { id } = req.params;
        const newPassword = String(req.body?.newPassword ?? "");

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid user id",
            });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({
                success: false,
                message: "newPassword must be at least 6 characters",
            });
        }

        const user = await User.findById(id);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            });
        }

        user.passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
        await user.save();

        return res.status(200).json({
            success: true,
            message: "User password reset successfully",
            data: {
                id: String(user._id),
            },
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to reset user password",
        });
    }
};

const deleteAdminUser = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid user id",
            });
        }

        if (String(id) === String(req.user?.id)) {
            return res.status(400).json({
                success: false,
                message: "You cannot delete your own account",
            });
        }

        const user = await User.findById(id).lean();

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            });
        }

        if (user.role === "admin" && user.isActive !== false) {
            const otherActiveAdmins = await User.countDocuments({
                _id: { $ne: user._id },
                role: "admin",
                isActive: true,
            });

            if (otherActiveAdmins <= 0) {
                return res.status(400).json({
                    success: false,
                    message: "At least one active admin account must be kept",
                });
            }
        }

        await Promise.all([
            User.deleteOne({ _id: user._id }),
            UserProgress.deleteOne({ userId: user._id }),
        ]);

        return res.status(200).json({
            success: true,
            message: "User deleted successfully",
            data: {
                id,
            },
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to delete user",
        });
    }
};

const getAdminReports = async (_req, res) => {
    try {
        const sevenDaysAgo = new Date(Date.now() - 7 * DAY_IN_MS);
        const [users, attempts, aiSessions, exercises] = await Promise.all([
            User.find({})
                .select("currentLevel createdAt")
                .lean(),
            ExerciseAttempt.find({})
                .select("exerciseRef score total percent durationSec submittedAt")
                .lean(),
            AiSession.find({})
                .select("status startedAt endedAt createdAt")
                .lean(),
            Exercise.find({}).select("title").lean(),
        ]);

        const exerciseMap = new Map(
            exercises.map((item) => [String(item._id), item.title || "Untitled exercise"])
        );

        const attemptsLast7Days = attempts.filter(
            (item) => item.submittedAt && new Date(item.submittedAt) >= sevenDaysAgo
        );
        const aiSessionsLast7Days = aiSessions.filter(
            (item) => item.createdAt && new Date(item.createdAt) >= sevenDaysAgo
        );

        const totalSpeakingMinutes = aiSessions.reduce((sum, item) => {
            if (!item.startedAt || !item.endedAt) {
                return sum;
            }

            const diffMs = new Date(item.endedAt).getTime() - new Date(item.startedAt).getTime();
            if (!Number.isFinite(diffMs) || diffMs <= 0) {
                return sum;
            }

            return sum + Math.round(diffMs / 60000);
        }, 0);

        const dayBuckets = buildDayBuckets(7);
        const weeklyActivity = dayBuckets.map((bucket) => {
            const attemptCount = attemptsLast7Days.filter(
                (item) => toIsoDate(item.submittedAt)?.slice(0, 10) === bucket.key
            ).length;
            const aiSessionCount = aiSessionsLast7Days.filter(
                (item) => toIsoDate(item.createdAt)?.slice(0, 10) === bucket.key
            ).length;

            return {
                date: bucket.key,
                label: bucket.label,
                attempts: attemptCount,
                aiSessions: aiSessionCount,
            };
        });

        const topExercises = [...new Map(
            attempts.map((item) => {
                const key = String(item.exerciseRef);
                return [key, { key, title: exerciseMap.get(key) || "Untitled exercise" }];
            })
        ).values()]
            .map((exercise) => {
                const related = attempts.filter(
                    (item) => String(item.exerciseRef) === exercise.key
                );
                const totalAttempts = related.length;
                const averagePercent = totalAttempts
                    ? Math.round(
                        related.reduce((sum, item) => sum + (item.percent ?? 0), 0) / totalAttempts
                    )
                    : 0;

                return {
                    exerciseId: exercise.key,
                    title: exercise.title,
                    attempts: totalAttempts,
                    averagePercent,
                };
            })
            .sort((a, b) => b.attempts - a.attempts || b.averagePercent - a.averagePercent)
            .slice(0, 5);

        return res.status(200).json({
            success: true,
            message: "Admin reports fetched successfully",
            data: {
                summary: {
                    totalUsers: users.length,
                    totalExerciseAttempts: attempts.length,
                    averageExercisePercent: attempts.length
                        ? Math.round(
                            attempts.reduce((sum, item) => sum + (item.percent ?? 0), 0) /
                            attempts.length
                        )
                        : 0,
                    totalSpeakingMinutes,
                    aiSessionStatusBreakdown: AI_SESSION_STATUSES.map((status) => ({
                        status,
                        count: aiSessions.filter((item) => item.status === status).length,
                    })),
                },
                weeklyActivity,
                levelDistribution: getLevelBreakdown(users),
                topExercises,
            },
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to fetch admin reports",
        });
    }
};

export {
    createAdminUser,
    deleteAdminUser,
    deleteCurrentUserAvatar,
    getAdminOverview,
    getAdminReports,
    getAdminUserById,
    getAdminUsers,
    getCurrentUserProfile,
    resetAdminUserPassword,
    updateAdminUser,
    updateAdminUserRole,
    updateAdminUserStatus,
    updateCurrentUserAvatar,
    updateCurrentUserProfile,
};
