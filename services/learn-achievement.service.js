import mongoose from "mongoose";

import {
  LearnAchievement,
  UserLearnAchievement,
  User,
} from "../models/index.js";
import { createInboxNotificationForUser } from "./inbox-notification.service.js";

/**
 * Grant achievement if not already earned. Adds XP to user.exp.
 */
async function grantAchievement(userId, achievement, meta = {}) {
  if (!achievement?._id) return null;
  const uid = new mongoose.Types.ObjectId(userId);

  const existing = await UserLearnAchievement.findOne({
    userId: uid,
    achievementId: achievement._id,
  }).lean();
  if (existing) return { alreadyHad: true, achievement };

  await UserLearnAchievement.create({
    userId: uid,
    achievementId: achievement._id,
    earnedAt: new Date(),
  });

  const xp = achievement.xpReward || 0;
  if (xp > 0) {
    const safeXp = Math.max(0, Math.floor(xp));
    if (safeXp > 0) {
      await User.updateOne({ _id: uid }, { $inc: { exp: safeXp } });
    }
  }

  try {
    await createInboxNotificationForUser(String(userId), {
      title: "Thành tích mới",
      body: [achievement.title, achievement.description].filter(Boolean).join(" — "),
      category: "milestone",
      meta: { kind: "achievement", key: achievement.key, ...meta },
    });
  } catch (err) {
    console.error("[Inbox] achievement", err?.message || err);
  }

  return { newlyEarned: true, achievement };
}

export async function tryGrantAchievementByKey(userId, key, meta = {}) {
  if (!key) return null;
  const achievement = await LearnAchievement.findOne({ key }).lean();
  return grantAchievement(userId, achievement, meta);
}

export async function tryGrantAchievementById(userId, achievementId, meta = {}) {
  if (!achievementId || !mongoose.Types.ObjectId.isValid(achievementId)) {
    return null;
  }

  const achievement = await LearnAchievement.findById(achievementId).lean();
  return grantAchievement(userId, achievement, meta);
}

export async function listUserAchievements(userId) {
  const uid = new mongoose.Types.ObjectId(userId);
  const rows = await UserLearnAchievement.find({ userId: uid })
    .populate("achievementId")
    .sort({ earnedAt: -1 })
    .lean();
  return rows;
}
