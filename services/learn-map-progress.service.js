import mongoose from "mongoose";

import {
  Map as LearnMap,
  Step,
  UserMapProgress,
} from "../models/index.js";
import {
  LEARN_MAP_SORT,
  getMapRequiredXP,
} from "../helper/learn-rules.js";

async function getFirstStepByMapIdMap() {
  const firstSteps = await Step.aggregate([
    { $sort: { mapId: 1, order: 1 } },
    { $group: { _id: "$mapId", stepId: { $first: "$_id" } } },
  ]);

  return new Map(firstSteps.map((row) => [String(row._id), row.stepId]));
}

function shouldAutoUnlockInitialMap(map, firstMap) {
  if (!firstMap) return false;
  if (String(map._id) === String(firstMap._id)) return true;
  return !map.prerequisiteMapId && Number(map.level) === Number(firstMap.level);
}

/**
 * Ensure every published map has a progress row for this user.
 * Rule: the first published level starts as active; later maps stay locked
 * until unlocked by completing previous progression.
 * Does not downgrade maps already completed/active.
 */
export async function ensureUserMapProgress(userId) {
  const uid = new mongoose.Types.ObjectId(userId);
  const maps = await LearnMap.find({ isPublished: true }).sort(LEARN_MAP_SORT).lean();
  if (!maps.length) return;

  const existing = await UserMapProgress.find({ userId: uid });
  const byMap = new Map(existing.map((p) => [String(p.mapId), p]));
  const firstStepByMap = await getFirstStepByMapIdMap();
  const firstMap = maps[0];

  for (const map of maps) {
    const idStr = String(map._id);
    const firstStepId = firstStepByMap.get(idStr) || null;
    const progress = byMap.get(idStr);
    const shouldUnlock = shouldAutoUnlockInitialMap(map, firstMap);

    if (!progress) {
      const status = shouldUnlock ? "active" : "locked";

      await UserMapProgress.create({
        userId: uid,
        mapId: map._id,
        status,
        unlockedAt: status === "active" ? new Date() : null,
        currentStepId: status === "active" ? firstStepId : null,
        updatedAt: new Date(),
      });
      continue;
    }

    let dirty = false;

    if (
      progress.status === "locked" &&
      !progress.completedAt &&
      shouldUnlock
    ) {
      progress.status = "active";
      progress.unlockedAt = progress.unlockedAt || new Date();
      dirty = true;
    }

    if (
      progress.status === "active" &&
      !progress.currentStepId &&
      !progress.completedAt &&
      firstStepId
    ) {
      progress.currentStepId = firstStepId;
      dirty = true;
    }

    if (dirty) {
      progress.updatedAt = new Date();
      await progress.save();
    }
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

export async function unlockNextMapInLevelOrder(userId, completedMapId) {
  const maps = await LearnMap.find({ isPublished: true })
    .sort(LEARN_MAP_SORT)
    .select("_id")
    .lean();

  const currentIndex = maps.findIndex(
    (map) => String(map._id) === String(completedMapId)
  );

  if (currentIndex < 0) return null;

  const nextMap = maps
    .slice(currentIndex + 1)
    .find((map) => String(map._id) !== String(completedMapId));

  if (!nextMap) return null;

  await unlockMapById(userId, nextMap._id);
  return nextMap._id;
}

export async function recalculateMapTotalXP(mapId) {
  const [map, steps] = await Promise.all([
    LearnMap.findById(mapId),
    Step.find({ mapId }).select("xpReward").lean(),
  ]);

  if (!map) return null;

  const stepXP = steps.reduce(
    (sum, step) => sum + Math.max(0, Number(step.xpReward) || 0),
    0
  );
  const totalXP = stepXP + Math.max(0, Number(map.bossXPReward) || 0);

  map.totalXP = totalXP;
  if (map.requiredXPToComplete > 0 && totalXP > 0) {
    map.requiredXPToComplete = getMapRequiredXP({
      totalXP,
      requiredXPToComplete: map.requiredXPToComplete,
    });
  }

  await map.save();
  return map.toObject();
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
