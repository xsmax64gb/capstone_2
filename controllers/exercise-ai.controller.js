import mongoose from "mongoose";

import { Exercise } from "../models/index.js";
import { LEVELS } from "../models/constants.js";
import {
  generateAndParseMcq,
  preparePdfTextForAi,
} from "../services/exercise-ai.service.js";

const toInt = (v, fallback) => {
  const n = Number.parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) ? n : fallback;
};

const normalizeIncomingQuestions = (raw) => {
  if (!Array.isArray(raw)) {
    throw new Error("questions must be an array");
  }
  return raw.map((q, index) => {
    const options = Array.isArray(q?.options) ? q.options.map((o) => String(o).trim()) : [];
    if (options.length !== 4) {
      throw new Error(`Question ${index + 1}: need exactly 4 options`);
    }
    let correctIndex = toInt(q?.correctIndex, -1);
    if (correctIndex < 0 || correctIndex > 3) {
      correctIndex = toInt(q?.correctAnswer, 0);
    }
    if (correctIndex < 0 || correctIndex > 3) {
      throw new Error(`Question ${index + 1}: invalid correctIndex`);
    }
    return {
      prompt: String(q?.prompt ?? q?.question ?? "").trim(),
      question: "",
      options,
      correctIndex,
      correctAnswer: correctIndex,
      explanation: String(q?.explanation ?? "").trim(),
      score: Math.max(1, toInt(q?.score, 1)),
    };
  });
};

const readAiMeta = (body) => ({
  grammarFocus: String(body?.grammar_focus ?? body?.grammarFocus ?? "").trim(),
  vocabularyFocus: String(body?.vocabulary_focus ?? body?.vocabularyFocus ?? "").trim(),
  difficulty: String(body?.difficulty ?? "").trim(),
  context: String(body?.context ?? "").trim(),
  additionalInstruction: String(
    body?.additional_instruction ?? body?.additionalInstruction ?? ""
  ).trim(),
});

export const generateExerciseAiFromPrompt = async (req, res) => {
  try {
    const b = req.body || {};
    const number_of_questions = Math.min(50, Math.max(1, toInt(b.number_of_questions, 10)));

    const fields = {
      title: String(b.title ?? "").trim() || "Custom exercise",
      description: String(b.description ?? "").trim(),
      topic: String(b.topic ?? "general").trim(),
      level: LEVELS.includes(b.level) ? b.level : "A1",
      number_of_questions,
      grammar_focus: String(b.grammar_focus ?? "").trim(),
      vocabulary_focus: String(b.vocabulary_focus ?? "").trim(),
      difficulty: String(b.difficulty ?? "medium").trim(),
      additional_instruction: String(b.additional_instruction ?? "").trim(),
      context: String(b.context ?? "").trim(),
    };

    const data = await generateAndParseMcq("prompt", fields);

    return res.status(200).json({
      success: true,
      message: "AI generation finished",
      data,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "AI generation failed",
    });
  }
};

export const generateExerciseAiFromPdf = async (req, res) => {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({
        success: false,
        message: "file_pdf is required",
      });
    }

    const b = req.body || {};
    const { pdfText, truncated } = await preparePdfTextForAi(req.file.buffer);
    const number_of_questions = Math.min(50, Math.max(1, toInt(b.number_of_questions, 10)));

    const fields = {
      title: String(b.title ?? "").trim() || "Exercise from PDF",
      description: String(b.description ?? "").trim(),
      topic: String(b.topic ?? "general").trim(),
      level: LEVELS.includes(b.level) ? b.level : "A1",
      number_of_questions,
      grammar_focus: String(b.grammar_focus ?? "").trim(),
      vocabulary_focus: String(b.vocabulary_focus ?? "").trim(),
      difficulty: String(b.difficulty ?? "medium").trim(),
      additional_instruction: String(b.additional_instruction ?? "").trim(),
      context: "",
      pdfText,
    };

    const data = await generateAndParseMcq("pdf", fields);

    return res.status(200).json({
      success: true,
      message: "AI generation finished",
      data: {
        ...data,
        pdfTruncated: truncated,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "AI generation failed",
    });
  }
};

export const createUserAiExercise = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const b = req.body || {};
    const source = b.source === "ai_pdf" ? "ai_pdf" : "ai_prompt";
    const title = String(b.title ?? "").trim();
    if (!title) {
      return res.status(400).json({ success: false, message: "title is required" });
    }

    const level = LEVELS.includes(b.level) ? b.level : "A1";
    const topic = String(b.topic ?? "general").trim() || "general";
    const description = String(b.description ?? "").trim();

    let questions;
    try {
      questions = normalizeIncomingQuestions(b.questions);
    } catch (err) {
      return res.status(400).json({ success: false, message: err.message });
    }

    if (questions.length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one question is required",
      });
    }

    const durationMinutes = Math.max(
      6,
      Math.round(questions.length * 1.8)
    );

    const skills = [topic, readAiMeta(b).grammarFocus].filter(Boolean);

    const doc = await Exercise.create({
      title,
      description,
      type: "mcq",
      level,
      topic,
      coverImage: "",
      skills,
      durationMinutes,
      rewardsXp: 0,
      rewards: { exp: 0 },
      questions,
      ownerId: userId,
      source,
      aiMeta: readAiMeta(b),
    });

    return res.status(201).json({
      success: true,
      message: "Exercise created",
      data: { id: String(doc._id) },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to save exercise",
    });
  }
};

export const updateUserAiExercise = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid id" });
    }

    const exercise = await Exercise.findById(id);
    if (!exercise) {
      return res.status(404).json({ success: false, message: "Exercise not found" });
    }

    if (!exercise.ownerId || String(exercise.ownerId) !== String(userId)) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    const b = req.body || {};

    if (b.title !== undefined) exercise.title = String(b.title).trim();
    if (b.description !== undefined) exercise.description = String(b.description).trim();
    if (b.level !== undefined && LEVELS.includes(b.level)) exercise.level = b.level;
    if (b.topic !== undefined) exercise.topic = String(b.topic).trim() || "general";

    if (b.grammar_focus !== undefined || b.grammarFocus !== undefined) {
      exercise.aiMeta = exercise.aiMeta || {};
      exercise.aiMeta.grammarFocus = String(b.grammar_focus ?? b.grammarFocus ?? "").trim();
    }
    if (b.vocabulary_focus !== undefined || b.vocabularyFocus !== undefined) {
      exercise.aiMeta = exercise.aiMeta || {};
      exercise.aiMeta.vocabularyFocus = String(b.vocabulary_focus ?? b.vocabularyFocus ?? "").trim();
    }
    if (b.difficulty !== undefined) {
      exercise.aiMeta = exercise.aiMeta || {};
      exercise.aiMeta.difficulty = String(b.difficulty).trim();
    }
    if (b.context !== undefined) {
      exercise.aiMeta = exercise.aiMeta || {};
      exercise.aiMeta.context = String(b.context).trim();
    }
    if (b.additional_instruction !== undefined || b.additionalInstruction !== undefined) {
      exercise.aiMeta = exercise.aiMeta || {};
      exercise.aiMeta.additionalInstruction = String(
        b.additional_instruction ?? b.additionalInstruction ?? ""
      ).trim();
    }

    if (b.questions !== undefined) {
      try {
        exercise.questions = normalizeIncomingQuestions(b.questions);
      } catch (err) {
        return res.status(400).json({ success: false, message: err.message });
      }
    }

    await exercise.save();

    return res.status(200).json({
      success: true,
      message: "Exercise updated",
      data: { id: String(exercise._id) },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to update exercise",
    });
  }
};

export const deleteUserAiExercise = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid id" });
    }

    const exercise = await Exercise.findById(id);
    if (!exercise) {
      return res.status(404).json({ success: false, message: "Exercise not found" });
    }

    if (!exercise.ownerId || String(exercise.ownerId) !== String(userId)) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    await Exercise.findByIdAndDelete(id);

    return res.status(200).json({
      success: true,
      message: "Exercise deleted",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to delete exercise",
    });
  }
};
