import { uploadImageFile } from "../helper/upload.helper.js";
import { Vocabulary, VocabularySet } from "../models/index.js";

const toIsoDate = (value) => {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
};

const toBoolean = (value, fallback = false) => {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  if (typeof value === "boolean") {
    return value;
  }

  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["false", "0", "no", "off"].includes(normalized)) {
    return false;
  }

  return fallback;
};

const toSafeInt = (value, fallback = 0) => {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeWordLower = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();

const buildVocabularyWordPayload = (source) => {
  const word = String(source?.word || "").trim();
  const meaning = String(source?.meaning || "").trim();

  if (!word || !meaning) {
    throw new Error("word and meaning are required");
  }

  return {
    word,
    wordLower: normalizeWordLower(word),
    meaning,
    example: String(source?.example || "").trim(),
  };
};

const serializeVocabularyWord = (item) => ({
  id: String(item._id),
  setId: String(item.setId),
  word: item.word,
  meaning: item.meaning,
  example: item.example || "",
  createdAt: toIsoDate(item.createdAt),
  updatedAt: toIsoDate(item.updatedAt),
});

const serializeVocabularySet = (item, words = []) => ({
  id: String(item._id),
  name: item.name,
  description: item.description || "",
  level: item.level,
  topic: item.topic || "general",
  coverImageUrl: item.coverImageUrl || "",
  isActive: Boolean(item.isActive),
  sortOrder: Number.isFinite(item.sortOrder) ? item.sortOrder : 0,
  wordCount: words.length,
  words: words.map(serializeVocabularyWord),
  createdAt: toIsoDate(item.createdAt),
  updatedAt: toIsoDate(item.updatedAt),
});

const resolveCoverImageUrl = async (req) => {
  if (!req.file) {
    return "";
  }

  const uploadResult = await uploadImageFile(req.file, {
    folder: "vocabulary-sets",
    tags: ["vocabulary-set"],
  });

  return uploadResult.secureUrl || uploadResult.url || "";
};

const getWordsMapBySetIds = async (setIds) => {
  if (!setIds.length) {
    return new Map();
  }

  const words = await Vocabulary.find({
    setId: { $in: setIds },
  })
    .sort({ updatedAt: -1 })
    .lean();

  const map = new Map();
  words.forEach((item) => {
    const key = String(item.setId);
    if (!map.has(key)) {
      map.set(key, []);
    }
    map.get(key).push(item);
  });

  return map;
};

const getAdminVocabulary = async (_req, res) => {
  try {
    const sets = await VocabularySet.find({})
      .sort({ sortOrder: 1, updatedAt: -1 })
      .lean();

    const wordsMap = await getWordsMapBySetIds(sets.map((item) => item._id));
    const items = sets.map((item) =>
      serializeVocabularySet(item, wordsMap.get(String(item._id)) || [])
    );

    return res.status(200).json({
      success: true,
      message: "Admin vocabulary sets fetched successfully",
      data: {
        items,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch vocabulary sets",
    });
  }
};

const getAdminVocabularyById = async (req, res) => {
  try {
    const set = await VocabularySet.findById(req.params.id).lean();

    if (!set) {
      return res.status(404).json({
        success: false,
        message: "Vocabulary set not found",
      });
    }

    const words = await Vocabulary.find({ setId: set._id })
      .sort({ updatedAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      message: "Vocabulary set fetched successfully",
      data: serializeVocabularySet(set, words),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch vocabulary set",
    });
  }
};

const createAdminVocabulary = async (req, res) => {
  try {
    const {
      name,
      description = "",
      level = "A1",
      topic = "general",
      isActive = true,
      sortOrder = 0,
    } = req.body || {};

    if (!String(name || "").trim()) {
      return res.status(400).json({
        success: false,
        message: "name is required",
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "coverImageFile is required",
      });
    }

    const resolvedCoverImageUrl = await resolveCoverImageUrl(req);

    const item = await VocabularySet.create({
      name: String(name).trim(),
      description: String(description).trim(),
      level,
      topic: String(topic).trim() || "general",
      coverImageUrl: resolvedCoverImageUrl,
      isActive: toBoolean(isActive, true),
      sortOrder: Math.max(0, toSafeInt(sortOrder, 0)),
    });

    return res.status(201).json({
      success: true,
      message: "Vocabulary set created successfully",
      data: serializeVocabularySet(item.toObject(), []),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to create vocabulary set",
    });
  }
};

const updateAdminVocabulary = async (req, res) => {
  try {
    const item = await VocabularySet.findById(req.params.id);

    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Vocabulary set not found",
      });
    }

    const payload = req.body || {};

    if (payload.name !== undefined) {
      const value = String(payload.name).trim();
      if (!value) {
        return res.status(400).json({
          success: false,
          message: "name cannot be empty",
        });
      }
      item.name = value;
    }
    if (payload.description !== undefined) item.description = String(payload.description).trim();
    if (payload.level !== undefined) item.level = payload.level;
    if (payload.topic !== undefined) item.topic = String(payload.topic).trim() || "general";
    if (req.file) {
      item.coverImageUrl = await resolveCoverImageUrl(req);
    }
    if (payload.isActive !== undefined) item.isActive = toBoolean(payload.isActive, item.isActive);
    if (payload.sortOrder !== undefined) item.sortOrder = Math.max(0, toSafeInt(payload.sortOrder, item.sortOrder));

    await item.save();

    const words = await Vocabulary.find({ setId: item._id })
      .sort({ updatedAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      message: "Vocabulary set updated successfully",
      data: serializeVocabularySet(item.toObject(), words),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to update vocabulary set",
    });
  }
};

const deleteAdminVocabulary = async (req, res) => {
  try {
    const item = await VocabularySet.findByIdAndDelete(req.params.id);

    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Vocabulary set not found",
      });
    }

    const deletedWords = await Vocabulary.deleteMany({ setId: item._id });

    return res.status(200).json({
      success: true,
      message: "Vocabulary set deleted successfully",
      data: {
        deletedWordCount: deletedWords.deletedCount || 0,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to delete vocabulary set",
    });
  }
};

const getAdminVocabularyWords = async (req, res) => {
  try {
    const set = await VocabularySet.findById(req.params.id);

    if (!set) {
      return res.status(404).json({
        success: false,
        message: "Vocabulary set not found",
      });
    }

    const items = await Vocabulary.find({ setId: set._id })
      .sort({ updatedAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      message: "Vocabulary words fetched successfully",
      data: {
        set: serializeVocabularySet(set.toObject(), []),
        items: items.map(serializeVocabularyWord),
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch vocabulary words",
    });
  }
};

const createAdminVocabularyWord = async (req, res) => {
  try {
    const set = await VocabularySet.findById(req.params.id);

    if (!set) {
      return res.status(404).json({
        success: false,
        message: "Vocabulary set not found",
      });
    }

    const payload = buildVocabularyWordPayload(req.body || {});

    const item = await Vocabulary.create({
      setId: set._id,
      ...payload,
    });

    return res.status(201).json({
      success: true,
      message: "Vocabulary word created successfully",
      data: serializeVocabularyWord(item.toObject()),
    });
  } catch (error) {
    if (error?.message === "word and meaning are required") {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    if (error?.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "This word already exists in the selected set",
      });
    }

    return res.status(500).json({
      success: false,
      message: error.message || "Failed to create vocabulary word",
    });
  }
};

const createAdminVocabularyWordsBulk = async (req, res) => {
  try {
    const set = await VocabularySet.findById(req.params.id);

    if (!set) {
      return res.status(404).json({
        success: false,
        message: "Vocabulary set not found",
      });
    }

    const mode = String(req.body?.mode || "append").trim().toLowerCase();
    if (!["append", "replace"].includes(mode)) {
      return res.status(400).json({
        success: false,
        message: "mode must be append or replace",
      });
    }

    const itemsInput = req.body?.items;
    if (!Array.isArray(itemsInput)) {
      return res.status(400).json({
        success: false,
        message: "items must be an array",
      });
    }

    if (!itemsInput.length) {
      if (mode === "replace") {
        const removed = await Vocabulary.deleteMany({ setId: set._id });
        return res.status(200).json({
          success: true,
          message: "Bulk replace completed successfully",
          data: {
            insertedCount: 0,
            replacedDeletedCount: removed.deletedCount || 0,
            items: [],
          },
        });
      }

      return res.status(400).json({
        success: false,
        message: "items cannot be empty",
      });
    }

    const normalizedItems = itemsInput.map((item, index) => {
      try {
        return buildVocabularyWordPayload(item);
      } catch (_error) {
        throw new Error(`Item ${index + 1}: word and meaning are required`);
      }
    });

    const duplicatesInPayload = new Set();
    const payloadWordSet = new Set();
    normalizedItems.forEach((item) => {
      if (payloadWordSet.has(item.wordLower)) {
        duplicatesInPayload.add(item.word);
      }
      payloadWordSet.add(item.wordLower);
    });

    if (duplicatesInPayload.size > 0) {
      return res.status(400).json({
        success: false,
        message: `Duplicate words in payload: ${Array.from(duplicatesInPayload).join(", ")}`,
      });
    }

    if (mode === "append") {
      const existed = await Vocabulary.find({
        setId: set._id,
        wordLower: { $in: Array.from(payloadWordSet) },
      })
        .select("word")
        .lean();

      if (existed.length > 0) {
        return res.status(409).json({
          success: false,
          message: `Words already exist in set: ${existed
            .map((item) => item.word)
            .join(", ")}`,
        });
      }
    }

    let replacedDeletedCount = 0;
    if (mode === "replace") {
      const removed = await Vocabulary.deleteMany({ setId: set._id });
      replacedDeletedCount = removed.deletedCount || 0;
    }

    const inserted = await Vocabulary.insertMany(
      normalizedItems.map((item) => ({
        setId: set._id,
        ...item,
      })),
      { ordered: true }
    );

    return res.status(201).json({
      success: true,
      message: mode === "replace"
        ? "Vocabulary words replaced successfully"
        : "Vocabulary words imported successfully",
      data: {
        insertedCount: inserted.length,
        replacedDeletedCount,
        items: inserted.map((item) => serializeVocabularyWord(item.toObject())),
      },
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "This payload contains words that already exist in the selected set",
      });
    }

    return res.status(500).json({
      success: false,
      message: error.message || "Failed to bulk import vocabulary words",
    });
  }
};

const updateAdminVocabularyWord = async (req, res) => {
  try {
    const set = await VocabularySet.findById(req.params.id);

    if (!set) {
      return res.status(404).json({
        success: false,
        message: "Vocabulary set not found",
      });
    }

    const item = await Vocabulary.findOne({
      _id: req.params.wordId,
      setId: set._id,
    });

    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Vocabulary word not found",
      });
    }

    const payload = req.body || {};

    if (payload.word !== undefined) item.word = String(payload.word).trim();
    if (payload.meaning !== undefined) item.meaning = String(payload.meaning).trim();
    if (payload.example !== undefined) item.example = String(payload.example).trim();

    await item.save();

    return res.status(200).json({
      success: true,
      message: "Vocabulary word updated successfully",
      data: serializeVocabularyWord(item.toObject()),
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "This word already exists in the selected set",
      });
    }

    return res.status(500).json({
      success: false,
      message: error.message || "Failed to update vocabulary word",
    });
  }
};

const deleteAdminVocabularyWord = async (req, res) => {
  try {
    const set = await VocabularySet.findById(req.params.id);

    if (!set) {
      return res.status(404).json({
        success: false,
        message: "Vocabulary set not found",
      });
    }

    const item = await Vocabulary.findOneAndDelete({
      _id: req.params.wordId,
      setId: set._id,
    });

    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Vocabulary word not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Vocabulary word deleted successfully",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to delete vocabulary word",
    });
  }
};

export {
  createAdminVocabulary,
  createAdminVocabularyWord,
  createAdminVocabularyWordsBulk,
  deleteAdminVocabulary,
  deleteAdminVocabularyWord,
  getAdminVocabulary,
  getAdminVocabularyById,
  getAdminVocabularyWords,
  updateAdminVocabulary,
  updateAdminVocabularyWord,
};
