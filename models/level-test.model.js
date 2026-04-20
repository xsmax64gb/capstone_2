// Bài kiểm tra cấp độ (level, câu hỏi, ngưỡng đạt, thời gian)
import mongoose from "mongoose";

const QUESTION_TYPES = ["mcq", "fill_blank", "matching"];

const levelTestQuestionSchema = new mongoose.Schema(
  {
    questionText: {
      type: String,
      required: true,
      trim: true,
    },
    questionType: {
      type: String,
      enum: QUESTION_TYPES,
      required: true,
    },
    options: [
      {
        text: {
          type: String,
          trim: true,
        },
        isCorrect: {
          type: Boolean,
          default: false,
        },
      },
    ],
    correctAnswer: {
      type: String,
      trim: true,
      default: "",
    },
    pairs: [
      {
        left: {
          type: String,
          trim: true,
        },
        right: {
          type: String,
          trim: true,
        },
      },
    ],
    points: {
      type: Number,
      default: 1,
      min: 0,
    },
  },
  { _id: true }
);

const levelTestSectionSchema = new mongoose.Schema(
  {
    sectionName: {
      type: String,
      required: true,
      trim: true,
    },
    weight: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    questions: {
      type: [levelTestQuestionSchema],
      default: [],
    },
  },
  { _id: true }
);

const levelTestSchema = new mongoose.Schema(
  {
    level: {
      type: Number,
      required: true,
      min: 1,
      max: 6,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    sections: {
      type: [levelTestSectionSchema],
      default: [],
      validate: {
        validator: (sections) => Array.isArray(sections) && sections.length > 0,
        message: "Level test must have at least one section",
      },
    },
    passThreshold: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
      default: 70,
    },
    timeLimit: {
      type: Number, // in minutes
      required: true,
      min: 1,
      default: 30,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    collection: "level_tests",
    timestamps: true,
  }
);

levelTestSchema.index({ level: 1, isActive: 1 });

export default mongoose.models.LevelTest || mongoose.model("LevelTest", levelTestSchema);
