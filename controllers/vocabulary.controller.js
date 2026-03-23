import { uploadImageFile } from "../helper/upload.helper.js";
import { Vocabulary } from "../models/index.js";

const toIsoDate = (value) => {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
};

const serializeVocabulary = (item) => ({
  id: String(item._id),
  word: item.word,
  meaning: item.meaning,
  phonetic: item.phonetic || "",
  example: item.example || "",
  level: item.level,
  topic: item.topic || "general",
  imageUrl: item.imageUrl || "",
  audioUrl: item.audioUrl || "",
  createdAt: toIsoDate(item.createdAt),
  updatedAt: toIsoDate(item.updatedAt),
});

const resolveImageUrl = async (req) => {
  if (req.file) {
    const uploadResult = await uploadImageFile(req.file, {
      folder: "vocabulary",
      tags: ["vocabulary"],
    });

    return uploadResult.secureUrl || uploadResult.url || "";
  }

  return String(req.body?.imageUrl || "").trim();
};

const getAdminVocabulary = async (_req, res) => {
  try {
    const items = await Vocabulary.find({})
      .sort({ updatedAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      message: "Admin vocabulary fetched successfully",
      data: {
        items: items.map(serializeVocabulary),
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch vocabulary",
    });
  }
};

const createAdminVocabulary = async (req, res) => {
  try {
    const {
      word,
      meaning,
      phonetic = "",
      example = "",
      level,
      topic = "general",
      audioUrl = "",
    } = req.body;

    if (!word || !meaning || !level) {
      return res.status(400).json({
        success: false,
        message: "word, meaning, and level are required",
      });
    }

    const imageUrl = await resolveImageUrl(req);

    const item = await Vocabulary.create({
      word: String(word).trim(),
      meaning: String(meaning).trim(),
      phonetic: String(phonetic).trim(),
      example: String(example).trim(),
      level,
      topic: String(topic).trim() || "general",
      imageUrl,
      audioUrl: String(audioUrl).trim(),
    });

    return res.status(201).json({
      success: true,
      message: "Vocabulary created successfully",
      data: serializeVocabulary(item.toObject()),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to create vocabulary",
    });
  }
};

const updateAdminVocabulary = async (req, res) => {
  try {
    const item = await Vocabulary.findById(req.params.id);

    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Vocabulary not found",
      });
    }

    const payload = req.body || {};

    if (payload.word !== undefined) item.word = String(payload.word).trim();
    if (payload.meaning !== undefined) item.meaning = String(payload.meaning).trim();
    if (payload.phonetic !== undefined) item.phonetic = String(payload.phonetic).trim();
    if (payload.example !== undefined) item.example = String(payload.example).trim();
    if (payload.level !== undefined) item.level = payload.level;
    if (payload.topic !== undefined) item.topic = String(payload.topic).trim() || "general";
    if (payload.imageUrl !== undefined || req.file) {
      item.imageUrl = await resolveImageUrl(req);
    }
    if (payload.audioUrl !== undefined) item.audioUrl = String(payload.audioUrl).trim();

    await item.save();

    return res.status(200).json({
      success: true,
      message: "Vocabulary updated successfully",
      data: serializeVocabulary(item.toObject()),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to update vocabulary",
    });
  }
};

const deleteAdminVocabulary = async (req, res) => {
  try {
    const item = await Vocabulary.findByIdAndDelete(req.params.id);

    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Vocabulary not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Vocabulary deleted successfully",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to delete vocabulary",
    });
  }
};

export {
  createAdminVocabulary,
  deleteAdminVocabulary,
  getAdminVocabulary,
  updateAdminVocabulary,
};
