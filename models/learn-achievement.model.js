// Thành tựu (key, title, description, icon, trigger condition, XP reward)
import mongoose from "mongoose";

const learnAchievementSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, trim: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: "" },
    iconUrl: { type: String, trim: true, default: "" },
    trigger: { type: String, trim: true, default: "" },
    xpReward: { type: Number, default: 0, min: 0 },
  },
  {
    collection: "achievements",
    timestamps: true,
  }
);

export default mongoose.models.LearnAchievement ||
  mongoose.model("LearnAchievement", learnAchievementSchema);
