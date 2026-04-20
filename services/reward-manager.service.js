// Service quản lý phần thưởng và huy hiệu
import mongoose from "mongoose";
import { LevelBadge, Exercise, VocabularySet } from "../models/index.js";

// Level names mapping
const LEVEL_NAMES = [
  "Beginner",
  "Elementary",
  "Pre-Intermediate",
  "Intermediate",
  "Upper-Intermediate",
  "Advanced",
];

// Badge icon mapping (can be customized)
const BADGE_ICONS = {
  1: "/badges/beginner.svg",
  2: "/badges/elementary.svg",
  3: "/badges/pre-intermediate.svg",
  4: "/badges/intermediate.svg",
  5: "/badges/upper-intermediate.svg",
  6: "/badges/advanced.svg",
};

/**
 * Award a level badge to user
 * @param {string} userId - User ID
 * @param {number} level - Level number (1-6)
 * @param {string} unlockMethod - 'test_passed' or 'auto_advanced'
 * @param {Object} session - MongoDB session for transaction
 * @returns {Promise<Object>} Created badge
 */
export async function awardLevelBadge(userId, level, unlockMethod, session = null) {
  const uid = new mongoose.Types.ObjectId(userId);

  if (level < 1 || level > 6) {
    throw new Error("Level must be between 1 and 6");
  }

  const levelName = LEVEL_NAMES[level - 1];
  const badgeIcon = BADGE_ICONS[level] || "/badges/default.svg";

  // Check if badge already exists
  const existingBadge = await LevelBadge.findOne({ userId: uid, level }).session(
    session
  );

  if (existingBadge) {
    return existingBadge;
  }

  // Create badge
  const badge = await LevelBadge.create(
    [
      {
        userId: uid,
        level,
        levelName,
        badgeIcon,
        unlockMethod,
        unlockedAt: new Date(),
      },
    ],
    { session }
  );

  return badge[0];
}

/**
 * Get user's badges
 * @param {string} userId - User ID
 * @returns {Promise<Array>} List of badges
 */
export async function getUserBadges(userId) {
  const uid = new mongoose.Types.ObjectId(userId);

  const badges = await LevelBadge.find({ userId: uid })
    .sort({ level: 1 })
    .lean();

  return badges.map((badge) => ({
    level: badge.level,
    levelName: badge.levelName,
    badgeIcon: badge.badgeIcon,
    unlockMethod: badge.unlockMethod,
    unlockedAt: badge.unlockedAt,
  }));
}

/**
 * Unlock content for a level
 * Returns count of newly unlocked content
 * @param {string} userId - User ID
 * @param {number} level - Level number
 * @returns {Promise<Object>} Unlocked content counts
 */
export async function unlockContentForLevel(userId, level) {
  // Map level number to CEFR level
  const LEVEL_TO_CEFR = {
    1: "A1",
    2: "A2",
    3: "B1",
    4: "B2",
    5: "C1",
    6: "C2",
  };

  const cefrLevel = LEVEL_TO_CEFR[level];
  if (!cefrLevel) {
    throw new Error("Invalid level");
  }

  // Get all CEFR levels up to and including current level
  const CEFR_ORDER = ["A1", "A2", "B1", "B2", "C1", "C2"];
  const levelIndex = CEFR_ORDER.indexOf(cefrLevel);
  const unlockedLevels = CEFR_ORDER.slice(0, levelIndex + 1);

  // Count exercises for unlocked levels
  const exerciseCount = await Exercise.countDocuments({
    level: { $in: unlockedLevels },
    source: "catalog", // Only catalog exercises
  });

  // Count vocabulary sets for unlocked levels
  const vocabularyCount = await VocabularySet.countDocuments({
    level: { $in: unlockedLevels },
    source: "catalog", // Only catalog vocabulary sets
  });

  return {
    exercises: exerciseCount,
    vocabularies: vocabularyCount,
  };
}

/**
 * Get unlocked content list for a level
 * @param {string} userId - User ID
 * @param {number} level - Level number
 * @returns {Promise<Object>} Unlocked content details
 */
export async function getUnlockedContent(userId, level) {
  // Map level number to CEFR level
  const LEVEL_TO_CEFR = {
    1: "A1",
    2: "A2",
    3: "B1",
    4: "B2",
    5: "C1",
    6: "C2",
  };

  const cefrLevel = LEVEL_TO_CEFR[level];
  if (!cefrLevel) {
    throw new Error("Invalid level");
  }

  // Get all CEFR levels up to and including current level
  const CEFR_ORDER = ["A1", "A2", "B1", "B2", "C1", "C2"];
  const levelIndex = CEFR_ORDER.indexOf(cefrLevel);
  const unlockedLevels = CEFR_ORDER.slice(0, levelIndex + 1);

  // Get exercises
  const exercises = await Exercise.find({
    level: { $in: unlockedLevels },
    source: "catalog",
  })
    .select("title level type topic")
    .sort({ level: 1, title: 1 })
    .lean();

  // Get vocabulary sets
  const vocabularySets = await VocabularySet.find({
    level: { $in: unlockedLevels },
    source: "catalog",
  })
    .select("title level topic")
    .sort({ level: 1, title: 1 })
    .lean();

  return {
    exercises: exercises.map((e) => ({
      id: e._id.toString(),
      title: e.title,
      level: e.level,
      type: e.type,
      topic: e.topic,
    })),
    vocabularySets: vocabularySets.map((v) => ({
      id: v._id.toString(),
      title: v.title,
      level: v.level,
      topic: v.topic,
    })),
  };
}
