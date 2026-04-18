import mongoose from "mongoose";

import InboxNotification from "../models/inbox-notification.model.js";
import User from "../models/user.model.js";

const toObjectId = (userId) => {
  if (!userId) return null;
  try {
    return new mongoose.Types.ObjectId(String(userId));
  } catch {
    return null;
  }
};

/**
 * @param {string} userId
 * @param {{ title: string, body?: string, category: string, meta?: object }} payload
 */
export async function createInboxNotificationForUser(userId, payload) {
  const uid = toObjectId(userId);
  if (!uid) return null;

  const title = String(payload.title || "").trim();
  if (!title) return null;

  return InboxNotification.create({
    userId: uid,
    title,
    body: String(payload.body || "").trim(),
    category: payload.category,
    meta: payload.meta && typeof payload.meta === "object" ? payload.meta : {},
    read: false,
  });
}

/**
 * Fan-out thông báo tới mọi tài khoản đang hoạt động (batch).
 */
export async function createInboxNotificationsForAllActiveUsers(payload) {
  const title = String(payload.title || "").trim();
  if (!title) {
    return { inserted: 0 };
  }

  const body = String(payload.body || "").trim();
  const category = payload.category || "admin_broadcast";
  const meta = payload.meta && typeof payload.meta === "object" ? payload.meta : {};

  const filter = {
    $or: [{ isActive: true }, { isActive: { $exists: false } }],
  };

  let inserted = 0;
  const batchSize = 400;
  const cursor = User.find(filter).select("_id").lean().cursor();

  let batch = [];
  for await (const row of cursor) {
    batch.push({
      userId: row._id,
      title,
      body,
      category,
      meta,
      read: false,
    });

    if (batch.length >= batchSize) {
      const res = await InboxNotification.insertMany(batch, { ordered: false });
      inserted += res.length;
      batch = [];
    }
  }

  if (batch.length) {
    const res = await InboxNotification.insertMany(batch, { ordered: false });
    inserted += res.length;
  }

  return { inserted };
}

export async function countUnreadInboxNotifications(userId) {
  const uid = toObjectId(userId);
  if (!uid) return 0;

  return InboxNotification.countDocuments({ userId: uid, read: false });
}
