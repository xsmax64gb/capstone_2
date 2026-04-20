// Helper để tích hợp XP với hệ thống cấp độ
import { User } from "../models/index.js";
import { checkLevelUpEligibility } from "../services/level-manager.service.js";
import { createInboxNotificationForUser } from "../services/inbox-notification.service.js";

/**
 * Award XP to user and check for level-up eligibility
 * This function should be used instead of direct User.updateOne({ $inc: { exp } })
 * @param {string} userId - User ID
 * @param {number} xpAmount - XP amount to award
 * @returns {Promise<Object>} Result with level-up info
 */
export async function awardXpAndCheckLevel(userId, xpAmount) {
  if (xpAmount <= 0) {
    return { xpAwarded: 0, levelUpAvailable: false };
  }

  // Ensure XP amount is positive and safe
  const safeXpAmount = Math.max(0, Math.floor(xpAmount));
  if (safeXpAmount === 0) {
    return { xpAwarded: 0, levelUpAvailable: false };
  }

  // Award XP
  await User.updateOne({ _id: userId }, { $inc: { exp: safeXpAmount } });

  // Check level-up eligibility
  try {
    const eligibility = await checkLevelUpEligibility(userId);

    if (eligibility.canLevelUp) {
      // Send notification about level-up availability
      if (eligibility.autoAdvance) {
        // Auto-advance notification
        await createInboxNotificationForUser(userId, {
          title: "Chúc mừng! Bạn đã lên cấp độ mới",
          body: `Bạn đã đạt đủ XP để lên cấp độ ${eligibility.nextLevel}. Không có bài kiểm tra cho cấp độ này, bạn đã được tự động thăng cấp!`,
          category: "milestone",
          meta: {
            kind: "level_up",
            autoAdvance: true,
            nextLevel: eligibility.nextLevel,
          },
        });
      } else if (eligibility.testsExist) {
        // Test available notification
        await createInboxNotificationForUser(userId, {
          title: "Bài kiểm tra cấp độ đã sẵn sàng!",
          body: `Bạn đã đạt đủ XP để làm bài kiểm tra lên cấp độ ${eligibility.nextLevel}. Hãy thử sức ngay!`,
          category: "milestone",
          meta: {
            kind: "level_test_available",
            nextLevel: eligibility.nextLevel,
          },
        });
      }

      return {
        xpAwarded: xpAmount,
        levelUpAvailable: true,
        eligibility,
      };
    }

    return {
      xpAwarded: xpAmount,
      levelUpAvailable: false,
    };
  } catch (error) {
    console.error("[XP-Level Integration] Error checking level eligibility:", error);
    // Don't fail XP award if level check fails
    return {
      xpAwarded: xpAmount,
      levelUpAvailable: false,
      error: error.message,
    };
  }
}

/**
 * Get user's current level info
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Level info
 */
export async function getUserLevelStatus(userId) {
  try {
    const { getUserLevelInfo } = await import("../services/level-manager.service.js");
    return await getUserLevelInfo(userId);
  } catch (error) {
    console.error("[XP-Level Integration] Error getting level info:", error);
    return null;
  }
}
