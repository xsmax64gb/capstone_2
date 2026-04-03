// Thành tựu của user (userId, achievementId, earned timestamp)
import mongoose from "mongoose";

const userLearnAchievementSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    achievementId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LearnAchievement",
      required: true,
    },
    earnedAt: { type: Date, default: Date.now },
  },
  {
    collection: "user_achievements",
    timestamps: false,
  }
);

userLearnAchievementSchema.index({ userId: 1, achievementId: 1 }, { unique: true });

export default mongoose.models.UserLearnAchievement ||
  mongoose.model("UserLearnAchievement", userLearnAchievementSchema);
