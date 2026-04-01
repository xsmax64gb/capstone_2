import mongoose from "mongoose";

const mapSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, trim: true },
    description: { type: String, trim: true, default: "" },
    coverImageUrl: { type: String, trim: true, default: "" },
    theme: { type: String, trim: true, default: "" },
    level: { type: Number, default: 1, min: 1 },
    order: { type: Number, default: 0 },
    prerequisiteMapId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Map",
      default: null,
    },
    isPublished: { type: Boolean, default: false },
    totalXP: { type: Number, default: 0, min: 0 },
    requiredXPToComplete: { type: Number, default: 0, min: 0 },
    bossXPReward: { type: Number, default: 0, min: 0 },
    unlocksMapId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Map",
      default: null,
    },
  },
  {
    collection: "maps",
    timestamps: { createdAt: true, updatedAt: true },
  }
);

mapSchema.index({ level: 1, order: 1, isPublished: 1 });

export default mongoose.models.Map || mongoose.model("Map", mapSchema);
