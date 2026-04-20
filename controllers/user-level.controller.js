// Controller cho API cấp độ người dùng
import {
  getUserLevelInfo,
  getLevelHistory,
} from "../services/level-manager.service.js";

/**
 * GET /api/user/level
 * Get current level information for authenticated user
 */
export async function getCurrentLevel(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "User not authenticated",
          timestamp: new Date().toISOString(),
        },
      });
    }

    const levelInfo = await getUserLevelInfo(userId);

    return res.status(200).json({
      success: true,
      data: levelInfo,
    });
  } catch (error) {
    console.error("[UserLevel] Error getting current level:", error);
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "Failed to get level information",
        timestamp: new Date().toISOString(),
      },
    });
  }
}

/**
 * GET /api/user/level-history
 * Get level progression history for authenticated user
 */
export async function getLevelProgressionHistory(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "User not authenticated",
          timestamp: new Date().toISOString(),
        },
      });
    }

    const historyData = await getLevelHistory(userId);

    return res.status(200).json({
      success: true,
      data: historyData,
    });
  } catch (error) {
    console.error("[UserLevel] Error getting level history:", error);
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "Failed to get level history",
        timestamp: new Date().toISOString(),
      },
    });
  }
}
