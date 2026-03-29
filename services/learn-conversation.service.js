import {
  BossBattle,
  LearnConversation,
  LearnMessage,
  Map as LearnMap,
  Step,
  User,
  UserMapProgress,
} from "../models/index.js";
import { runLearnTurn, runSessionSummary } from "./learn-openai.service.js";
import {
  ensureUserMapProgress,
  getNextStepAfter,
  listStepsForMap,
  unlockMapById,
  unlockMapsAfterPrerequisiteCompleted,
} from "./learn-map-progress.service.js";
import { tryGrantFirstBossWin } from "./learn-achievement.service.js";

const BOSS_DAMAGE_GOOD = 18;
const BOSS_DAMAGE_OK = 8;
const PLAYER_DAMAGE_BAD = 12;

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

function passesCriteriaHeuristic(userTexts, passCriteria) {
  if (!passCriteria?.length) return true;
  const blob = userTexts.join(" ").toLowerCase();
  let hit = 0;
  for (const c of passCriteria) {
    const term = String(c).toLowerCase().trim();
    if (term && blob.includes(term)) hit += 1;
  }
  return hit >= Math.ceil(passCriteria.length / 2);
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

  const expectedStepId = progress.currentStepId
    ? String(progress.currentStepId)
    : null;
  if (expectedStepId && expectedStepId !== String(stepId)) {
    const err = new Error("Complete earlier steps first");
    err.statusCode = 409;
    throw err;
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

export async function sendLearnMessage(userId, conversationId, content) {
  const text = String(content || "").trim();
  if (!text) {
    const err = new Error("Message required");
    err.statusCode = 400;
    throw err;
  }

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

  const step = await Step.findById(conv.stepId).lean();
  const user = await User.findById(userId)
    .select("nativeLanguage targetLanguage")
    .lean();

  const history = await LearnMessage.find({ conversationId: conv._id })
    .sort({ timestamp: 1 })
    .select("role content")
    .lean();

  const historyForLlm = history.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const battle = await BossBattle.findOne({ conversationId: conv._id }).lean();
  const bossTasksForLlm = battle?.tasks?.map((t) => ({
    id: t.id,
    description: t.description,
  })) || [];

  const aiResult = await runLearnTurn({
    systemPrompt: step.aiSystemPrompt || step.scenarioContext || step.title,
    localeHint: buildLocaleHint(user),
    history: historyForLlm,
    userMessage: text,
    bossTasks: bossTasksForLlm,
  });

  const grammarErrors = normalizeGrammarErrors(aiResult.grammarErrors);

  const userMsg = await LearnMessage.create({
    conversationId: conv._id,
    role: "user",
    content: text,
    timestamp: new Date(),
    grammarErrors,
    vocabularyUsed: aiResult.vocabularyUsed,
    suggestion: aiResult.suggestion,
    evaluationScore: aiResult.turnQualityScore,
  });

  await LearnMessage.create({
    conversationId: conv._id,
    role: "ai",
    content: aiResult.reply || "...",
    timestamp: new Date(),
  });

  await LearnConversation.updateOne(
    { _id: conv._id },
    {
      $inc: { mistakeCount: grammarErrors.length },
    }
  );

  let battleAfter = battle;
  if (battle) {
    const bDoc = await BossBattle.findById(battle._id);
    battleAfter = await applyBossTurn(
      bDoc,
      aiResult.turnQualityScore,
      grammarErrors,
      aiResult.tasksCompletedIds
    );
  }

  const allMessages = await LearnMessage.find({ conversationId: conv._id })
    .sort({ timestamp: 1 })
    .lean();

  return {
    userMessage: userMsg,
    bossBattle: battleAfter,
    messages: allMessages,
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

  const summary = await runSessionSummary({
    transcript: fullTranscript,
    passCriteria: step.passCriteria || [],
  });

  const userTurns = userMsgs.length;
  const avgEval =
    userMsgs.reduce((s, m) => s + (m.evaluationScore ?? 50), 0) /
    Math.max(1, userMsgs.length);

  const criteriaOk = passesCriteriaHeuristic(
    userMsgs.map((m) => m.content),
    step.passCriteria || []
  );

  let passed =
    userTurns >= (step.minTurns || 1) &&
    criteriaOk &&
    summary.score >= 50 &&
    avgEval >= 45;

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

  let xpEarned = 0;
  if (passed && step.type === "lesson") {
    xpEarned = step.xpReward || 0;
  } else if (passed && step.type === "boss" && battle) {
    xpEarned = (step.xpReward || 0) + (battle.xpBonus || 0);
  }

  conv.xpEarned = xpEarned;
  await conv.save();

  const progress = await UserMapProgress.findOne({
    userId,
    mapId: conv.mapId,
  });

  if (!progress) {
    const err = new Error("Progress not found");
    err.statusCode = 500;
    throw err;
  }

  await User.updateOne(
    { _id: userId },
    {
      $inc: { exp: xpEarned },
      $set: { lastActiveAt: new Date() },
    }
  );

  if (passed) {
    if (xpEarned > 0) {
      progress.totalXPEarned = (progress.totalXPEarned || 0) + xpEarned;
    }
    progress.updatedAt = new Date();

    const next = await getNextStepAfter(step._id, step.mapId);
    if (next) {
      progress.currentStepId = next._id;
      if (summary.score >= 85) progress.stars = Math.min(3, (progress.stars || 0) + 1);
      progress.stepsCompleted = (progress.stepsCompleted || 0) + 1;
    } else {
      progress.currentStepId = null;
      progress.status = "completed";
      progress.completedAt = new Date();
      progress.stepsCompleted = (await listStepsForMap(step.mapId)).length;
      if (step.type === "boss") {
        progress.bossDefeated = true;
      }
      await unlockMapById(userId, map.unlocksMapId);
      await unlockMapsAfterPrerequisiteCompleted(userId, map._id);
    }

    await progress.save();

    if (step.type === "boss" && bossWin) {
      await tryGrantFirstBossWin(userId);
    }
  } else if (step.type === "boss") {
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
  };
}

export async function getBossBattleForConversation(conversationId, userId) {
  return BossBattle.findOne({ conversationId, userId }).lean();
}
