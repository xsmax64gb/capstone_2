import { uploadImageFile } from "../helper/upload.helper.js";
import { AiLevel } from "../models/index.js";

const toIsoDate = (value) => {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
};

const parseStructuredArray = (value, fieldName) => {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    if (!trimmed) {
      return [];
    }

    try {
      const parsed = JSON.parse(trimmed);

      if (Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      throw new Error(`${fieldName} must be a valid JSON array`);
    }
  }

  if (value === undefined || value === null || value === "") {
    return [];
  }

  throw new Error(`${fieldName} must be an array`);
};

const serializeAiLevel = (item) => ({
  id: String(item._id),
  level: item.level,
  title: item.title,
  description: item.description || "",
  minPlacementLevel: item.unlockRequirement?.minPlacementLevel || item.level,
  isActive: Boolean(item.isActive),
  stageCount: Array.isArray(item.stages) ? item.stages.length : 0,
  stages: Array.isArray(item.stages)
    ? item.stages.map((stage) => ({
        stageId: stage.stageId,
        name: stage.name,
        order: stage.order,
        type: stage.type,
        context: stage.context,
        aiRole: stage.aiRole,
        objective: stage.objective,
        systemPrompt: stage.systemPrompt,
        suggestedVocabulary: Array.isArray(stage.suggestedVocabulary)
          ? stage.suggestedVocabulary
          : [],
        passRules: {
          minScore: stage.passRules?.minScore ?? 60,
          minTurns: stage.passRules?.minTurns ?? 4,
        },
        rewards: {
          exp: stage.rewards?.exp ?? 0,
          unlockNextLevel: stage.rewards?.unlockNextLevel ?? null,
        },
      }))
    : [],
  createdAt: toIsoDate(item.createdAt),
  updatedAt: toIsoDate(item.updatedAt),
});

const getAdminAiLevels = async (_req, res) => {
  try {
    const items = await AiLevel.find({})
      .sort({ updatedAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      message: "Admin AI levels fetched successfully",
      data: {
        items: items.map(serializeAiLevel),
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch AI levels",
    });
  }
};

const createAdminAiLevel = async (req, res) => {
  try {
    const {
      level,
      title,
      description = "",
      minPlacementLevel,
      isActive = true,
      stages = [],
    } = req.body;

    if (!level || !title || !minPlacementLevel) {
      return res.status(400).json({
        success: false,
        message: "level, title, and minPlacementLevel are required",
      });
    }

    const item = await AiLevel.create({
      level,
      title: String(title).trim(),
      description: String(description).trim(),
      unlockRequirement: {
        minPlacementLevel,
      },
      isActive: Boolean(isActive),
      stages: parseStructuredArray(stages, "stages"),
    });

    return res.status(201).json({
      success: true,
      message: "AI level created successfully",
      data: serializeAiLevel(item.toObject()),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to create AI level",
    });
  }
};

const updateAdminAiLevel = async (req, res) => {
  try {
    const item = await AiLevel.findById(req.params.id);

    if (!item) {
      return res.status(404).json({
        success: false,
        message: "AI level not found",
      });
    }

    const payload = req.body || {};

    if (payload.level !== undefined) item.level = payload.level;
    if (payload.title !== undefined) item.title = String(payload.title).trim();
    if (payload.description !== undefined) item.description = String(payload.description).trim();
    if (payload.minPlacementLevel !== undefined) {
      item.unlockRequirement = {
        ...item.unlockRequirement,
        minPlacementLevel: payload.minPlacementLevel,
      };
    }
    if (payload.isActive !== undefined) item.isActive = Boolean(payload.isActive);
    if (payload.stages !== undefined) {
      item.stages = parseStructuredArray(payload.stages, "stages");
    }

    await item.save();

    return res.status(200).json({
      success: true,
      message: "AI level updated successfully",
      data: serializeAiLevel(item.toObject()),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to update AI level",
    });
  }
};

const deleteAdminAiLevel = async (req, res) => {
  try {
    const item = await AiLevel.findByIdAndDelete(req.params.id);

    if (!item) {
      return res.status(404).json({
        success: false,
        message: "AI level not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "AI level deleted successfully",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to delete AI level",
    });
  }
};

const uploadAdminImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Image file is required",
      });
    }

    const uploadResult = await uploadImageFile(req.file, {
      folder: req.body?.folder,
      publicId: req.body?.publicId,
      tags: ["admin-upload"],
    });

    return res.status(201).json({
      success: true,
      message: "Image uploaded successfully",
      data: uploadResult,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to upload image",
    });
  }
};

export {
  createAdminAiLevel,
  deleteAdminAiLevel,
  getAdminAiLevels,
  updateAdminAiLevel,
  uploadAdminImage,
};
