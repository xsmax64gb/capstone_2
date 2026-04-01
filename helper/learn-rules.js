export const LEARN_MAP_SORT = { level: 1, order: 1, createdAt: 1 };

export const DEFAULT_LEARN_SCORING_DIFFICULTY = "medium";

const PASS_SCORE_BY_DIFFICULTY = {
  easy: 55,
  medium: 65,
  hard: 75,
};

const TURN_SCORE_FLOOR_BY_DIFFICULTY = {
  easy: 40,
  medium: 50,
  hard: 60,
};

export function normalizeLearnScoringDifficulty(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "easy" || normalized === "hard") {
    return normalized;
  }
  return DEFAULT_LEARN_SCORING_DIFFICULTY;
}

export function normalizePositiveInt(value, fallback = 0, min = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.floor(parsed));
}

export function getStepMinimumPassScore(step = {}) {
  const explicit = Number(step.minimumPassScore);
  if (Number.isFinite(explicit) && explicit > 0) {
    return Math.max(1, Math.min(100, Math.floor(explicit)));
  }

  const difficulty = normalizeLearnScoringDifficulty(step.gradingDifficulty);
  return PASS_SCORE_BY_DIFFICULTY[difficulty];
}

export function getStepMinimumAverageTurnScore(step = {}) {
  const difficulty = normalizeLearnScoringDifficulty(step.gradingDifficulty);
  const passScore = getStepMinimumPassScore(step);
  return Math.max(TURN_SCORE_FLOOR_BY_DIFFICULTY[difficulty], passScore - 15);
}

export function getMapRequiredXP(map = {}) {
  const availableXP = Math.max(0, Number(map.totalXP) || 0);
  const configuredXP = Math.max(0, Number(map.requiredXPToComplete) || 0);

  if (configuredXP > 0 && availableXP > 0) {
    return Math.min(configuredXP, availableXP);
  }

  if (configuredXP > 0) {
    return configuredXP;
  }

  return availableXP;
}

export function normalizeLearnMapLevel(value, fallback = 1) {
  return normalizePositiveInt(value, fallback, 1);
}
