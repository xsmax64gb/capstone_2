import mongoose from "mongoose";

import {
  LearnAchievement,
  UserLearnAchievement,
  User,
} from "../models/index.js";
import { createInboxNotificationForUser } from "./inbox-notification.service.js";

/**
 * Grant achievement by trigger key if not already earned. Adds XP to user.exp.
 */
export async function tryGrantAchievementByKey(userId, key) {
  if (!key) return null;
  const uid = new mongoose.Types.ObjectId(userId);

  const achievement = await LearnAchievement.findOne({ key }).lean();
  if (!achievement) return null;

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
    await User.updateOne({ _id: uid }, { $inc: { exp: xp } });
  }

  try {
    await createInboxNotificationForUser(String(userId), {
      title: "Thành tích mới",
      body: [achievement.title, achievement.description].filter(Boolean).join(" — "),
      category: "milestone",
      meta: { kind: "achievement", key: achievement.key },
    });
  } catch (err) {
    console.error("[Inbox] achievement", err?.message || err);
  }

  return { newlyEarned: true, achievement };
}

export async function tryGrantFirstBossWin(userId) {
  return tryGrantAchievementByKey(userId, "first_boss_win");
}

export async function listUserAchievements(userId) {
  const uid = new mongoose.Types.ObjectId(userId);
  const rows = await UserLearnAchievement.find({ userId: uid })
    .populate("achievementId")
    .sort({ earnedAt: -1 })
    .lean();
  return rows;
}
