const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];
const USER_ROLES = ["user", "admin"];
const PLACEMENT_SKILL_TYPES = ["vocab", "grammar", "reading", "listening"];
const EXERCISE_TYPES = ["mcq", "fill_blank", "matching"];
const EXERCISE_SOURCES = ["catalog", "ai_pdf", "ai_prompt"];
const AI_STAGE_TYPES = ["normal", "boss"];
const AI_SESSION_STATUSES = ["in_progress", "completed", "failed"];
const AI_MESSAGE_SENDERS = ["ai", "user", "system"];
const PROGRESS_STATUSES = ["new", "learning", "reviewing", "mastered"];
const MAP_PROGRESS_STATUSES = ["locked", "active", "completed"];
const STEP_TYPES = ["lesson", "boss"];
const LEARN_SCORING_DIFFICULTIES = ["easy", "medium", "hard"];
const LEARN_CONVERSATION_STATUSES = ["in_progress", "completed", "failed"];
const LEARN_MESSAGE_ROLES = ["user", "ai"];
const BOSS_RESULTS = ["win", "loss", "timeout"];
const PAYMENT_METHODS = ["bank_transfer", "cash", "card"];
const PAYMENT_STATUSES = ["pending", "paid", "failed"];

export {
  LEVELS,
  USER_ROLES,
  PLACEMENT_SKILL_TYPES,
  EXERCISE_TYPES,
  EXERCISE_SOURCES,
  AI_STAGE_TYPES,
  AI_SESSION_STATUSES,
  AI_MESSAGE_SENDERS,
  PROGRESS_STATUSES,
  MAP_PROGRESS_STATUSES,
  STEP_TYPES,
  LEARN_SCORING_DIFFICULTIES,
  LEARN_CONVERSATION_STATUSES,
  LEARN_MESSAGE_ROLES,
  BOSS_RESULTS,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
};
