// Thông báo trong hộp thư người dùng (admin gửi hoặc cột mốc tự động)
import mongoose from "mongoose";

const INBOX_CATEGORIES = ["admin_broadcast", "admin_direct", "milestone"];

const inboxNotificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    body: {
      type: String,
      trim: true,
      default: "",
      maxlength: 4000,
    },
    category: {
      type: String,
      enum: INBOX_CATEGORIES,
      required: true,
      index: true,
    },
    read: {
      type: Boolean,
      default: false,
      index: true,
    },
    readAt: {
      type: Date,
      default: null,
    },
    meta: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    collection: "inbox_notifications",
    timestamps: true,
  }
);

inboxNotificationSchema.index({ userId: 1, read: 1, createdAt: -1 });
inboxNotificationSchema.index({ userId: 1, createdAt: -1 });

export const INBOX_NOTIFICATION_CATEGORIES = INBOX_CATEGORIES;

export default mongoose.models.InboxNotification ||
  mongoose.model("InboxNotification", inboxNotificationSchema);
