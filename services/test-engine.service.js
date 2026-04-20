// Service quản lý bài kiểm tra cấp độ
import mongoose from "mongoose";
import { LevelTest, LevelTestAttempt, UserLevel } from "../models/index.js";

/**
 * Create a new level test
 * @param {Object} testData - Test data
 * @param {string} createdBy - Admin user ID
 * @returns {Promise<Object>} Created test
 */
export async function createLevelTest(testData, createdBy) {
  const { level, name, description, sections, passThreshold, timeLimit, isActive } = testData;

  // Validation
  if (!level || level < 1 || level > 6) {
    throw new Error("Level must be between 1 and 6");
  }

  if (!name || name.trim().length === 0) {
    throw new Error("Test name is required");
  }

  if (!sections || sections.length === 0) {
    throw new Error("Test must have at least one section");
  }

  // Validate each section has at least one question
  for (const section of sections) {
    if (!section.questions || section.questions.length === 0) {
      throw new Error(`Section "${section.sectionName}" must have at least one question`);
    }
  }

  if (passThreshold < 0 || passThreshold > 100) {
    throw new Error("Pass threshold must be between 0 and 100");
  }

  if (timeLimit < 1) {
    throw new Error("Time limit must be at least 1 minute");
  }

  const test = await LevelTest.create({
    level,
    name,
    description: description || "",
    sections,
    passThreshold,
    timeLimit,
    isActive: isActive !== undefined ? isActive : true,
    createdBy: new mongoose.Types.ObjectId(createdBy),
  });

  return test;
}

/**
 * Update an existing level test
 * @param {string} testId - Test ID
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object>} Updated test
 */
export async function updateLevelTest(testId, updates) {
  const test = await LevelTest.findById(testId);
  if (!test) {
    throw new Error("Test not found");
  }

  // Validate updates
  if (updates.level !== undefined && (updates.level < 1 || updates.level > 6)) {
    throw new Error("Level must be between 1 and 6");
  }

  if (updates.sections !== undefined) {
    if (updates.sections.length === 0) {
      throw new Error("Test must have at least one section");
    }
    for (const section of updates.sections) {
      if (!section.questions || section.questions.length === 0) {
        throw new Error(`Section "${section.sectionName}" must have at least one question`);
      }
    }
  }

  if (updates.passThreshold !== undefined) {
    if (updates.passThreshold < 0 || updates.passThreshold > 100) {
      throw new Error("Pass threshold must be between 0 and 100");
    }
  }

  if (updates.timeLimit !== undefined && updates.timeLimit < 1) {
    throw new Error("Time limit must be at least 1 minute");
  }

  // Apply updates
  Object.assign(test, updates);
  await test.save();

  return test;
}

/**
 * Toggle test active status
 * @param {string} testId - Test ID
 * @param {boolean} isActive - Active status
 * @returns {Promise<Object>} Updated test
 */
export async function toggleTestActive(testId, isActive) {
  const test = await LevelTest.findById(testId);
  if (!test) {
    throw new Error("Test not found");
  }

  test.isActive = isActive;
  await test.save();

  return test;
}

/**
 * Check if active tests exist for a level
 * @param {number} level - Level number
 * @returns {Promise<boolean>} True if active tests exist
 */
export async function hasActiveTests(level) {
  const count = await LevelTest.countDocuments({ level, isActive: true });
  return count > 0;
}

/**
 * Randomly select a test from active tests for a level
 * @param {number} level - Level number
 * @returns {Promise<Object>} Selected test
 */
export async function selectRandomTest(level) {
  const activeTests = await LevelTest.find({ level, isActive: true }).lean();

  if (activeTests.length === 0) {
    throw new Error("No active tests available for this level");
  }

  // Uniform random selection
  const randomIndex = Math.floor(Math.random() * activeTests.length);
  return activeTests[randomIndex];
}

/**
 * Start a test attempt
 * @param {string} userId - User ID
 * @param {string} testId - Test ID
 * @returns {Promise<Object>} Test attempt with randomized questions
 */
export async function startTestAttempt(userId, testId) {
  const uid = new mongoose.Types.ObjectId(userId);
  const tid = new mongoose.Types.ObjectId(testId);

  // Get test
  const test = await LevelTest.findById(tid).lean();
  if (!test) {
    throw new Error("Test not found");
  }

  if (!test.isActive) {
    throw new Error("Test is not active");
  }

  // Get user level
  const userLevel = await UserLevel.findOne({ userId: uid });
  if (!userLevel) {
    throw new Error("User level not found");
  }

  // Check eligibility (XP threshold)
  const nextLevelThreshold = userLevel.nextLevelThreshold;
  if (userLevel.totalXp < nextLevelThreshold) {
    throw new Error("Insufficient XP to take this test");
  }

  // Check cooldown (24 hours)
  if (userLevel.lastTestAttemptAt) {
    const hoursSinceLastAttempt =
      (Date.now() - userLevel.lastTestAttemptAt.getTime()) / (1000 * 60 * 60);
    if (hoursSinceLastAttempt < 24) {
      const hoursRemaining = Math.ceil(24 - hoursSinceLastAttempt);
      throw new Error(`Please wait ${hoursRemaining} hours before retrying`);
    }
  }

  // Check retry XP requirement (if failed before)
  if (userLevel.xpAtLastFailedTest !== null) {
    const xpGainedSinceFailure = userLevel.totalXp - userLevel.xpAtLastFailedTest;
    const retryXpRequired = Math.floor(nextLevelThreshold * 0.5);
    if (xpGainedSinceFailure < retryXpRequired) {
      throw new Error(
        `You need ${retryXpRequired - xpGainedSinceFailure} more XP to retry this test`
      );
    }
  }

  // Randomize question order within sections
  const randomizedSections = test.sections.map((section) => {
    const questions = [...section.questions];
    // Fisher-Yates shuffle
    for (let i = questions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [questions[i], questions[j]] = [questions[j], questions[i]];
    }
    return {
      ...section,
      questions,
    };
  });

  // Create test attempt
  const attempt = await LevelTestAttempt.create({
    userId: uid,
    testId: tid,
    level: test.level,
    answers: [],
    sectionScores: [],
    totalScore: 0,
    passed: false,
    startedAt: new Date(),
    completedAt: null,
    timeSpent: 0,
  });

  // Update user level
  userLevel.lastTestAttemptAt = new Date();
  await userLevel.save();

  // Return test data without correct answers
  const sanitizedSections = randomizedSections.map((section) => ({
    sectionName: section.sectionName,
    weight: section.weight,
    questions: section.questions.map((q) => ({
      questionText: q.questionText,
      questionType: q.questionType,
      options: q.options
        ? q.options.map((opt) => ({ text: opt.text }))
        : undefined,
      pairs: q.pairs,
      points: q.points,
    })),
  }));

  return {
    attemptId: attempt._id.toString(),
    testId: test._id.toString(),
    testName: test.name,
    level: test.level,
    sections: sanitizedSections,
    timeLimit: test.timeLimit,
    passThreshold: test.passThreshold,
    startedAt: attempt.startedAt,
  };
}

/**
 * Submit test attempt and calculate score
 * @param {string} attemptId - Attempt ID
 * @param {Array} answers - User answers
 * @returns {Promise<Object>} Test results
 */
export async function submitTestAttempt(attemptId, answers) {
  const aid = new mongoose.Types.ObjectId(attemptId);

  // Get attempt
  const attempt = await LevelTestAttempt.findById(aid);
  if (!attempt) {
    throw new Error("Test attempt not found");
  }

  if (attempt.completedAt) {
    throw new Error("Test already submitted");
  }

  // Get test
  const test = await LevelTest.findById(attempt.testId).lean();
  if (!test) {
    throw new Error("Test not found");
  }

  // Calculate time spent
  const timeSpent = Math.floor((Date.now() - attempt.startedAt.getTime()) / 1000);

  // Grade answers
  const gradedAnswers = [];
  const sectionScores = [];

  for (let sectionIndex = 0; sectionIndex < test.sections.length; sectionIndex++) {
    const section = test.sections[sectionIndex];
    let sectionPointsEarned = 0;
    let sectionMaxPoints = 0;

    for (let questionIndex = 0; questionIndex < section.questions.length; questionIndex++) {
      const question = section.questions[questionIndex];
      const userAnswer = answers.find(
        (a) => a.sectionIndex === sectionIndex && a.questionIndex === questionIndex
      );

      sectionMaxPoints += question.points;

      let isCorrect = false;
      let pointsEarned = 0;

      if (userAnswer) {
        // Check correctness based on question type
        if (question.questionType === "mcq") {
          const correctOption = question.options.find((opt) => opt.isCorrect);
          if (correctOption && userAnswer.userAnswer === correctOption.text) {
            isCorrect = true;
            pointsEarned = question.points;
          }
        } else if (question.questionType === "fill_blank") {
          if (
            userAnswer.userAnswer &&
            userAnswer.userAnswer.toLowerCase().trim() ===
              question.correctAnswer.toLowerCase().trim()
          ) {
            isCorrect = true;
            pointsEarned = question.points;
          }
        } else if (question.questionType === "matching") {
          // For matching, userAnswer should be an array of pairs
          if (Array.isArray(userAnswer.userAnswer)) {
            const correctPairs = question.pairs;
            let correctMatches = 0;
            for (const pair of userAnswer.userAnswer) {
              const matchingPair = correctPairs.find(
                (cp) => cp.left === pair.left && cp.right === pair.right
              );
              if (matchingPair) {
                correctMatches++;
              }
            }
            if (correctMatches === correctPairs.length) {
              isCorrect = true;
              pointsEarned = question.points;
            }
          }
        }
      }

      if (isCorrect) {
        sectionPointsEarned += pointsEarned;
      }

      gradedAnswers.push({
        sectionIndex,
        questionIndex,
        userAnswer: userAnswer ? userAnswer.userAnswer : null,
        isCorrect,
        pointsEarned,
      });
    }

    const sectionPercentage =
      sectionMaxPoints > 0 ? (sectionPointsEarned / sectionMaxPoints) * 100 : 0;

    sectionScores.push({
      sectionName: section.sectionName,
      score: sectionPointsEarned,
      maxScore: sectionMaxPoints,
      percentage: Math.round(sectionPercentage * 100) / 100,
    });
  }

  // Calculate weighted total score
  const totalWeight = test.sections.reduce((sum, s) => sum + s.weight, 0);
  let weightedScore = 0;

  for (let i = 0; i < sectionScores.length; i++) {
    const sectionWeight = test.sections[i].weight;
    const sectionPercentage = sectionScores[i].percentage;
    weightedScore += (sectionPercentage * sectionWeight) / totalWeight;
  }

  const totalScore = Math.round(weightedScore * 100) / 100;
  const passed = totalScore >= test.passThreshold;

  // Update attempt
  attempt.answers = gradedAnswers;
  attempt.sectionScores = sectionScores;
  attempt.totalScore = totalScore;
  attempt.passed = passed;
  attempt.completedAt = new Date();
  attempt.timeSpent = timeSpent;
  await attempt.save();

  // Update user level based on result
  const userLevel = await UserLevel.findOne({ userId: attempt.userId });
  if (userLevel) {
    if (!passed) {
      // Failed: record XP at failure for retry requirement
      userLevel.xpAtLastFailedTest = userLevel.totalXp;
    }
    await userLevel.save();
  }

  return {
    attemptId: attempt._id.toString(),
    totalScore,
    sectionScores,
    passed,
    passThreshold: test.passThreshold,
    timeSpent,
  };
}

/**
 * Check if user can retry a test
 * @param {string} userId - User ID
 * @param {number} level - Level number
 * @returns {Promise<Object>} Retry eligibility info
 */
export async function canRetakeTest(userId, level) {
  const uid = new mongoose.Types.ObjectId(userId);

  const userLevel = await UserLevel.findOne({ userId: uid });
  if (!userLevel) {
    throw new Error("User level not found");
  }

  // Check cooldown
  let cooldownRemaining = null;
  if (userLevel.lastTestAttemptAt) {
    const hoursSinceLastAttempt =
      (Date.now() - userLevel.lastTestAttemptAt.getTime()) / (1000 * 60 * 60);
    if (hoursSinceLastAttempt < 24) {
      cooldownRemaining = Math.ceil((24 - hoursSinceLastAttempt) * 3600); // in seconds
    }
  }

  // Check XP requirement
  let xpNeededForRetry = null;
  if (userLevel.xpAtLastFailedTest !== null) {
    const nextLevelThreshold = userLevel.nextLevelThreshold;
    const xpGainedSinceFailure = userLevel.totalXp - userLevel.xpAtLastFailedTest;
    const retryXpRequired = Math.floor(nextLevelThreshold * 0.5);
    if (xpGainedSinceFailure < retryXpRequired) {
      xpNeededForRetry = retryXpRequired - xpGainedSinceFailure;
    }
  }

  const canRetry = cooldownRemaining === null && xpNeededForRetry === null;

  return {
    canRetry,
    cooldownRemaining,
    xpNeededForRetry,
  };
}

/**
 * Get test list with optional filters
 * @param {Object} filters - Filter options
 * @returns {Promise<Array>} List of tests
 */
export async function getTestList(filters = {}) {
  const query = {};

  if (filters.level !== undefined) {
    query.level = filters.level;
  }

  if (filters.isActive !== undefined) {
    query.isActive = filters.isActive;
  }

  const tests = await LevelTest.find(query)
    .populate("createdBy", "fullName email")
    .sort({ level: 1, createdAt: -1 })
    .lean();

  // Calculate statistics for each test
  const testsWithStats = await Promise.all(
    tests.map(async (test) => {
      const attempts = await LevelTestAttempt.find({ testId: test._id }).lean();
      const totalAttempts = attempts.length;
      const passedAttempts = attempts.filter((a) => a.passed).length;
      const passRate = totalAttempts > 0 ? (passedAttempts / totalAttempts) * 100 : 0;
      const averageScore =
        totalAttempts > 0
          ? attempts.reduce((sum, a) => sum + a.totalScore, 0) / totalAttempts
          : 0;

      const questionCount = test.sections.reduce(
        (sum, s) => sum + s.questions.length,
        0
      );

      return {
        testId: test._id.toString(),
        level: test.level,
        name: test.name,
        description: test.description,
        sectionCount: test.sections.length,
        questionCount,
        passThreshold: test.passThreshold,
        timeLimit: test.timeLimit,
        isActive: test.isActive,
        createdBy: test.createdBy ? test.createdBy.fullName : "Unknown",
        createdAt: test.createdAt,
        statistics: {
          totalAttempts,
          passRate: Math.round(passRate * 100) / 100,
          averageScore: Math.round(averageScore * 100) / 100,
        },
      };
    })
  );

  return testsWithStats;
}

/**
 * Delete a test (soft delete - mark as inactive)
 * @param {string} testId - Test ID
 * @returns {Promise<void>}
 */
export async function deleteTest(testId) {
  const test = await LevelTest.findById(testId);
  if (!test) {
    throw new Error("Test not found");
  }

  test.isActive = false;
  await test.save();
}
