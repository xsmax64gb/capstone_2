const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];
const USER_ROLES = ["user", "admin"];
const PLACEMENT_SKILL_TYPES = ["vocab", "grammar", "reading", "listening"];
const EXERCISE_TYPES = ["mcq", "fill_blank", "matching"];
const AI_STAGE_TYPES = ["normal", "boss"];
const AI_SESSION_STATUSES = ["in_progress", "completed", "failed"];
const AI_MESSAGE_SENDERS = ["ai", "user", "system"];
const PROGRESS_STATUSES = ["new", "learning", "reviewing", "mastered"];
const MAP_PROGRESS_STATUSES = ["locked", "active", "completed"];
const STEP_TYPES = ["lesson", "boss"];
const LEARN_CONVERSATION_STATUSES = ["in_progress", "completed", "failed"];
const LEARN_MESSAGE_ROLES = ["user", "ai"];
const BOSS_RESULTS = ["win", "loss", "timeout"];

export {
  LEVELS,
  USER_ROLES,
  PLACEMENT_SKILL_TYPES,
  EXERCISE_TYPES,
  AI_STAGE_TYPES,
  AI_SESSION_STATUSES,
  AI_MESSAGE_SENDERS,
  PROGRESS_STATUSES,
  MAP_PROGRESS_STATUSES,
  STEP_TYPES,
  LEARN_CONVERSATION_STATUSES,
  LEARN_MESSAGE_ROLES,
  BOSS_RESULTS,
};
