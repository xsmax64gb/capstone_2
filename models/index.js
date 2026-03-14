import User from "./user.model.js";
import Otp from "./otp.model.js";
import PlacementTest from "./placement-test.model.js";
import Vocabulary from "./vocabulary.model.js";
import Exercise from "./exercise.model.js";
import AiLevel from "./ai-level.model.js";
import AiSession from "./ai-session.model.js";
import AiMessage from "./ai-message.model.js";
import UserProgress from "./user-progress.model.js";

export {
  User,
  Otp,
  PlacementTest,
  Vocabulary,
  Exercise, // lưu level của user sau khi làm bài test/ có thể update khi user tăng level để gợi ý bài tập phù hợp
  AiLevel, 
  AiSession,
  AiMessage,
  UserProgress,
};
