import mongoose from "mongoose";

import InboxNotification from "../models/inbox-notification.model.js";
import User from "../models/user.model.js";
import {
  createInboxNotificationForUser,
  createInboxNotificationsForAllActiveUsers,
  countUnreadInboxNotifications,
} from "../services/inbox-notification.service.js";

const toIso = (d) => (d instanceof Date && !Number.isNaN(d.getTime()) ? d.toISOString() : null);

const serializeInbox = (doc) => ({
  id: String(doc._id),
  title: doc.title,
  body: doc.body || "",
  category: doc.category,
  read: Boolean(doc.read),
  readAt: toIso(doc.readAt),
  createdAt: toIso(doc.createdAt),
  meta: doc.meta && typeof doc.meta === "object" ? doc.meta : {},
});

const getMyInboxNotifications = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit || "20"), 10) || 20));
    const offset = Math.max(0, parseInt(String(req.query.offset || "0"), 10) || 0);

    const uid = new mongoose.Types.ObjectId(String(userId));

    const [items, unreadCount, total] = await Promise.all([
      InboxNotification.find({ userId: uid })
        .sort({ createdAt: -1 })
        .skip(offset)
        .limit(limit)
        .lean(),
      InboxNotification.countDocuments({ userId: uid, read: false }),
      InboxNotification.countDocuments({ userId: uid }),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        items: items.map(serializeInbox),
        unreadCount,
        total,
        limit,
        offset,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to load notifications",
    });
  }
};

const getUnreadInboxCount = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const unreadCount = await countUnreadInboxNotifications(userId);
    return res.status(200).json({
      success: true,
      data: { unreadCount },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to count notifications",
    });
  }
};

const markInboxNotificationRead = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid notification id" });
    }

    const uid = new mongoose.Types.ObjectId(String(userId));
    const doc = await InboxNotification.findOneAndUpdate(
      { _id: id, userId: uid },
      { $set: { read: true, readAt: new Date() } },
      { new: true }
    ).lean();

    if (!doc) {
      return res.status(404).json({ success: false, message: "Notification not found" });
    }

    return res.status(200).json({
      success: true,
      data: serializeInbox(doc),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to update notification",
    });
  }
};

const markAllInboxNotificationsRead = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const uid = new mongoose.Types.ObjectId(String(userId));
    const now = new Date();

    const result = await InboxNotification.updateMany(
      { userId: uid, read: false },
      { $set: { read: true, readAt: now } }
    );

    return res.status(200).json({
      success: true,
      data: { modified: result.modifiedCount ?? 0 },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to mark all read",
    });
  }
};

const adminSendInboxNotification = async (req, res) => {
  try {
    const { scope, userId: targetUserId, title, body } = req.body || {};

    const cleanTitle = String(title || "").trim();
    const cleanBody = String(body || "").trim();

    if (!cleanTitle) {
      return res.status(400).json({ success: false, message: "title is required" });
    }

    if (cleanTitle.length > 200) {
      return res.status(400).json({ success: false, message: "title too long" });
    }

    if (cleanBody.length > 4000) {
      return res.status(400).json({ success: false, message: "body too long" });
    }

    if (scope === "user") {
      if (!targetUserId || !mongoose.Types.ObjectId.isValid(String(targetUserId))) {
        return res.status(400).json({ success: false, message: "valid userId is required" });
      }

      const exists = await User.exists({ _id: targetUserId });
      if (!exists) {
        return res.status(404).json({ success: false, message: "User not found" });
      }

      const doc = await createInboxNotificationForUser(targetUserId, {
        title: cleanTitle,
        body: cleanBody,
        category: "admin_direct",
        meta: { sentBy: req.user?.id || null },
      });

      return res.status(201).json({
        success: true,
        message: "Notification sent",
        data: { notificationId: doc ? String(doc._id) : null },
      });
    }

    if (scope === "all") {
      const { inserted } = await createInboxNotificationsForAllActiveUsers({
        title: cleanTitle,
        body: cleanBody,
        category: "admin_broadcast",
        meta: { sentBy: req.user?.id || null },
      });

      return res.status(201).json({
        success: true,
        message: "Broadcast queued",
        data: { recipients: inserted },
      });
    }

    return res.status(400).json({
      success: false,
      message: 'scope must be "all" or "user"',
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to send notification",
    });
  }
};

export {
  adminSendInboxNotification,
  getMyInboxNotifications,
  getUnreadInboxCount,
  markAllInboxNotificationsRead,
  markInboxNotificationRead,
};
