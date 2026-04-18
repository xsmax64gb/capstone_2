import mongoose from "mongoose";

import { uploadImageFile } from "../helper/upload.helper.js";
import { Vocabulary, VocabularySet, VocabularyAttempt, User } from "../models/index.js";

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

// ─── User-facing endpoints ────────────────────────────────────────────────────

const DEFAULT_COVER_IMAGES = {
  "daily-life": "https://images.unsplash.com/photo-1484480974693-6ca0a78fb36b?w=800&q=80",
  work: "https://images.unsplash.com/photo-1497366216548-37526070297c?w=800&q=80",
  travel: "https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=800&q=80",
  technology: "https://images.unsplash.com/photo-1518770660439-4636190af475?w=800&q=80",
  general: "https://images.unsplash.com/photo-1546410531-bb4caa6b424d?w=800&q=80",
};

const normalizeWordForUser = (word) => ({
  id: String(word._id),
  word: word.word,
  phonetic: "",
  meaning: word.meaning,
  example: word.example || "",
  partOfSpeech: "word",
  synonyms: [],
  antonyms: [],
});

const normalizeVocabularySetForUser = (set, words = []) => ({
  id: String(set._id),
  title: set.name,
  description: set.description || "",
  level: set.level,
  topic: set.topic || "general",
  coverImage: set.coverImageUrl || DEFAULT_COVER_IMAGES[set.topic] || DEFAULT_COVER_IMAGES.general,
  wordCount: words.length,
  durationMinutes: Math.max(5, Math.round(words.length * 0.8)),
  rewardsXp: Math.round(words.length * 2),
  words: words.map(normalizeWordForUser),
});

const generateFlashcards = (words) => {
  return words.map((word) => [
    { id: `${word._id}-fc-1`, front: word.word, back: word.meaning },
    { id: `${word._id}-fc-2`, front: `What does "${word.word}" mean?`, back: word.meaning },
    ...(word.example ? [{ id: `${word._id}-fc-3`, front: word.example, back: word.word }] : []),
  ]).flat();
};

const generateQuizQuestions = (words) => {
  if (words.length < 2) return [];
  return words.slice(0, 10).map((word, index) => {
    const otherMeanings = words
      .filter((w) => w._id.toString() !== word._id.toString())
      .map((w) => w.meaning)
      .slice(0, 3);

    while (otherMeanings.length < 3) {
      otherMeanings.push("Không có trong danh sách");
    }

    const options = [word.meaning, ...otherMeanings].sort(() => Math.random() - 0.5);
    const correctIndex = options.indexOf(word.meaning);

    return {
      id: `${word._id}-q-${index + 1}`,
      prompt: `What does "${word.word}" mean?`,
      options,
      correctIndex: correctIndex >= 0 ? correctIndex : 0,
      explanation: `The word "${word.word}" means "${word.meaning}".${word.example ? ` Example: ${word.example}` : ""}`,
    };
  });
};

const listVocabularies = async (req, res) => {
  try {
    const {
      query: rawQuery,
      level,
      topic,
      page = "1",
      limit = "20",
    } = req.query || {};

    const q = typeof rawQuery === "string" ? rawQuery.trim().toLowerCase() : "";
    const skip = (Math.max(1, parseInt(page, 10)) - 1) * Math.max(1, parseInt(limit, 10));
    const take = Math.max(1, Math.min(100, parseInt(limit, 10)));

    const filter = { isActive: true };
    if (level) filter.level = String(level);
    if (topic) filter.topic = String(topic);

    const total = await VocabularySet.countDocuments(filter);
    const sets = await VocabularySet.find(filter)
      .sort({ sortOrder: 1, updatedAt: -1 })
      .skip(skip)
      .limit(take)
      .lean();

    const wordsMap = await getWordsMapBySetIds(sets.map((s) => s._id));

    const items = sets.map((set) => {
      const words = wordsMap.get(String(set._id)) || [];
      const normalized = normalizeVocabularySetForUser(set, words);
      if (q) {
        const matchWord = words.some(
          (w) =>
            w.word.toLowerCase().includes(q) ||
            w.meaning.toLowerCase().includes(q) ||
            (w.example || "").toLowerCase().includes(q)
        );
        if (!matchWord && !set.name.toLowerCase().includes(q)) return null;
      }
      return normalized;
    }).filter(Boolean);

    return res.status(200).json({
      success: true,
      data: {
        items,
        pagination: {
          page: parseInt(page, 10),
          limit: take,
          total,
          totalPages: Math.ceil(total / take),
        },
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to list vocabularies",
    });
  }
};

const getVocabularySummary = async (_req, res) => {
  try {
    const { VocabularySet: VS, Vocabulary: V, VocabularyAttempt: VA } = mongoose.models;

    const totalSets = await VS.countDocuments({ isActive: true });
    const totalWords = await V.countDocuments();

    const sets = await VS.find({ isActive: true }).select("_id").lean();
    const setIds = sets.map((s) => s._id);

    const masteredCount = setIds.length;
    const learningCount = Math.max(0, totalWords - masteredCount);

    return res.status(200).json({
      success: true,
      data: {
        totalSets,
        totalWords,
        masteredCount,
        learningCount,
        newCount: 0,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to get vocabulary summary",
    });
  }
};

const getRecommendedVocabularies = async (req, res) => {
  try {
    const userId = req.user?.id;

    // Get user's current level
    const user = await User.findById(userId).lean();
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const userLevel = user.currentLevel || "A1";
    const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];
    const currentLevelIndex = LEVELS.indexOf(userLevel);

    // Get vocabulary sets at user's level + 1 level above
    const targetLevels = [
      userLevel,
      currentLevelIndex < LEVELS.length - 1 ? LEVELS[currentLevelIndex + 1] : userLevel
    ];

    // Get user's recent attempts (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recentAttempts = await VocabularyAttempt.find({
      userId: new mongoose.Types.ObjectId(userId),
      submittedAt: { $gte: thirtyDaysAgo }
    }).lean();

    // Create a map of setId -> best score for easy lookup
    const attemptMap = new Map();
    recentAttempts.forEach((attempt) => {
      const setIdStr = String(attempt.setId);
      if (!attemptMap.has(setIdStr)) {
        attemptMap.set(setIdStr, attempt.percent);
      } else {
        // Keep the best score
        attemptMap.set(setIdStr, Math.max(attemptMap.get(setIdStr), attempt.percent));
      }
    });

    // Get all vocabulary sets at target levels
    const allSets = await VocabularySet.find({
      isActive: true,
      level: { $in: targetLevels }
    })
      .sort({ sortOrder: 1, updatedAt: -1 })
      .lean();

    // Prioritize sets:
    // 1. Sets with recent attempts but score < 80% (not mastered)
    // 2. Sets not attempted yet
    const unmasteredSets = [];
    const newSets = [];

    allSets.forEach((set) => {
      const setIdStr = String(set._id);
      const bestScore = attemptMap.get(setIdStr);

      if (bestScore !== undefined && bestScore < 80) {
        // Unmastered set - prioritize this
        unmasteredSets.push({
          ...set,
          score: bestScore,
          lastAttemptTime: recentAttempts.find(a => String(a.setId) === setIdStr)?.submittedAt
        });
      } else if (bestScore === undefined) {
        // Not attempted yet
        newSets.push(set);
      }
      // Skip mastered sets (score >= 80%)
    });

    // Sort unmastered by most recent attempt
    unmasteredSets.sort((a, b) =>
      new Date(b.lastAttemptTime) - new Date(a.lastAttemptTime)
    );

    // Combine: unmastered + new sets, limit to 6
    const recommendedSetIds = [
      ...unmasteredSets.slice(0, 3).map(s => s._id),
      ...newSets.slice(0, 3).map(s => s._id)
    ];

    const recommendedSets = allSets.filter(s =>
      recommendedSetIds.includes(s._id)
    );

    // If we don't have enough recommendations, add more from the full list
    if (recommendedSets.length < 6) {
      const additionalSets = allSets
        .filter(s => !recommendedSetIds.includes(s._id))
        .slice(0, 6 - recommendedSets.length);
      recommendedSets.push(...additionalSets);
    }

    const wordsMap = await getWordsMapBySetIds(
      recommendedSets.map((s) => s._id)
    );
    const items = recommendedSets.map((set) =>
      normalizeVocabularySetForUser(set, wordsMap.get(String(set._id)) || [])
    );

    return res.status(200).json({
      success: true,
      data: items,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to get recommended vocabularies",
    });
  }
};

const getVocabularyById = async (req, res) => {
  try {
    const set = await VocabularySet.findById(req.params.id).lean();

    if (!set || !set.isActive) {
      return res.status(404).json({
        success: false,
        message: "Vocabulary set not found",
      });
    }

    const words = await Vocabulary.find({ setId: set._id }).lean();

    const relatedSets = await VocabularySet.find({
      isActive: true,
      _id: { $ne: set._id },
      topic: set.topic,
    })
      .limit(3)
      .lean();

    const relatedWordsMap = await getWordsMapBySetIds(relatedSets.map((s) => s._id));
    const related = relatedSets.map((s) =>
      normalizeVocabularySetForUser(s, relatedWordsMap.get(String(s._id)) || [])
    );

    return res.status(200).json({
      success: true,
      data: {
        vocabulary: normalizeVocabularySetForUser(set, words),
        related,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to get vocabulary",
    });
  }
};

const getVocabularyHints = async (req, res) => {
  try {
    const set = await VocabularySet.findById(req.params.id).lean();

    if (!set) {
      return res.status(404).json({
        success: false,
        message: "Vocabulary set not found",
      });
    }

    const personalized = [
      `Focus on the "${set.topic}" topic words — they're used frequently in real contexts.`,
      `Try flashcards first for active recall, then switch to quiz mode.`,
      `Review 5 words at a time, then test yourself before adding more.`,
      `Use the example sentences to understand how each word is used naturally.`,
    ];

    const strategies = [
      "Read each word aloud 3 times to reinforce memory.",
      "Write your own sentence using each new word.",
      "Group words by topic to create mental connections.",
      "Test yourself after 10 minutes, then again after 1 day.",
    ];

    return res.status(200).json({
      success: true,
      data: {
        vocabularyId: String(set._id),
        title: set.name,
        personalized,
        strategies,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to get hints",
    });
  }
};

const getVocabularyLeaderboard = async (req, res) => {
  try {
    const { VocabularyAttempt: VA } = mongoose.models;

    const topAttempts = await VA.aggregate([
      { $match: { setId: new mongoose.Types.ObjectId(req.params.id) } },
      { $sort: { score: -1, durationSec: 1 } },
      { $limit: 20 },
      {
        $project: {
          _id: 0,
          userId: 1,
          userName: 1,
          score: 1,
          durationSec: 1,
        },
      },
    ]);

    const leaderboard = topAttempts.map((item, index) => ({
      rank: index + 1,
      name: item.userName || "Anonymous",
      score: item.score,
      durationSec: item.durationSec || 0,
    }));

    return res.status(200).json({
      success: true,
      data: {
        vocabularyId: req.params.id,
        wordCount: 0,
        leaderboard,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to get leaderboard",
    });
  }
};

const getVocabularyHistory = async (req, res) => {
  try {
    const { VocabularyAttempt: VA } = mongoose.models;
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const limit = Math.max(1, Math.min(50, parseInt(req.query?.limit || "20", 10)));

    const attempts = await VA.find({ userId: new mongoose.Types.ObjectId(userId) })
      .sort({ submittedAt: -1 })
      .limit(limit)
      .lean();

    const history = await Promise.all(
      attempts.map(async (attempt) => {
        const set = await VocabularySet.findById(attempt.setId).lean();
        return {
          attemptId: String(attempt._id),
          setId: String(attempt.setId),
          setName: set?.name || "Unknown Set",
          submittedAt: toIsoDate(attempt.submittedAt),
          score: attempt.score,
          total: attempt.total,
          durationSec: attempt.durationSec || 0,
          mode: attempt.mode,
        };
      })
    );

    return res.status(200).json({
      success: true,
      data: history,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to get vocabulary history",
    });
  }
};

const normalizeVocabMeaning = (value) =>
  String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();

const submitVocabularyAttempt = async (req, res) => {
  try {
    const { VocabularyAttempt: VA, VocabularySet: VS } = mongoose.models;
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const {
      mode,
      answers = [],
      durationSec = 0,
      wordIds = [],
      selectedLabels = [],
    } = req.body || {};

    if (!["flashcards", "quiz"].includes(mode)) {
      return res.status(400).json({
        success: false,
        message: "mode must be flashcards or quiz",
      });
    }

    const set = await VS.findById(req.params.id).lean();
    if (!set) {
      return res.status(404).json({
        success: false,
        message: "Vocabulary set not found",
      });
    }

    const words = await Vocabulary.find({ setId: set._id }).lean();
    let score = 0;
    let total = 0;

    if (mode === "flashcards") {
      total = words.length;
      score = answers.filter((a) => a && a.correct).length;
    } else {
      const labels = Array.isArray(selectedLabels) ? selectedLabels : [];
      const rows = wordIds.map((wordId, i) => {
        const word = words.find((w) => String(w._id) === String(wordId));
        const selectedIdx = answers[i];
        const rawLabel = labels[i];
        const selectedText =
          rawLabel !== undefined && rawLabel !== null && rawLabel !== ""
            ? String(rawLabel)
            : "";
        const meaningNorm = word ? normalizeVocabMeaning(word.meaning) : "";
        const selectedNorm = normalizeVocabMeaning(selectedText);
        const correct =
          Boolean(word) &&
          selectedText.length > 0 &&
          meaningNorm.length > 0 &&
          selectedNorm === meaningNorm;

        return {
          wordId: new mongoose.Types.ObjectId(wordId),
          selectedIndex: selectedIdx ?? null,
          selectedText,
          correct,
        };
      });

      total = Math.max(rows.length, 1);
      score = rows.filter((r) => r.correct).length;

      const percent = Math.round((score / total) * 100);
      const earnedXp = Math.round(score * 2);
      const resultLabel =
        percent >= 90 ? "Excellent!" :
          percent >= 70 ? "Good job!" :
            percent >= 50 ? "Keep going!" :
              "Needs more practice";

      const attempt = await VA.create({
        setId: set._id,
        userId: new mongoose.Types.ObjectId(userId),
        userName: req.user?.name || "",
        mode,
        answers: rows,
        score,
        total,
        percent,
        durationSec: Math.max(0, parseInt(durationSec, 10) || 0),
        earnedXp,
      });

      return res.status(201).json({
        success: true,
        data: {
          attemptId: String(attempt._id),
          score,
          total,
          percent,
          time: attempt.durationSec,
          earnedXp,
          resultLabel,
          answers,
        },
      });
    }

    const percent = total > 0 ? Math.round((score / total) * 100) : 0;
    const earnedXp = Math.round(score * 2);
    const resultLabel =
      percent >= 90 ? "Excellent!" :
        percent >= 70 ? "Good job!" :
          percent >= 50 ? "Keep going!" :
            "Needs more practice";

    const attempt = await VA.create({
      setId: set._id,
      userId: new mongoose.Types.ObjectId(userId),
      userName: req.user?.name || "",
      mode,
      answers: answers.map((a, i) => {
        const rawWordId = wordIds[i] ?? words[i]?._id;
        return {
          wordId: new mongoose.Types.ObjectId(rawWordId),
          selectedIndex: null,
          selectedText: "",
          correct: !!(a && a.correct),
        };
      }),
      score,
      total,
      percent,
      durationSec: Math.max(0, parseInt(durationSec, 10) || 0),
      earnedXp,
    });

    return res.status(201).json({
      success: true,
      data: {
        attemptId: String(attempt._id),
        score,
        total,
        percent,
        time: attempt.durationSec,
        earnedXp,
        resultLabel,
        answers,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to submit vocabulary attempt",
    });
  }
};

const getVocabularyReview = async (req, res) => {
  try {
    const { VocabularyAttempt: VA } = mongoose.models;
    const { answers: rawAnswers } = req.query || {};
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const set = await VocabularySet.findById(req.params.id).lean();
    if (!set) {
      return res.status(404).json({
        success: false,
        message: "Vocabulary set not found",
      });
    }

    const words = await Vocabulary.find({ setId: set._id }).lean();

    let userAnswers = [];
    if (typeof rawAnswers === "string" && rawAnswers) {
      try {
        userAnswers = JSON.parse(rawAnswers);
      } catch {
        userAnswers = [];
      }
    }

    const review = words.map((word, index) => {
      const selectedIndex = userAnswers[index] ?? -1;
      const correctIndex = 0;
      const options = [word.meaning, ...words.filter((w) => w._id.toString() !== word._id.toString()).map((w) => w.meaning).slice(0, 3)];
      while (options.length < 4) options.push("Không có trong danh sách");
      options.length = 4;

      return {
        wordId: String(word._id),
        word: word.word,
        prompt: `What does "${word.word}" mean?`,
        options,
        selectedIndex,
        selectedText: selectedIndex >= 0 && selectedIndex < options.length ? options[selectedIndex] : null,
        correctIndex,
        correctText: options[correctIndex] || word.meaning,
        isCorrect: selectedIndex === correctIndex,
        explanation: word.example ? `Example: ${word.example}` : "",
      };
    });

    return res.status(200).json({
      success: true,
      data: {
        vocabularyId: String(set._id),
        review,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to get vocabulary review",
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
  // user-facing
  listVocabularies,
  getVocabularySummary,
  getRecommendedVocabularies,
  getVocabularyById,
  getVocabularyHints,
  getVocabularyLeaderboard,
  getVocabularyHistory,
  submitVocabularyAttempt,
  getVocabularyReview,
};
