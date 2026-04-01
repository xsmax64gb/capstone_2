import {
  BossBattle,
  LearnConversation,
  LearnMessage,
  Map as LearnMap,
  Step,
  User,
  UserMapProgress,
} from "../models/index.js";
import {
  runLearnQuickReply,
  runLearnMessageEvaluation,
  runSessionSummary,
} from "./learn-openai.service.js";
import {
  ensureUserMapProgress,
  getNextStepAfter,
  listStepsForMap,
  unlockMapById,
  unlockNextMapInLevelOrder,
  unlockMapsAfterPrerequisiteCompleted,
} from "./learn-map-progress.service.js";
import { tryGrantFirstBossWin } from "./learn-achievement.service.js";
import {
  getMapRequiredXP,
  getStepMinimumAverageTurnScore,
  getStepMinimumPassScore,
} from "../helper/learn-rules.js";

const BOSS_DAMAGE_GOOD = 18;
const BOSS_DAMAGE_OK = 8;
const PLAYER_DAMAGE_BAD = 12;
const QUICK_REPLY_HISTORY_LIMIT = 4;

function buildLocaleHint(user) {
  const native = user?.nativeLanguage || "learner's language";
  const target = user?.targetLanguage || "en";
  return `Learner native language: ${native}. Target language to teach/practice: ${target}.`;
}

function normalizeGrammarErrors(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((e) => ({
    message: String(e?.message ?? e?.Message ?? ""),
    rule: String(e?.rule ?? e?.Rule ?? ""),
    span: String(e?.span ?? e?.Span ?? ""),
  }));
}

async function findActiveConversation(userId, conversationId) {
  const conv = await LearnConversation.findOne({
    _id: conversationId,
    userId,
    status: "in_progress",
  });

  if (!conv) {
    const err = new Error("Conversation not found or closed");
    err.statusCode = 404;
    throw err;
  }

  return conv;
}

async function applyBossTurn(battle, turnQualityScore, grammarErrors, tasksCompletedIds) {
  const gLen = grammarErrors.length;
  let bossDmg = 0;
  let playerDmg = 0;

  if (gLen === 0 && turnQualityScore >= 70) {
    bossDmg = BOSS_DAMAGE_GOOD;
  } else if (gLen >= 2 || turnQualityScore < 45) {
    playerDmg = PLAYER_DAMAGE_BAD;
  } else {
    bossDmg = BOSS_DAMAGE_OK;
  }

  battle.bossHPCurrent = Math.max(0, (battle.bossHPCurrent ?? 0) - bossDmg);
  battle.playerHPCurrent = Math.max(0, (battle.playerHPCurrent ?? 0) - playerDmg);

  const idSet = new Set((tasksCompletedIds || []).map(String));
  if (battle.tasks?.length) {
    for (const t of battle.tasks) {
      if (idSet.has(String(t.id))) t.completed = true;
    }
    battle.tasksCompleted = battle.tasks.filter((t) => t.completed).length;
  }

  await battle.save();
  return battle;
}

export async function startConversation(userId, stepId) {
  await ensureUserMapProgress(userId);
  const step = await Step.findById(stepId).lean();
  if (!step) {
    const err = new Error("Step not found");
    err.statusCode = 404;
    throw err;
  }

  const map = await LearnMap.findById(step.mapId).lean();
  if (!map?.isPublished) {
    const err = new Error("Map not available");
    err.statusCode = 403;
    throw err;
  }

  const progress = await UserMapProgress.findOne({
    userId,
    mapId: step.mapId,
  }).lean();

  if (!progress || progress.status === "locked") {
    const err = new Error("Map locked");
    err.statusCode = 403;
    throw err;
  }

  const steps = await listStepsForMap(step.mapId);
  const requestedIndex = steps.findIndex(
    (item) => String(item._id) === String(stepId)
  );

  if (requestedIndex < 0) {
    const err = new Error("Step not found");
    err.statusCode = 404;
    throw err;
  }

  if (progress.status !== "completed") {
    const currentIndexRaw = progress.currentStepId
      ? steps.findIndex(
        (item) => String(item._id) === String(progress.currentStepId)
      )
      : 0;
    const currentIndex = currentIndexRaw >= 0 ? currentIndexRaw : 0;

    if (requestedIndex > currentIndex) {
      const err = new Error("Complete earlier steps first");
      err.statusCode = 409;
      throw err;
    }
  }

  const open = await LearnConversation.findOne({
    userId,
    stepId,
    status: "in_progress",
  }).lean();
  if (open) {
    const messages = await LearnMessage.find({ conversationId: open._id })
      .sort({ timestamp: 1 })
      .lean();
    const battle = await BossBattle.findOne({ conversationId: open._id }).lean();
    return { conversation: open, messages, bossBattle: battle, resumed: true };
  }

  const attempt =
    (await LearnConversation.countDocuments({ userId, stepId })) + 1;

  const conv = await LearnConversation.create({
    userId,
    stepId: step._id,
    mapId: step.mapId,
    attempt,
    startedAt: new Date(),
    status: "in_progress",
  });

  let battle = null;
  if (step.type === "boss") {
    const tasks = (step.bossTasks || []).map((t) => ({
      id: String(t.id),
      description: String(t.description),
      completed: false,
    }));

    battle = await BossBattle.create({
      userId,
      mapId: step.mapId,
      conversationId: conv._id,
      bossName: step.bossName || map.title,
      bossHPMax: step.bossHPMax || 100,
      bossHPCurrent: step.bossHPMax || 100,
      playerHPMax: step.playerHPMax || 100,
      playerHPCurrent: step.playerHPMax || 100,
      tasks,
      tasksCompleted: 0,
      tasksRequired: tasks.length || 0,
      attemptedAt: new Date(),
    });
  }

  if (step.openingMessage) {
    await LearnMessage.create({
      conversationId: conv._id,
      role: "ai",
      content: step.openingMessage,
      timestamp: new Date(),
    });
  }

  const messages = await LearnMessage.find({ conversationId: conv._id })
    .sort({ timestamp: 1 })
    .lean();

  return { conversation: conv, messages, bossBattle: battle };
}

export async function sendLearnMessageQuick(userId, conversationId, content) {
  const text = String(content || "").trim();
  if (!text) {
    const err = new Error("Message required");
    err.statusCode = 400;
    throw err;
  }

  const conv = await findActiveConversation(userId, conversationId);

  const [step, user, recentHistory] = await Promise.all([
    Step.findById(conv.stepId).lean(),
    User.findById(userId).select("nativeLanguage targetLanguage").lean(),
    LearnMessage.find({ conversationId: conv._id })
      .sort({ timestamp: -1 })
      .limit(QUICK_REPLY_HISTORY_LIMIT)
      .select("role content")
      .lean(),
  ]);

  if (!step) {
    const err = new Error("Step not found");
    err.statusCode = 404;
    throw err;
  }

  const historyForQuick = recentHistory.reverse().map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const quickReplyPromise = runLearnQuickReply({
    systemPrompt: step.aiSystemPrompt || step.scenarioContext || step.title,
    localeHint: buildLocaleHint(user),
    history: historyForQuick,
    userMessage: text,
    stepContext: {
      title: step.title,
      scenarioTitle: step.scenarioTitle,
      scenarioContext: step.scenarioContext,
      passCriteria: step.passCriteria || [],
    },
  });

  const userMsgPromise = LearnMessage.create({
    conversationId: conv._id,
    role: "user",
    content: text,
    timestamp: new Date(),
  });

  const userMsg = await userMsgPromise;
  const quickReply = await quickReplyPromise;

  if (!quickReply || !String(quickReply).trim()) {
    const err = new Error("OpenAI quick reply returned empty content");
    err.statusCode = 502;
    throw err;
  }

  const assistantMsg =
    quickReply && String(quickReply).trim()
      ? await LearnMessage.create({
        conversationId: conv._id,
        role: "ai",
        content: quickReply,
        timestamp: new Date(),
      })
      : null;

  return {
    userMessage: userMsg,
    assistantMessage: assistantMsg,
    bossBattle: null,
  };
}

export async function evaluateLearnMessage(userId, conversationId, messageId) {
  const conv = await findActiveConversation(userId, conversationId);

  const [step, battle, userMsg] = await Promise.all([
    Step.findById(conv.stepId).lean(),
    BossBattle.findOne({ conversationId: conv._id }).lean(),
    LearnMessage.findOne({
      _id: messageId,
      conversationId: conv._id,
      role: "user",
    }),
  ]);

  if (!step) {
    const err = new Error("Step not found");
    err.statusCode = 404;
    throw err;
  }

  if (!userMsg) {
    const err = new Error("User message not found");
    err.statusCode = 404;
    throw err;
  }

  if (
    userMsg.evaluationScore != null ||
    (Array.isArray(userMsg.grammarErrors) && userMsg.grammarErrors.length > 0) ||
    String(userMsg.suggestion || "").trim()
  ) {
    return {
      userMessage: userMsg,
      bossBattle: battle,
      alreadyEvaluated: true,
    };
  }

  const bossTasksForLlm = battle?.tasks?.map((t) => ({
    id: t.id,
    description: t.description,
  })) || [];

  const aiResult = await runLearnMessageEvaluation({
    userMessage: userMsg.content,
    bossTasks: bossTasksForLlm,
  });

  const grammarErrors = normalizeGrammarErrors(aiResult.grammarErrors);

  userMsg.grammarErrors = grammarErrors;
  userMsg.vocabularyUsed = [];
  userMsg.suggestion = aiResult.suggestion;
  userMsg.evaluationScore = aiResult.turnQualityScore;
  await userMsg.save();

  await LearnConversation.updateOne(
    { _id: conv._id },
    {
      $inc: { mistakeCount: grammarErrors.length },
    }
  );

  let battleAfter = battle;
  if (battle) {
    const bDoc = await BossBattle.findById(battle._id);
    if (bDoc) {
      battleAfter = await applyBossTurn(
        bDoc,
        aiResult.turnQualityScore,
        grammarErrors,
        aiResult.tasksCompletedIds
      );
    }
  }

  return {
    userMessage: userMsg,
    bossBattle: battleAfter,
  };
}

export async function endConversation(userId, conversationId) {
  const conv = await LearnConversation.findOne({
    _id: conversationId,
    userId,
  });
  if (!conv) {
    const err = new Error("Conversation not found");
    err.statusCode = 404;
    throw err;
  }

  if (conv.status !== "in_progress") {
    return { conversation: conv, alreadyEnded: true };
  }

  const step = await Step.findById(conv.stepId).lean();
  const map = await LearnMap.findById(conv.mapId).lean();
  const msgs = await LearnMessage.find({ conversationId: conv._id })
    .sort({ timestamp: 1 })
    .lean();

  const userMsgs = msgs.filter((m) => m.role === "user");
  const fullTranscript = msgs.map((m) => `${m.role}: ${m.content}`).join("\n");
  const minimumPassScore = getStepMinimumPassScore(step);
  const minimumAverageTurnScore = getStepMinimumAverageTurnScore(step);

  const summary = await runSessionSummary({
    transcript: fullTranscript,
    passCriteria: step.passCriteria || [],
    vocabularyFocus: step.vocabularyFocus || [],
    grammarFocus: step.grammarFocus || [],
    scenarioTitle: step.scenarioTitle || "",
    scenarioContext: step.scenarioContext || "",
    scenarioScript: step.scenarioScript || "",
    gradingDifficulty: step.gradingDifficulty || "medium",
    minimumPassScore,
  });

  const userTurns = userMsgs.length;
  const avgEval =
    userMsgs.reduce((s, m) => s + (m.evaluationScore ?? 50), 0) /
    Math.max(1, userMsgs.length);

  let passed =
    userTurns >= (step.minTurns || 1) &&
    summary.score >= minimumPassScore &&
    avgEval >= minimumAverageTurnScore;

  const battle = await BossBattle.findOne({ conversationId: conv._id });
  let bossWin = false;
  let bossLoss = false;

  if (step.type === "boss" && battle) {
    const req = battle.tasksRequired || 0;
    const tasksOk = req === 0 || battle.tasksCompleted >= req;
    bossWin = battle.bossHPCurrent <= 0 && tasksOk && battle.playerHPCurrent > 0;
    bossLoss = battle.playerHPCurrent <= 0 || (!bossWin && battle.bossHPCurrent > 0 && userTurns >= 20);

    if (bossWin) {
      passed = true;
      battle.result = "win";
      battle.xpBonus = map.bossXPReward || 0;
      await battle.save();
    } else if (bossLoss || battle.playerHPCurrent <= 0) {
      passed = false;
      battle.result = battle.playerHPCurrent <= 0 ? "loss" : "loss";
      await battle.save();
    } else {
      passed = false;
    }
  }

  const endedAt = new Date();
  const durationSec = Math.max(
    0,
    Math.round((endedAt.getTime() - new Date(conv.startedAt).getTime()) / 1000)
  );

  conv.endedAt = endedAt;
  conv.durationSec = durationSec;
  conv.status = passed ? "completed" : "failed";
  conv.score = summary.score;
  conv.aiFeedback = summary.summary;
  conv.goalsAchieved = summary.goalsAchieved || [];

  const progress = await UserMapProgress.findOne({
    userId,
    mapId: conv.mapId,
  });

  if (!progress) {
    const err = new Error("Progress not found");
    err.statusCode = 500;
    throw err;
  }

  const steps = await listStepsForMap(step.mapId);
  const currentProgressIndex =
    progress.status === "completed"
      ? steps.length
      : progress.currentStepId
        ? steps.findIndex(
          (item) => String(item._id) === String(progress.currentStepId)
        )
        : 0;
  const safeCurrentProgressIndex =
    currentProgressIndex >= 0 ? currentProgressIndex : 0;
  const requestedStepIndex = steps.findIndex(
    (item) => String(item._id) === String(step._id)
  );
  const isReplayAttempt =
    progress.status === "completed" ||
    (safeCurrentProgressIndex >= 0 &&
      requestedStepIndex >= 0 &&
      requestedStepIndex < safeCurrentProgressIndex);
  const isCurrentProgressStep =
    progress.status !== "completed" &&
    progress.currentStepId &&
    String(progress.currentStepId) === String(step._id);

  let xpEarned = 0;
  if (passed && isCurrentProgressStep && step.type === "lesson") {
    xpEarned = step.xpReward || 0;
  } else if (passed && isCurrentProgressStep && step.type === "boss" && battle) {
    xpEarned = (step.xpReward || 0) + (battle.xpBonus || 0);
  }

  conv.xpEarned = xpEarned;
  await conv.save();

  await User.updateOne(
    { _id: userId },
    {
      $inc: { exp: xpEarned },
      $set: { lastActiveAt: new Date() },
    }
  );

  const requiredMapXP = getMapRequiredXP(map);

  if (passed && isCurrentProgressStep) {
    if (xpEarned > 0) {
      progress.totalXPEarned = (progress.totalXPEarned || 0) + xpEarned;
    }
    progress.updatedAt = new Date();

    const next = await getNextStepAfter(step._id, step.mapId);
    const completedCount = steps.filter((item) => item.order <= step.order).length;
    const meetsMapXPRequirement =
      (progress.totalXPEarned || 0) >= requiredMapXP;

    if (next) {
      progress.currentStepId = next._id;
      if (summary.score >= 85) progress.stars = Math.min(3, (progress.stars || 0) + 1);
      progress.stepsCompleted = Math.max(progress.stepsCompleted || 0, completedCount);
    } else {
      progress.stepsCompleted = steps.length;
      if (step.type === "boss") {
        progress.bossDefeated = true;
      }

      if (meetsMapXPRequirement) {
        progress.currentStepId = null;
        progress.status = "completed";
        progress.completedAt = new Date();
        await unlockMapById(userId, map.unlocksMapId);
        await unlockMapsAfterPrerequisiteCompleted(userId, map._id);
        await unlockNextMapInLevelOrder(userId, map._id);
      } else {
        progress.currentStepId = step._id;
      }
    }

    await progress.save();

    if (step.type === "boss" && bossWin) {
      await tryGrantFirstBossWin(userId);
    }
  } else if (!passed && step.type === "boss" && !isReplayAttempt) {
    progress.bossAttempts = (progress.bossAttempts || 0) + 1;
    progress.updatedAt = new Date();
    await progress.save();
  }

  return {
    conversation: conv,
    passed,
    bossWin,
    summary,
    userTurns,
    minimumPassScore,
    requiredMapXP,
    currentMapXP: progress.totalXPEarned || 0,
    mapCompleted: progress.status === "completed",
    replayAttempt: isReplayAttempt,
  };
}

export async function getBossBattleForConversation(conversationId, userId) {
  return BossBattle.findOne({ conversationId, userId }).lean();
}
