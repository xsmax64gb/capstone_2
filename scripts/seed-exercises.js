import "dotenv/config";

import connectDatabase from "../config/db.js";
import { Exercise } from "../models/index.js";
import { DEFAULT_COVER_IMAGES, EXERCISE_SEED } from "../helper/exercise.seed.js";

const toSafeInt = (value, fallback = 0) => {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const mapSeedQuestionToModel = (question, index) => {
  const options = Array.isArray(question?.options) ? question.options : [];
  const correctIndex = toSafeInt(question?.correctIndex, 0);
  const safeCorrectIndex =
    correctIndex >= 0 && correctIndex < options.length ? correctIndex : 0;

  return {
    prompt: question?.prompt || question?.question || `Question ${index + 1}`,
    question: question?.question || question?.prompt || `Question ${index + 1}`,
    options,
    correctIndex: safeCorrectIndex,
    correctAnswer: options[safeCorrectIndex] ?? options[0] ?? "",
    explanation: question?.explanation || "",
    score: 1,
  };
};

const mapSeedExerciseToModel = (exercise) => {
  const questions = Array.isArray(exercise?.questions)
    ? exercise.questions.map((item, index) => mapSeedQuestionToModel(item, index))
    : [];

  const rewardsXp = toSafeInt(exercise?.rewardsXp, 0);

  return {
    title: exercise?.title || "Exercise",
    description: exercise?.description || "",
    type: exercise?.type || "mcq",
    level: exercise?.level || "A1",
    topic: exercise?.topic || "general",
    coverImage:
      exercise?.coverImage ||
      DEFAULT_COVER_IMAGES[exercise?.topic] ||
      DEFAULT_COVER_IMAGES.general,
    skills: Array.isArray(exercise?.skills) ? exercise.skills : [],
    durationMinutes: toSafeInt(exercise?.durationMinutes, 8),
    questionCount: questions.length,
    rewardsXp,
    questions,
    rewards: {
      exp: rewardsXp,
    },
  };
};

const run = async () => {
  const force = process.argv.includes("--force") || process.argv.includes("-f");

  await connectDatabase();

  const currentCount = await Exercise.countDocuments();
  if (currentCount > 0 && !force) {
    console.log(
      `Skip seeding: exercises collection already has ${currentCount} records. Use --force to reseed.`
    );
    process.exit(0);
  }

  if (force) {
    await Exercise.deleteMany({});
    console.log("Existing exercises deleted.");
  }

  const payload = EXERCISE_SEED.map((item) => mapSeedExerciseToModel(item));
  if (payload.length === 0) {
    console.log("No seed payload found.");
    process.exit(0);
  }

  await Exercise.insertMany(payload);
  console.log(`Seeded ${payload.length} exercises successfully.`);
  process.exit(0);
};

run().catch((error) => {
  console.error("Failed to seed exercises:", error.message);
  process.exit(1);
});
