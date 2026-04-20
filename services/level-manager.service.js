// Service quản lý cấp độ người dùng và tiến trình
import mongoose from "mongoose";
import { UserLevel, LevelHistory, User } from "../models/index.js";
import { hasActiveTests } from "./test-engine.service.js";
import { awardLevelBadge } from "./reward-manager.service.js";

// Level names mapping
const LEVEL_NAMES = [
  "Beginner",
  "Elementary",
  "Pre-Intermediate",
  "Intermediate",
  "Upper-Intermediate",
  "Advanced",
];

// Level thresholds: XP needed to START each level
// Level 1 starts at 0, Level 2 starts at 500, etc.
const LEVEL_START_THRESHOLDS = {
  1: 0,
  2: 500,    // 1² × 500
  3: 2000,   // 2² × 500
  4: 4500,   // 3² × 500
  5: 8000,   // 4² × 500
  6: 12500,  // 5² × 500
};

// Level end thresholds: XP needed to REACH next level
const LEVEL_END_THRESHOLDS = {
  1: 500,    // 1² × 500
  2: 2000,   // 2² × 500
  3: 4500,   // 3² × 500
  4: 8000,   // 4² × 500
  5: 12500,  // 5² × 500
  6: 18000,  // 6² × 500
};

/**
 * Calculate XP threshold for a level using formula: threshold = level² × 500
 * This returns the XP needed to REACH the next level (end of current level)
 * @param {number} levelNumber - Level number (1-6)
 * @returns {number} XP threshold
 */
export function calculateLevelThreshold(levelNumber) {
  if (levelNumber < 1 || levelNumber > 6) {
    throw new Error("Level must be between 1 and 6");
  }
  return LEVEL_END_THRESHOLDS[levelNumber];
}

/**
 * Get the starting XP threshold for a level
 * @param {number} levelNumber - Level number (1-6)
 * @returns {number} Starting XP threshold
 */
export function getLevelStartThreshold(levelNumber) {
  if (levelNumber < 1 || levelNumber > 6) {
    throw new Error("Level must be between 1 and 6");
  }
  return LEVEL_START_THRESHOLDS[levelNumber];
}

/**
 * Determine current level from total XP
 * @param {number} totalXp - Total XP amount
 * @returns {number} Current level (1-6)
 */
export function getLevelFromXp(totalXp) {
  if (totalXp >= LEVEL_START_THRESHOLDS[6]) return 6;
  if (totalXp >= LEVEL_START_THRESHOLDS[5]) return 5;
  if (totalXp >= LEVEL_START_THRESHOLDS[4]) return 4;
  if (totalXp >= LEVEL_START_THRESHOLDS[3]) return 3;
  if (totalXp >= LEVEL_START_THRESHOLDS[2]) return 2;
  return 1;
}

/**
 * Get level name from level number
 * @param {number} level - Level number (1-6)
 * @returns {string} Level name
 */
export function getLevelName(level) {
  if (level < 1 || level > 6) {
    throw new Error("Level must be between 1 and 6");
  }
  return LEVEL_NAMES[level - 1];
}

/**
 * Check if user is eligible for level-up
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Eligibility status with test availability
 */
export async function checkLevelUpEligibility(userId) {
  const uid = new mongoose.Types.ObjectId(userId);

  // Get user's current XP from User model
  const user = await User.findById(uid).select("exp").lean();
  if (!user) {
    throw new Error("User not found");
  }

  const totalXp = user.exp || 0;

  // Get or create UserLevel
  let userLevel = await UserLevel.findOne({ userId: uid });
  if (!userLevel) {
    // Create initial UserLevel if doesn't exist
    const currentLevel = getLevelFromXp(totalXp);
    const nextLevelThreshold = calculateLevelThreshold(currentLevel + 1);
    userLevel = await UserLevel.create({
      userId: uid,
      currentLevel,
      totalXp,
      nextLevelThreshold,
      testAvailable: false,
    });
  }

  // Update totalXp from User model
  userLevel.totalXp = totalXp;
  
  // Recalculate current level from XP to ensure consistency
  const calculatedLevel = getLevelFromXp(totalXp);
  if (userLevel.currentLevel !== calculatedLevel) {
    console.log(`[Level Manager] Fixing level mismatch in eligibility check for user ${userId}: stored=${userLevel.currentLevel}, calculated=${calculatedLevel}, xp=${totalXp}`);
    userLevel.currentLevel = calculatedLevel;
    userLevel.nextLevelThreshold = calculatedLevel < 6 ? calculateLevelThreshold(calculatedLevel + 1) : null;
  }

  const currentLevel = userLevel.currentLevel;
  const nextLevel = currentLevel + 1;

  // Check if already at max level
  if (currentLevel >= 6) {
    await userLevel.save();
    return {
      canLevelUp: false,
      reason: "max_level_reached",
      currentLevel,
      totalXp,
    };
  }

  const nextLevelThreshold = calculateLevelThreshold(nextLevel);

  // Check if user has enough XP for next level
  if (totalXp < nextLevelThreshold) {
    await userLevel.save();
    return {
      canLevelUp: false,
      reason: "insufficient_xp",
      currentLevel,
      totalXp,
      nextLevelThreshold,
      xpNeeded: nextLevelThreshold - totalXp,
    };
  }

  // User has enough XP, check if tests exist for next level
  const testsExist = await hasActiveTests(nextLevel);

  if (!testsExist) {
    // Auto-advance: no tests available
    userLevel.testAvailable = true;
    await userLevel.save();
    return {
      canLevelUp: true,
      autoAdvance: true,
      currentLevel,
      nextLevel,
      totalXp,
      testsExist: false,
    };
  }

  // Tests exist, user needs to take test
  userLevel.testAvailable = true;
  await userLevel.save();

  return {
    canLevelUp: true,
    autoAdvance: false,
    currentLevel,
    nextLevel,
    totalXp,
    testsExist: true,
  };
}

/**
 * Get user level information with progress
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Level info with progress
 */
export async function getUserLevelInfo(userId) {
  const uid = new mongoose.Types.ObjectId(userId);

  // Get user's current XP
  const user = await User.findById(uid).select("exp").lean();
  if (!user) {
    throw new Error("User not found");
  }

  const totalXp = user.exp || 0;

  // Get or create UserLevel
  let userLevel = await UserLevel.findOne({ userId: uid });
  if (!userLevel) {
    const currentLevel = getLevelFromXp(totalXp);
    const nextLevelThreshold = calculateLevelThreshold(currentLevel + 1);
    userLevel = await UserLevel.create({
      userId: uid,
      currentLevel,
      totalXp,
      nextLevelThreshold,
      testAvailable: false,
    });
  }

  // Update totalXp
  userLevel.totalXp = totalXp;
  
  // Recalculate current level from XP to ensure consistency
  const calculatedLevel = getLevelFromXp(totalXp);
  if (userLevel.currentLevel !== calculatedLevel) {
    console.log(`[Level Manager] Fixing level mismatch for user ${userId}: stored=${userLevel.currentLevel}, calculated=${calculatedLevel}, xp=${totalXp}`);
    userLevel.currentLevel = calculatedLevel;
    userLevel.nextLevelThreshold = calculatedLevel < 6 ? calculateLevelThreshold(calculatedLevel + 1) : null;
  }
  
  await userLevel.save();

  const currentLevel = userLevel.currentLevel;
  const currentLevelName = getLevelName(currentLevel);
  // Current level threshold is the threshold of the PREVIOUS level (or 0 for level 1)
  const currentLevelThreshold = currentLevel > 1 ? calculateLevelThreshold(currentLevel) : 0;
  const nextLevelThreshold =
    currentLevel < 6 ? calculateLevelThreshold(currentLevel + 1) : null;

  const xpToNextLevel = nextLevelThreshold ? nextLevelThreshold - totalXp : 0;
  const progressPercentage = nextLevelThreshold
    ? Math.min(
        100,
        Math.max(
          0,
          ((totalXp - currentLevelThreshold) /
            (nextLevelThreshold - currentLevelThreshold)) *
            100
        )
      )
    : 100;

  return {
    currentLevel,
    currentLevelName,
    totalXp,
    currentLevelThreshold,
    nextLevelThreshold,
    xpToNextLevel: Math.max(0, xpToNextLevel),
    progressPercentage: Math.round(progressPercentage * 100) / 100,
    testAvailable: userLevel.testAvailable,
    canAttemptTest: userLevel.testAvailable && totalXp >= nextLevelThreshold,
  };
}

/**
 * Advance user to next level (after test pass or auto-advance)
 * Uses MongoDB transaction for atomicity
 * @param {string} userId - User ID
 * @param {string} unlockMethod - 'test_passed' or 'auto_advanced'
 * @param {number|null} testScore - Test score if applicable
 * @param {string|null} testAttemptId - Test attempt ID if applicable
 * @returns {Promise<Object>} Level advancement result
 */
export async function advanceUserLevel(
  userId,
  unlockMethod,
  testScore = null,
  testAttemptId = null
) {
  const uid = new mongoose.Types.ObjectId(userId);
  const session = await mongoose.startSession();

  try {
    await session.startTransaction();

    // Get UserLevel
    const userLevel = await UserLevel.findOne({ userId: uid }).session(session);
    if (!userLevel) {
      throw new Error("UserLevel not found");
    }

    const currentLevel = userLevel.currentLevel;
    const newLevel = currentLevel + 1;

    if (newLevel > 6) {
      throw new Error("Already at maximum level");
    }

    // Update UserLevel
    userLevel.currentLevel = newLevel;
    userLevel.nextLevelThreshold = calculateLevelThreshold(newLevel + 1);
    userLevel.testAvailable = false;
    userLevel.lastTestAttemptAt = null;
    userLevel.xpAtLastFailedTest = null;
    await userLevel.save({ session });

    // Create LevelHistory entry
    const levelName = getLevelName(newLevel);
    await LevelHistory.create(
      [
        {
          userId: uid,
          level: newLevel,
          levelName,
          unlockMethod,
          testScore,
          testAttemptId: testAttemptId
            ? new mongoose.Types.ObjectId(testAttemptId)
            : null,
          unlockedAt: new Date(),
        },
      ],
      { session }
    );

    // Award badge (within transaction)
    await awardLevelBadge(userId, newLevel, unlockMethod, session);

    await session.commitTransaction();

    return {
      success: true,
      newLevel,
      newLevelName: levelName,
      unlockMethod,
      testScore,
    };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
}

/**
 * Get level progression history for user
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Level history with statistics
 */
export async function getLevelHistory(userId) {
  const uid = new mongoose.Types.ObjectId(userId);

  // Get level history
  const history = await LevelHistory.find({ userId: uid })
    .sort({ unlockedAt: 1 })
    .lean();

  // Get current level info
  const userLevel = await UserLevel.findOne({ userId: uid }).lean();
  const currentLevel = userLevel ? userLevel.currentLevel : 1;

  // Calculate statistics
  const testsPassed = history.filter((h) => h.unlockMethod === "test_passed").length;
  const testScores = history
    .filter((h) => h.testScore !== null)
    .map((h) => h.testScore);
  const averageTestScore =
    testScores.length > 0
      ? testScores.reduce((sum, score) => sum + score, 0) / testScores.length
      : 0;

  return {
    history: history.map((h) => ({
      level: h.level,
      levelName: h.levelName,
      unlockMethod: h.unlockMethod,
      testScore: h.testScore,
      unlockedAt: h.unlockedAt,
    })),
    statistics: {
      currentLevel,
      levelsCompleted: history.length,
      testsPassed,
      testsFailed: 0, // Will be calculated from test attempts
      averageTestScore: Math.round(averageTestScore * 100) / 100,
    },
  };
}
