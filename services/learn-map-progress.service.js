import mongoose from "mongoose";

import {
  Map as LearnMap,
  Step,
  UserMapProgress,
} from "../models/index.js";

/**
 * Ensure every published map has a progress row for this user.
 * Rule: maps with no prerequisite start as active; others locked.
 * Does not downgrade maps already completed/active.
 */
export async function ensureUserMapProgress(userId) {
  const uid = new mongoose.Types.ObjectId(userId);
  const maps = await LearnMap.find({ isPublished: true }).sort({ order: 1 }).lean();

  const existing = await UserMapProgress.find({ userId: uid }).lean();
  const byMap = new Map(existing.map((p) => [String(p.mapId), p]));

  const firstSteps = await Step.aggregate([
    { $sort: { mapId: 1, order: 1 } },
    { $group: { _id: "$mapId", stepId: { $first: "$_id" } } },
  ]);
  const firstStepByMap = new Map(
    firstSteps.map((row) => [String(row._id), row.stepId])
  );

  for (const map of maps) {
    const idStr = String(map._id);
    if (byMap.has(idStr)) continue;

    const hasPrereq = Boolean(map.prerequisiteMapId);
    const status = hasPrereq ? "locked" : "active";
    const firstStepId = firstStepByMap.get(idStr) || null;

    await UserMapProgress.create({
      userId: uid,
      mapId: map._id,
      status,
      unlockedAt: status === "active" ? new Date() : null,
      currentStepId: status === "active" ? firstStepId : null,
      updatedAt: new Date(),
    });
  }
}

/**
 * After prerequisite map completed, unlock dependent maps (same session).
 */
export async function unlockMapsAfterPrerequisiteCompleted(userId, completedMapId) {
  const uid = new mongoose.Types.ObjectId(userId);
  const dependents = await LearnMap.find({
    isPublished: true,
    prerequisiteMapId: completedMapId,
  }).lean();

  for (const map of dependents) {
    const progress = await UserMapProgress.findOne({
      userId: uid,
      mapId: map._id,
    });
    if (!progress || progress.status !== "locked") continue;

    const firstStep = await Step.findOne({ mapId: map._id })
      .sort({ order: 1 })
      .select("_id")
      .lean();

    progress.status = "active";
    progress.unlockedAt = new Date();
    progress.currentStepId = firstStep?._id || null;
    progress.updatedAt = new Date();
    await progress.save();
  }
}

/**
 * When map A defines unlocksMapId -> B, activate B for user.
 */
export async function unlockMapById(userId, mapIdToUnlock) {
  if (!mapIdToUnlock) return;
  const uid = new mongoose.Types.ObjectId(userId);
  const progress = await UserMapProgress.findOne({
    userId: uid,
    mapId: mapIdToUnlock,
  });
  if (!progress || progress.status !== "locked") return;

  const firstStep = await Step.findOne({ mapId: mapIdToUnlock })
    .sort({ order: 1 })
    .select("_id")
    .lean();

  progress.status = "active";
  progress.unlockedAt = new Date();
  progress.currentStepId = firstStep?._id || null;
  progress.updatedAt = new Date();
  await progress.save();
}

export async function listStepsForMap(mapId) {
  return Step.find({ mapId }).sort({ order: 1 }).lean();
}

export async function getNextStepAfter(stepId, mapId) {
  const current = await Step.findById(stepId).lean();
  if (!current) return null;
  return Step.findOne({
    mapId,
    order: { $gt: current.order },
  })
    .sort({ order: 1 })
    .lean();
}
