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
  getBossBattleForConversation,
  sendLearnMessage,
  startConversation,
} from "../services/learn-conversation.service.js";
import { ensureUserMapProgress, listStepsForMap } from "../services/learn-map-progress.service.js";

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
    aiPersona: s.aiPersona,
    aiSystemPrompt: s.aiSystemPrompt,
    openingMessage: s.openingMessage,
    xpReward: s.xpReward,
    minTurns: s.minTurns,
    passCriteria: s.passCriteria || [],
    vocabularyFocus: s.vocabularyFocus || [],
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
  order: m.order,
  prerequisiteMapId: m.prerequisiteMapId ? String(m.prerequisiteMapId) : null,
  unlocksMapId: m.unlocksMapId ? String(m.unlocksMapId) : null,
  totalXP: m.totalXP,
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

// --- User ---

export const listLearnMaps = async (req, res) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    await ensureUserMapProgress(req.user.id);
    const maps = await LearnMap.find({ isPublished: true }).sort({ order: 1 }).lean();
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
        userMessage: {
          id: toId(result.userMessage),
          role: result.userMessage.role,
          content: result.userMessage.content,
          grammarErrors: result.userMessage.grammarErrors,
          suggestion: result.userMessage.suggestion,
          evaluationScore: result.userMessage.evaluationScore,
        },
        bossBattle: result.bossBattle
          ? {
              id: toId(result.bossBattle),
              bossHPCurrent: result.bossBattle.bossHPCurrent,
              playerHPCurrent: result.bossBattle.playerHPCurrent,
              tasks: result.bossBattle.tasks,
              tasksCompleted: result.bossBattle.tasksCompleted,
              tasksRequired: result.bossBattle.tasksRequired,
              result: result.bossBattle.result,
            }
          : null,
        messages: result.messages.map((m) => ({
          id: toId(m),
          role: m.role,
          content: m.content,
          timestamp: m.timestamp,
          grammarErrors: m.grammarErrors,
          suggestion: m.suggestion,
          evaluationScore: m.evaluationScore,
        })),
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
    const items = await LearnMap.find({}).sort({ order: 1, createdAt: 1 }).lean();
    return res.json({
      success: true,
      data: { items: items.map(serializeMap) },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
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
      order: Number(body.order) || 0,
      prerequisiteMapId: body.prerequisiteMapId || null,
      isPublished: Boolean(body.isPublished),
      totalXP: Number(body.totalXP) || 0,
      bossXPReward: Number(body.bossXPReward) || 0,
      unlocksMapId: body.unlocksMapId || null,
    });
    return res.status(201).json({ success: true, data: { map: serializeMap(map) } });
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
        ...(body.order !== undefined && { order: Number(body.order) }),
        ...(body.prerequisiteMapId !== undefined && {
          prerequisiteMapId: body.prerequisiteMapId || null,
        }),
        ...(body.isPublished !== undefined && { isPublished: Boolean(body.isPublished) }),
        ...(body.totalXP !== undefined && { totalXP: Number(body.totalXP) }),
        ...(body.bossXPReward !== undefined && {
          bossXPReward: Number(body.bossXPReward),
        }),
        ...(body.unlocksMapId !== undefined && {
          unlocksMapId: body.unlocksMapId || null,
        }),
      },
      { new: true }
    ).lean();
    if (!map) return res.status(404).json({ success: false, message: "Not found" });
    return res.json({ success: true, data: { map: serializeMap(map) } });
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
      aiPersona: b.aiPersona || "",
      aiSystemPrompt: b.aiSystemPrompt || "",
      openingMessage: b.openingMessage || "",
      xpReward: Number(b.xpReward) || 0,
      minTurns: Number(b.minTurns) || 1,
      passCriteria: Array.isArray(b.passCriteria) ? b.passCriteria : [],
      vocabularyFocus: Array.isArray(b.vocabularyFocus) ? b.vocabularyFocus : [],
      bossTasks: Array.isArray(b.bossTasks) ? b.bossTasks : [],
      bossHPMax: Number(b.bossHPMax) || 100,
      playerHPMax: Number(b.playerHPMax) || 100,
      bossName: b.bossName || "",
    });
    return res.status(201).json({ success: true, data: { step: serializeStep(step, false) } });
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
        ...(b.aiPersona !== undefined && { aiPersona: b.aiPersona }),
        ...(b.aiSystemPrompt !== undefined && { aiSystemPrompt: b.aiSystemPrompt }),
        ...(b.openingMessage !== undefined && { openingMessage: b.openingMessage }),
        ...(b.xpReward !== undefined && { xpReward: Number(b.xpReward) }),
        ...(b.minTurns !== undefined && { minTurns: Number(b.minTurns) }),
        ...(b.passCriteria !== undefined && {
          passCriteria: Array.isArray(b.passCriteria) ? b.passCriteria : [],
        }),
        ...(b.vocabularyFocus !== undefined && {
          vocabularyFocus: Array.isArray(b.vocabularyFocus) ? b.vocabularyFocus : [],
        }),
        ...(b.bossTasks !== undefined && {
          bossTasks: Array.isArray(b.bossTasks) ? b.bossTasks : [],
        }),
        ...(b.bossHPMax !== undefined && { bossHPMax: Number(b.bossHPMax) }),
        ...(b.playerHPMax !== undefined && { playerHPMax: Number(b.playerHPMax) }),
        ...(b.bossName !== undefined && { bossName: b.bossName }),
      },
      { new: true }
    ).lean();
    if (!step) return res.status(404).json({ success: false, message: "Not found" });
    return res.json({ success: true, data: { step: serializeStep(step, false) } });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const adminDeleteStep = async (req, res) => {
  try {
    const { id } = req.params;
    await Step.findByIdAndDelete(id);
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
