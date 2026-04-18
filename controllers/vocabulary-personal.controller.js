import mongoose from "mongoose";

import { Vocabulary, VocabularySet } from "../models/index.js";
import { LEVELS } from "../models/constants.js";
import { parseVocabularyLines } from "../helper/vocabulary-lines-parser.js";
import {
  generateVocabularyLinesFromAi,
  preparePdfTextForAi,
} from "../services/vocabulary-personal-ai.service.js";

const toInt = (v, fallback) => {
  const n = Number.parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) ? n : fallback;
};

const normalizeTrim = (v) => String(v ?? "").trim();

const normalizeFlags = (body) => ({
  include_pronunciation: Boolean(body?.include_pronunciation ?? body?.includePronunciation),
  include_meaning:
    body?.include_meaning === undefined && body?.includeMeaning === undefined
      ? true
      : Boolean(body?.include_meaning ?? body?.includeMeaning),
  include_example: Boolean(body?.include_example ?? body?.includeExample),
});

const ensureAuthUserId = (req) => {
  const userId = req.user?.id;
  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    return null;
  }
  return userId;
};

export const generatePersonalVocabularyFromPrompt = async (req, res) => {
  try {
    const userId = ensureAuthUserId(req);
    if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });

    const b = req.body || {};
    const flags = normalizeFlags(b);
    const number_of_words = Math.min(200, Math.max(1, toInt(b.number_of_words, 30)));
    const input = {
      title: normalizeTrim(b.title) || "Personal vocabulary",
      topic: normalizeTrim(b.topic) || "general",
      level: LEVELS.includes(b.level) ? b.level : "A1",
      number_of_words,
      ...flags,
      additional_instruction: normalizeTrim(b.additional_instruction),
    };

    const { rawText, model } = await generateVocabularyLinesFromAi("prompt", input);
    const parsed = parseVocabularyLines(rawText, {
      includePronunciation: flags.include_pronunciation,
      includeMeaning: flags.include_meaning,
      includeExample: flags.include_example,
    });

    return res.status(200).json({
      success: true,
      data: { rawText, model, ...parsed },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "AI generation failed",
    });
  }
};

export const generatePersonalVocabularyFromPdf = async (req, res) => {
  try {
    const userId = ensureAuthUserId(req);
    if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });

    if (!req.file?.buffer) {
      return res.status(400).json({ success: false, message: "file_pdf is required" });
    }

    const b = req.body || {};
    const flags = normalizeFlags(b);
    const number_of_words = Math.min(200, Math.max(1, toInt(b.number_of_words, 30)));

    const { text: pdfText, truncated } = await preparePdfTextForAi(req.file.buffer);

    const input = {
      title: normalizeTrim(b.title) || "Personal vocabulary (PDF)",
      topic: normalizeTrim(b.topic) || "general",
      level: LEVELS.includes(b.level) ? b.level : "A1",
      number_of_words,
      ...flags,
      additional_instruction: normalizeTrim(b.additional_instruction),
      pdfText,
    };

    const { rawText, model } = await generateVocabularyLinesFromAi("pdf", input);
    const parsed = parseVocabularyLines(rawText, {
      includePronunciation: flags.include_pronunciation,
      includeMeaning: flags.include_meaning,
      includeExample: flags.include_example,
    });

    return res.status(200).json({
      success: true,
      data: { rawText, model, pdfTruncated: truncated, ...parsed },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "AI generation failed",
    });
  }
};

export const createPersonalVocabularySetManual = async (req, res) => {
  try {
    const userId = ensureAuthUserId(req);
    if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });

    const b = req.body || {};
    const name = normalizeTrim(b.title ?? b.name);
    if (!name) {
      return res.status(400).json({ success: false, message: "title is required" });
    }

    const flags = normalizeFlags(b);
    const rawText = String(b.rawText ?? b.text ?? "").trim();
    if (!rawText) {
      return res.status(400).json({ success: false, message: "rawText is required" });
    }

    const { items, errors } = parseVocabularyLines(rawText, {
      includePronunciation: flags.include_pronunciation,
      includeMeaning: flags.include_meaning,
      includeExample: flags.include_example,
    });
    if (errors.length > 0) {
      return res.status(400).json({ success: false, message: "Parse failed", data: { errors } });
    }
    if (items.length === 0) {
      return res.status(400).json({ success: false, message: "No vocabulary items found" });
    }

    const level = LEVELS.includes(b.level) ? b.level : "A1";
    const topic = normalizeTrim(b.topic) || "general";
    const description = normalizeTrim(b.description);

    const set = await VocabularySet.create({
      name,
      description,
      level,
      topic,
      coverImageUrl: "",
      isActive: true,
      sortOrder: 0,
      ownerId: userId,
      source: "manual",
      aiMeta: {
        topic,
        additionalInstruction: normalizeTrim(b.additional_instruction),
        includePronunciation: flags.include_pronunciation,
        includeMeaning: flags.include_meaning,
        includeExample: flags.include_example,
      },
    });

    const docs = items.map((row) => ({
      setId: set._id,
      word: normalizeTrim(row.word),
      meaning: normalizeTrim(row.meaning),
      phonetic: normalizeTrim(row.pronunciation),
      example: normalizeTrim(row.example),
    }));

    await Vocabulary.insertMany(docs, { ordered: false });

    return res.status(201).json({
      success: true,
      data: { id: String(set._id) },
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Duplicate word found in set",
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to create personal vocabulary set",
    });
  }
};

export const createPersonalVocabularySetFromAi = async (req, res) => {
  try {
    const userId = ensureAuthUserId(req);
    if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });

    const b = req.body || {};
    const name = normalizeTrim(b.title ?? b.name);
    if (!name) {
      return res.status(400).json({ success: false, message: "title is required" });
    }

    const flags = normalizeFlags(b);
    const items = Array.isArray(b.items) ? b.items : [];
    if (items.length === 0) {
      return res.status(400).json({ success: false, message: "items is required" });
    }

    const level = LEVELS.includes(b.level) ? b.level : "A1";
    const topic = normalizeTrim(b.topic) || "general";
    const description = normalizeTrim(b.description);
    const source = b.source === "ai_pdf" ? "ai_pdf" : "ai_prompt";

    const set = await VocabularySet.create({
      name,
      description,
      level,
      topic,
      coverImageUrl: "",
      isActive: true,
      sortOrder: 0,
      ownerId: userId,
      source,
      aiMeta: {
        topic,
        additionalInstruction: normalizeTrim(b.additional_instruction),
        includePronunciation: flags.include_pronunciation,
        includeMeaning: flags.include_meaning,
        includeExample: flags.include_example,
      },
    });

    const docs = items.map((row) => ({
      setId: set._id,
      word: normalizeTrim(row.word),
      meaning: normalizeTrim(row.meaning),
      phonetic: normalizeTrim(row.pronunciation ?? row.phonetic),
      example: normalizeTrim(row.example),
    }));

    await Vocabulary.insertMany(docs, { ordered: false });

    return res.status(201).json({
      success: true,
      data: { id: String(set._id) },
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Duplicate word found in set",
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to create personal vocabulary set",
    });
  }
};

export const updatePersonalVocabularySet = async (req, res) => {
  try {
    const userId = ensureAuthUserId(req);
    if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid id" });
    }

    const set = await VocabularySet.findById(id);
    if (!set) return res.status(404).json({ success: false, message: "Vocabulary set not found" });
    if (!set.ownerId || String(set.ownerId) !== String(userId)) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    const b = req.body || {};
    if (b.title !== undefined || b.name !== undefined) set.name = normalizeTrim(b.title ?? b.name);
    if (b.description !== undefined) set.description = normalizeTrim(b.description);
    if (b.level !== undefined && LEVELS.includes(b.level)) set.level = b.level;
    if (b.topic !== undefined) set.topic = normalizeTrim(b.topic) || "general";

    await set.save();

    if (Array.isArray(b.words)) {
      // Replace all words for simplicity (personal sets only).
      await Vocabulary.deleteMany({ setId: set._id });
      const docs = b.words.map((row) => ({
        setId: set._id,
        word: normalizeTrim(row.word),
        meaning: normalizeTrim(row.meaning),
        phonetic: normalizeTrim(row.pronunciation ?? row.phonetic),
        example: normalizeTrim(row.example),
      }));
      await Vocabulary.insertMany(docs, { ordered: false });
    }

    return res.status(200).json({ success: true, data: { id: String(set._id) } });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || "Failed to update set" });
  }
};

export const deletePersonalVocabularySet = async (req, res) => {
  try {
    const userId = ensureAuthUserId(req);
    if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid id" });
    }

    const set = await VocabularySet.findById(id);
    if (!set) return res.status(404).json({ success: false, message: "Vocabulary set not found" });
    if (!set.ownerId || String(set.ownerId) !== String(userId)) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    await Vocabulary.deleteMany({ setId: set._id });
    await VocabularySet.deleteOne({ _id: set._id });

    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || "Failed to delete set" });
  }
};

