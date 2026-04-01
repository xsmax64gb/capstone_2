import mongoose from "mongoose";

import {
  LearnAchievement,
  LearnConversation,
  LearnMessage,
  Map as LearnMap,
  Step,
  UserMapProgress,
} from "../models/index.js";
import { listUserAchievements } from "../services/learn-achievement.service.js";
import {
  endConversation,
  evaluateLearnMessage,
  getBossBattleForConversation,
  sendLearnMessage,
  sendLearnMessageQuick,
  startConversation,
} from "../services/learn-conversation.service.js";
import {
  ensureUserMapProgress,
  listStepsForMap,
  recalculateMapTotalXP,
} from "../services/learn-map-progress.service.js";
import {
  generateLearnMapDraft,
  generateLearnStepDraft,
} from "../services/learn-openai.service.js";
import {
  LEARN_MAP_SORT,
  DEFAULT_LEARN_SCORING_DIFFICULTY,
  getMapRequiredXP,
  getStepMinimumPassScore,
  normalizeLearnMapLevel,
  normalizeLearnScoringDifficulty,
  normalizePositiveInt,
} from "../helper/learn-rules.js";

const toId = (x) => String(x?._id ?? x);

const serializeStep = (s, redacted = false) => {
  const base = {
    id: toId(s),
    mapId: String(s.mapId),
    order: s.order,
    title: s.title,
    type: s.type,
  };
  if (redacted) return base;
  return {
    ...base,
    scenarioTitle: s.scenarioTitle,
    scenarioContext: s.scenarioContext,
    scenarioScript: s.scenarioScript,
    aiPersona: s.aiPersona,
    aiSystemPrompt: s.aiSystemPrompt,
    openingMessage: s.openingMessage,
    xpReward: s.xpReward,
    minTurns: s.minTurns,
    gradingDifficulty: normalizeLearnScoringDifficulty(s.gradingDifficulty),
    minimumPassScore: getStepMinimumPassScore(s),
    passCriteria: s.passCriteria || [],
    vocabularyFocus: s.vocabularyFocus || [],
    grammarFocus: s.grammarFocus || [],
    bossTasks: s.bossTasks || [],
    bossHPMax: s.bossHPMax,
    playerHPMax: s.playerHPMax,
    bossName: s.bossName,
  };
};

const serializeMap = (m) => ({
  id: toId(m),
  title: m.title,
  slug: m.slug,
  description: m.description,
  coverImageUrl: m.coverImageUrl,
  theme: m.theme,
  level: normalizeLearnMapLevel(m.level, 1),
  order: m.order,
  prerequisiteMapId: m.prerequisiteMapId ? String(m.prerequisiteMapId) : null,
  unlocksMapId: m.unlocksMapId ? String(m.unlocksMapId) : null,
  totalXP: m.totalXP,
  requiredXPToComplete: getMapRequiredXP(m),
  bossXPReward: m.bossXPReward,
  isPublished: m.isPublished,
});

const serializeProgress = (p) =>
  p
    ? {
        status: p.status,
        currentStepId: p.currentStepId ? String(p.currentStepId) : null,
        totalXPEarned: p.totalXPEarned,
        stepsCompleted: p.stepsCompleted,
        bossDefeated: p.bossDefeated,
        bossAttempts: p.bossAttempts,
        stars: p.stars,
        unlockedAt: p.unlockedAt,
        completedAt: p.completedAt,
      }
    : null;

const serializeLearnMessage = (message) => ({
  id: toId(message),
  role: message.role,
  content: message.content,
  timestamp: message.timestamp,
  grammarErrors: message.grammarErrors,
  suggestion: message.suggestion,
  evaluationScore: message.evaluationScore,
});

const serializeBossBattle = (battle) =>
  battle
    ? {
        id: toId(battle),
        bossHPCurrent: battle.bossHPCurrent,
        playerHPCurrent: battle.playerHPCurrent,
        tasks: battle.tasks,
        tasksCompleted: battle.tasksCompleted,
        tasksRequired: battle.tasksRequired,
        result: battle.result,
      }
    : null;

const normalizeString = (value) => String(value || "").trim();

const createSlug = (value) =>
  normalizeString(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

const normalizeStringArray = (value, limit = 12) => {
  if (!Array.isArray(value)) {
    return [];
  }

  const nextItems = [];

  value.forEach((item) => {
    const normalized = normalizeString(item);

    if (normalized && nextItems.length < limit) {
      nextItems.push(normalized);
    }
  });

  return nextItems;
};

const normalizeStepType = (value, fallback = "lesson") => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();

  if (normalized === "boss" || normalized === "lesson") {
    return normalized;
  }

  return fallback;
};

const normalizeBossTasks = (value, minimumCount = 0) => {
  const baseTasks = Array.isArray(value) ? value : [];
  const tasks = baseTasks
    .map((item, index) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const task = item;
      const id = normalizeString(task.id || `task-${index + 1}`);
      const description = normalizeString(task.description);

      if (!id || !description) {
        return null;
      }

      return { id, description };
    })
    .filter(Boolean);

  if (tasks.length >= minimumCount) {
    return tasks;
  }

  while (tasks.length < minimumCount) {
    const index = tasks.length + 1;
    tasks.push({
      id: `task-${index}`,
      description:
        index === 1
          ? "Open the conversation clearly and stay in character."
          : "Complete the main speaking goal with natural English.",
    });
  }

  return tasks;
};

const normalizeGenerateLearnMapRequest = (payload = {}) => {
  const brief = normalizeString(payload.brief);
  const level = normalizeLearnMapLevel(payload.level, 1);
  const theme = normalizeString(payload.theme);
  const isPublished = Boolean(payload.isPublished);

  if (!brief) {
    throw new Error("Brief tạo map với AI là bắt buộc.");
  }

  return {
    brief,
    level,
    theme,
    isPublished,
  };
};

const normalizeGenerateLearnStepRequest = (payload = {}) => {
  const brief = normalizeString(payload.brief);
  const type = normalizeStepType(payload.type, "lesson");
  const gradingDifficulty = normalizeLearnScoringDifficulty(
    payload.gradingDifficulty || DEFAULT_LEARN_SCORING_DIFFICULTY
  );

  if (!brief) {
    throw new Error("Brief tạo chặng với AI là bắt buộc.");
  }

  return {
    brief,
    type,
    gradingDifficulty,
  };
};

const normalizeGeneratedLearnMapDraft = (payload = {}, input, fallbackOrder = 0) => {
  const title = normalizeString(payload.title) || "Speaking Map";
  const slug = createSlug(payload.slug || title) || `speaking-map-${Date.now()}`;
  const theme = normalizeString(payload.theme || input.theme);

  return {
    title,
    slug,
    description: normalizeString(payload.description || input.brief),
    theme,
    level: normalizeLearnMapLevel(payload.level || input.level, input.level),
    order: normalizePositiveInt(payload.order, fallbackOrder, 0),
    requiredXPToComplete: normalizePositiveInt(
      payload.requiredXPToComplete,
      0,
      0
    ),
    bossXPReward: normalizePositiveInt(payload.bossXPReward, 50, 0),
    isPublished: Boolean(
      payload.isPublished === undefined ? input.isPublished : payload.isPublished
    ),
  };
};

const normalizeGeneratedLearnStepDraft = (payload = {}, input, fallbackOrder = 0) => {
  const type = normalizeStepType(payload.type || input.type, input.type);
  const gradingDifficulty = normalizeLearnScoringDifficulty(
    payload.gradingDifficulty || input.gradingDifficulty
  );
  const minimumPassScoreInput =
    payload.minimumPassScore === null || payload.minimumPassScore === ""
      ? null
      : normalizePositiveInt(
          payload.minimumPassScore,
          getStepMinimumPassScore({ gradingDifficulty }),
          1
        );

  return {
    title:
      normalizeString(payload.title) ||
      (type === "boss" ? "Final Boss Challenge" : "New Speaking Step"),
    type,
    order: normalizePositiveInt(payload.order, fallbackOrder, 0),
    scenarioTitle:
      normalizeString(payload.scenarioTitle) ||
      (type === "boss" ? "Boss speaking mission" : "Speaking practice"),
    scenarioContext: normalizeString(payload.scenarioContext),
    scenarioScript: normalizeString(payload.scenarioScript),
    aiPersona:
      normalizeString(payload.aiPersona) || "Friendly English speaking coach",
    aiSystemPrompt:
      normalizeString(payload.aiSystemPrompt) ||
      "You are a friendly English tutor. Keep replies short, practical, and natural.",
    openingMessage:
      normalizeString(payload.openingMessage) ||
      "Hi! Let's practice speaking English together. Ready?",
    minTurns: normalizePositiveInt(payload.minTurns, type === "boss" ? 3 : 2, 1),
    xpReward: normalizePositiveInt(payload.xpReward, type === "boss" ? 50 : 20, 0),
    gradingDifficulty,
    minimumPassScore: minimumPassScoreInput,
    passCriteria: normalizeStringArray(payload.passCriteria, 8),
    vocabularyFocus: normalizeStringArray(payload.vocabularyFocus, 12),
    grammarFocus: normalizeStringArray(payload.grammarFocus, 12),
    bossName:
      type === "boss"
        ? normalizeString(payload.bossName) || "Boss cuoi chang"
        : "",
    bossTasks:
      type === "boss" ? normalizeBossTasks(payload.bossTasks, 2) : [],
  };
};

// --- User ---

export const listLearnMaps = async (req, res) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    await ensureUserMapProgress(req.user.id);
    const maps = await LearnMap.find({ isPublished: true }).sort(LEARN_MAP_SORT).lean();
    const progressRows = await UserMapProgress.find({ userId: req.user.id }).lean();
    const progByMap = new Map(progressRows.map((p) => [String(p.mapId), p]));

    const data = maps.map((m) => ({
      ...serializeMap(m),
      progress: serializeProgress(progByMap.get(String(m._id))),
    }));

    return res.json({ success: true, message: "Maps loaded", data: { items: data } });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getLearnMapBySlug = async (req, res) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    await ensureUserMapProgress(req.user.id);
    const { slug } = req.params;
    const map = await LearnMap.findOne({ slug, isPublished: true }).lean();
    if (!map) {
      return res.status(404).json({ success: false, message: "Map not found" });
    }
    const progress = await UserMapProgress.findOne({
      userId: req.user.id,
      mapId: map._id,
    }).lean();

    const locked = !progress || progress.status === "locked";
    const stepsRaw = await listStepsForMap(map._id);
    const steps = stepsRaw.map((s) => serializeStep(s, locked));

    return res.json({
      success: true,
      message: "Map detail",
      data: {
        map: serializeMap(map),
        progress: serializeProgress(progress),
        steps,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const postStartLearnConversation = async (req, res) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    const { stepId } = req.params;
    const result = await startConversation(req.user.id, stepId);
    return res.status(201).json({
      success: true,
      message: "Conversation started",
      data: {
        conversation: {
          id: toId(result.conversation),
          stepId: String(result.conversation.stepId),
          mapId: String(result.conversation.mapId),
          attempt: result.conversation.attempt,
          status: result.conversation.status,
          startedAt: result.conversation.startedAt,
        },
        messages: result.messages.map((m) => ({
          id: toId(m),
          role: m.role,
          content: m.content,
          timestamp: m.timestamp,
          grammarErrors: m.grammarErrors,
          suggestion: m.suggestion,
          evaluationScore: m.evaluationScore,
        })),
        bossBattle: result.bossBattle
          ? {
              id: toId(result.bossBattle),
              bossName: result.bossBattle.bossName,
              bossHPMax: result.bossBattle.bossHPMax,
              bossHPCurrent: result.bossBattle.bossHPCurrent,
              playerHPMax: result.bossBattle.playerHPMax,
              playerHPCurrent: result.bossBattle.playerHPCurrent,
              tasks: result.bossBattle.tasks,
              tasksCompleted: result.bossBattle.tasksCompleted,
              tasksRequired: result.bossBattle.tasksRequired,
            }
          : null,
      },
    });
  } catch (error) {
    const code = error.statusCode || 500;
    return res.status(code).json({ success: false, message: error.message });
  }
};

export const postLearnMessage = async (req, res) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    const { id } = req.params;
    const { content } = req.body;
    const result = await sendLearnMessage(req.user.id, id, content);
    return res.json({
      success: true,
      message: "Message sent",
      data: {
        userMessage: serializeLearnMessage(result.userMessage),
        assistantMessage: result.assistantMessage
          ? serializeLearnMessage(result.assistantMessage)
          : null,
        bossBattle: serializeBossBattle(result.bossBattle),
      },
    });
  } catch (error) {
    const code = error.statusCode || 500;
    return res.status(code).json({ success: false, message: error.message });
  }
};

export const postLearnMessageQuick = async (req, res) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const { id } = req.params;
    const { content } = req.body;
    const result = await sendLearnMessageQuick(req.user.id, id, content);

    return res.json({
      success: true,
      message: "Fast message sent",
      data: {
        userMessage: serializeLearnMessage(result.userMessage),
        assistantMessage: result.assistantMessage
          ? serializeLearnMessage(result.assistantMessage)
          : null,
      },
    });
  } catch (error) {
    const code = error.statusCode || 500;
    return res.status(code).json({ success: false, message: error.message });
  }
};

export const postLearnMessageEvaluation = async (req, res) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const { id, messageId } = req.params;
    const result = await evaluateLearnMessage(req.user.id, id, messageId);

    return res.json({
      success: true,
      message: result.alreadyEvaluated
        ? "Message already evaluated"
        : "Message evaluation completed",
      data: {
        userMessage: serializeLearnMessage(result.userMessage),
        bossBattle: serializeBossBattle(result.bossBattle),
        alreadyEvaluated: Boolean(result.alreadyEvaluated),
      },
    });
  } catch (error) {
    const code = error.statusCode || 500;
    return res.status(code).json({ success: false, message: error.message });
  }
};

export const postEndLearnConversation = async (req, res) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    const { id } = req.params;
    const result = await endConversation(req.user.id, id);
    return res.json({
      success: true,
      message: result.alreadyEnded ? "Already ended" : "Conversation ended",
      data: {
        conversation: {
          id: toId(result.conversation),
          status: result.conversation.status,
          score: result.conversation.score,
          aiFeedback: result.conversation.aiFeedback,
          xpEarned: result.conversation.xpEarned,
          goalsAchieved: result.conversation.goalsAchieved,
          durationSec: result.conversation.durationSec,
        },
        passed: result.passed,
        bossWin: result.bossWin,
        requiredScore: result.minimumPassScore,
        mapCompleted: result.mapCompleted,
        currentMapXP: result.currentMapXP,
        requiredMapXP: result.requiredMapXP,
        replayAttempt: result.replayAttempt,
      },
    });
  } catch (error) {
    const code = error.statusCode || 500;
    return res.status(code).json({ success: false, message: error.message });
  }
};

export const getLearnConversation = async (req, res) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    const { id } = req.params;
    const conv = await LearnConversation.findOne({
      _id: id,
      userId: req.user.id,
    }).lean();
    if (!conv) {
      return res.status(404).json({ success: false, message: "Not found" });
    }
    const messages = await LearnMessage.find({ conversationId: conv._id })
      .sort({ timestamp: 1 })
      .lean();
    const battle = await getBossBattleForConversation(conv._id, req.user.id);
    return res.json({
      success: true,
      data: {
        conversation: {
          id: toId(conv),
          stepId: String(conv.stepId),
          mapId: String(conv.mapId),
          status: conv.status,
          attempt: conv.attempt,
          startedAt: conv.startedAt,
          endedAt: conv.endedAt,
          score: conv.score,
          aiFeedback: conv.aiFeedback,
          xpEarned: conv.xpEarned,
        },
        messages: messages.map((m) => ({
          id: toId(m),
          role: m.role,
          content: m.content,
          timestamp: m.timestamp,
          grammarErrors: m.grammarErrors,
          suggestion: m.suggestion,
          evaluationScore: m.evaluationScore,
        })),
        bossBattle: battle,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getMyLearnAchievements = async (req, res) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    const rows = await listUserAchievements(req.user.id);
    const items = rows.map((r) => ({
      earnedAt: r.earnedAt,
      achievement: r.achievementId
        ? {
            key: r.achievementId.key,
            title: r.achievementId.title,
            description: r.achievementId.description,
            iconUrl: r.achievementId.iconUrl,
            xpReward: r.achievementId.xpReward,
          }
        : null,
    }));
    return res.json({ success: true, data: { items } });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// --- Admin maps ---

export const adminListLearnMaps = async (_req, res) => {
  try {
    const items = await LearnMap.find({}).sort(LEARN_MAP_SORT).lean();
    return res.json({
      success: true,
      data: { items: items.map(serializeMap) },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const adminGenerateLearnMapDraft = async (req, res) => {
  try {
    const input = normalizeGenerateLearnMapRequest(req.body);
    const lastMapInLevel = await LearnMap.findOne({ level: input.level })
      .sort({ order: -1, createdAt: -1 })
      .lean();
    const fallbackOrder = normalizePositiveInt(lastMapInLevel?.order, -1, -1) + 1;
    const aiDraft = await generateLearnMapDraft({
      ...input,
      order: fallbackOrder,
    });
    const draft = normalizeGeneratedLearnMapDraft(aiDraft, input, fallbackOrder);

    return res.json({
      success: true,
      message: "Learn map draft generated",
      data: draft,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to generate learn map draft",
    });
  }
};

export const adminCreateLearnMap = async (req, res) => {
  try {
    const body = req.body;
    const slug = String(body.slug || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-");
    if (!body.title || !slug) {
      return res.status(400).json({ success: false, message: "title and slug required" });
    }
    const map = await LearnMap.create({
      title: String(body.title).trim(),
      slug,
      description: body.description || "",
      coverImageUrl: body.coverImageUrl || "",
      theme: body.theme || "",
      level: normalizeLearnMapLevel(body.level, 1),
      order: Number(body.order) || 0,
      prerequisiteMapId: body.prerequisiteMapId || null,
      isPublished: Boolean(body.isPublished),
      totalXP: 0,
      requiredXPToComplete: normalizePositiveInt(body.requiredXPToComplete, 0, 0),
      bossXPReward: Number(body.bossXPReward) || 0,
      unlocksMapId: body.unlocksMapId || null,
    });
    const recalculated = await recalculateMapTotalXP(map._id);
    return res.status(201).json({
      success: true,
      data: { map: serializeMap(recalculated || map) },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const adminUpdateLearnMap = async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body;
    const map = await LearnMap.findByIdAndUpdate(
      id,
      {
        ...(body.title !== undefined && { title: String(body.title).trim() }),
        ...(body.slug !== undefined && {
          slug: String(body.slug)
            .trim()
            .toLowerCase()
            .replace(/\s+/g, "-"),
        }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.coverImageUrl !== undefined && { coverImageUrl: body.coverImageUrl }),
        ...(body.theme !== undefined && { theme: body.theme }),
        ...(body.level !== undefined && {
          level: normalizeLearnMapLevel(body.level, 1),
        }),
        ...(body.order !== undefined && { order: Number(body.order) }),
        ...(body.prerequisiteMapId !== undefined && {
          prerequisiteMapId: body.prerequisiteMapId || null,
        }),
        ...(body.isPublished !== undefined && { isPublished: Boolean(body.isPublished) }),
        ...(body.requiredXPToComplete !== undefined && {
          requiredXPToComplete: normalizePositiveInt(
            body.requiredXPToComplete,
            0,
            0
          ),
        }),
        ...(body.bossXPReward !== undefined && {
          bossXPReward: Number(body.bossXPReward),
        }),
        ...(body.unlocksMapId !== undefined && {
          unlocksMapId: body.unlocksMapId || null,
        }),
      },
      { new: true }
    );
    if (!map) return res.status(404).json({ success: false, message: "Not found" });
    const recalculated = await recalculateMapTotalXP(map._id);
    return res.json({
      success: true,
      data: { map: serializeMap(recalculated || map.toObject()) },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const adminDeleteLearnMap = async (req, res) => {
  try {
    const { id } = req.params;
    await Step.deleteMany({ mapId: id });
    await LearnMap.findByIdAndDelete(id);
    return res.json({ success: true, message: "Deleted" });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const adminListSteps = async (req, res) => {
  try {
    const { mapId } = req.params;
    const steps = await Step.find({ mapId }).sort({ order: 1 }).lean();
    return res.json({
      success: true,
      data: { items: steps.map((s) => serializeStep(s, false)) },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const adminGenerateStepDraft = async (req, res) => {
  try {
    const { mapId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(mapId)) {
      return res.status(400).json({ success: false, message: "Invalid mapId" });
    }

    const map = await LearnMap.findById(mapId).lean();

    if (!map) {
      return res.status(404).json({ success: false, message: "Map not found" });
    }

    const input = normalizeGenerateLearnStepRequest(req.body);
    const existingSteps = await Step.find({ mapId }).sort({ order: 1 }).lean();
    const fallbackOrder =
      existingSteps.length > 0
        ? Math.max(...existingSteps.map((step) => step.order || 0)) + 1
        : 0;
    const aiDraft = await generateLearnStepDraft({
      map,
      existingSteps,
      input: {
        ...input,
        order: fallbackOrder,
      },
    });
    const draft = normalizeGeneratedLearnStepDraft(aiDraft, input, fallbackOrder);

    return res.json({
      success: true,
      message: "Learn step draft generated",
      data: draft,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to generate learn step draft",
    });
  }
};

export const adminCreateStep = async (req, res) => {
  try {
    const { mapId } = req.params;
    const b = req.body;
    if (!mongoose.Types.ObjectId.isValid(mapId)) {
      return res.status(400).json({ success: false, message: "Invalid mapId" });
    }
    if (!b.title || !b.type) {
      return res.status(400).json({ success: false, message: "title and type required" });
    }
    const orderNum = Number(b.order);
    const step = await Step.create({
      mapId,
      order: Number.isFinite(orderNum) ? orderNum : 0,
      title: String(b.title).trim(),
      type: b.type,
      scenarioTitle: b.scenarioTitle || "",
      scenarioContext: b.scenarioContext || "",
      scenarioScript: b.scenarioScript || "",
      aiPersona: b.aiPersona || "",
      aiSystemPrompt: b.aiSystemPrompt || "",
      openingMessage: b.openingMessage || "",
      xpReward: Number(b.xpReward) || 0,
      minTurns: Number(b.minTurns) || 1,
      gradingDifficulty: normalizeLearnScoringDifficulty(b.gradingDifficulty),
      minimumPassScore:
        b.minimumPassScore === null || b.minimumPassScore === ""
          ? null
          : normalizePositiveInt(b.minimumPassScore, 0, 0),
      passCriteria: Array.isArray(b.passCriteria) ? b.passCriteria : [],
      vocabularyFocus: Array.isArray(b.vocabularyFocus) ? b.vocabularyFocus : [],
      grammarFocus: Array.isArray(b.grammarFocus) ? b.grammarFocus : [],
      bossTasks: Array.isArray(b.bossTasks) ? b.bossTasks : [],
      bossHPMax: Number(b.bossHPMax) || 100,
      playerHPMax: Number(b.playerHPMax) || 100,
      bossName: b.bossName || "",
    });
    await recalculateMapTotalXP(mapId);
    return res.status(201).json({
      success: true,
      data: { step: serializeStep(step, false) },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const adminUpdateStep = async (req, res) => {
  try {
    const { id } = req.params;
    const b = req.body;
    const step = await Step.findByIdAndUpdate(
      id,
      {
        ...(b.title !== undefined && { title: String(b.title).trim() }),
        ...(b.order !== undefined && { order: Number(b.order) }),
        ...(b.type !== undefined && { type: b.type }),
        ...(b.scenarioTitle !== undefined && { scenarioTitle: b.scenarioTitle }),
        ...(b.scenarioContext !== undefined && { scenarioContext: b.scenarioContext }),
        ...(b.scenarioScript !== undefined && { scenarioScript: b.scenarioScript }),
        ...(b.aiPersona !== undefined && { aiPersona: b.aiPersona }),
        ...(b.aiSystemPrompt !== undefined && { aiSystemPrompt: b.aiSystemPrompt }),
        ...(b.openingMessage !== undefined && { openingMessage: b.openingMessage }),
        ...(b.xpReward !== undefined && { xpReward: Number(b.xpReward) }),
        ...(b.minTurns !== undefined && { minTurns: Number(b.minTurns) }),
        ...(b.gradingDifficulty !== undefined && {
          gradingDifficulty: normalizeLearnScoringDifficulty(b.gradingDifficulty),
        }),
        ...(b.minimumPassScore !== undefined && {
          minimumPassScore:
            b.minimumPassScore === null || b.minimumPassScore === ""
              ? null
              : normalizePositiveInt(b.minimumPassScore, 0, 0),
        }),
        ...(b.passCriteria !== undefined && {
          passCriteria: Array.isArray(b.passCriteria) ? b.passCriteria : [],
        }),
        ...(b.vocabularyFocus !== undefined && {
          vocabularyFocus: Array.isArray(b.vocabularyFocus) ? b.vocabularyFocus : [],
        }),
        ...(b.grammarFocus !== undefined && {
          grammarFocus: Array.isArray(b.grammarFocus) ? b.grammarFocus : [],
        }),
        ...(b.bossTasks !== undefined && {
          bossTasks: Array.isArray(b.bossTasks) ? b.bossTasks : [],
        }),
        ...(b.bossHPMax !== undefined && { bossHPMax: Number(b.bossHPMax) }),
        ...(b.playerHPMax !== undefined && { playerHPMax: Number(b.playerHPMax) }),
        ...(b.bossName !== undefined && { bossName: b.bossName }),
      },
      { new: true }
    );
    if (!step) return res.status(404).json({ success: false, message: "Not found" });
    await recalculateMapTotalXP(step.mapId);
    return res.json({
      success: true,
      data: { step: serializeStep(step.toObject(), false) },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const adminDeleteStep = async (req, res) => {
  try {
    const { id } = req.params;
    const step = await Step.findByIdAndDelete(id).lean();
    if (step?.mapId) {
      await recalculateMapTotalXP(step.mapId);
    }
    return res.json({ success: true, message: "Deleted" });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// --- Admin achievements ---

export const adminListAchievements = async (_req, res) => {
  try {
    const items = await LearnAchievement.find({}).sort({ createdAt: -1 }).lean();
    return res.json({
      success: true,
      data: {
        items: items.map((a) => ({
          id: toId(a),
          key: a.key,
          title: a.title,
          description: a.description,
          iconUrl: a.iconUrl,
          trigger: a.trigger,
          xpReward: a.xpReward,
        })),
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const adminCreateAchievement = async (req, res) => {
  try {
    const b = req.body;
    if (!b.key || !b.title) {
      return res.status(400).json({ success: false, message: "key and title required" });
    }
    const a = await LearnAchievement.create({
      key: String(b.key).trim(),
      title: String(b.title).trim(),
      description: b.description || "",
      iconUrl: b.iconUrl || "",
      trigger: b.trigger || "",
      xpReward: Number(b.xpReward) || 0,
    });
    return res.status(201).json({
      success: true,
      data: {
        achievement: {
          id: toId(a),
          key: a.key,
          title: a.title,
          description: a.description,
          iconUrl: a.iconUrl,
          trigger: a.trigger,
          xpReward: a.xpReward,
        },
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const adminUpdateAchievement = async (req, res) => {
  try {
    const { id } = req.params;
    const b = req.body;
    const a = await LearnAchievement.findByIdAndUpdate(
      id,
      {
        ...(b.key !== undefined && { key: String(b.key).trim() }),
        ...(b.title !== undefined && { title: String(b.title).trim() }),
        ...(b.description !== undefined && { description: b.description }),
        ...(b.iconUrl !== undefined && { iconUrl: b.iconUrl }),
        ...(b.trigger !== undefined && { trigger: b.trigger }),
        ...(b.xpReward !== undefined && { xpReward: Number(b.xpReward) }),
      },
      { new: true }
    ).lean();
    if (!a) return res.status(404).json({ success: false, message: "Not found" });
    return res.json({
      success: true,
      data: {
        achievement: {
          id: toId(a),
          key: a.key,
          title: a.title,
          description: a.description,
          iconUrl: a.iconUrl,
          trigger: a.trigger,
          xpReward: a.xpReward,
        },
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const adminDeleteAchievement = async (req, res) => {
  try {
    const { id } = req.params;
    await LearnAchievement.findByIdAndDelete(id);
    return res.json({ success: true, message: "Deleted" });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
