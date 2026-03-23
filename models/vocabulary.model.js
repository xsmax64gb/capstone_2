import mongoose from "mongoose";

const vocabularySchema = new mongoose.Schema(
  {
    setId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "VocabularySet",
      required: true,
      index: true,
    },
    word: {
      type: String,
      required: true,
      trim: true,
    },
    wordLower: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    meaning: {
      type: String,
      required: true,
      trim: true,
    },
    example: {
      type: String,
      trim: true,
      default: "",
    },
  },
  {
    collection: "vocabularies",
    timestamps: true,
  }
);

vocabularySchema.pre("validate", function normalizeWord(next) {
  this.wordLower = String(this.word || "")
    .trim()
    .toLowerCase();
  next();
});

vocabularySchema.index({ setId: 1, wordLower: 1 }, { unique: true });
vocabularySchema.index({ word: "text", meaning: "text", example: "text" });

export default mongoose.models.Vocabulary || mongoose.model("Vocabulary", vocabularySchema);
