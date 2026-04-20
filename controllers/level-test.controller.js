// Controller cho API bài kiểm tra cấp độ
import mongoose from "mongoose";
import {
  hasActiveTests,
  selectRandomTest,
  startTestAttempt,
  submitTestAttempt,
  canRetakeTest,
} from "../services/test-engine.service.js";
import { getUserLevelInfo, advanceUserLevel } from "../services/level-manager.service.js";

/**
 * GET /api/level-test/available
 * Check if tests are available for user's next level
 */
export async function checkTestAvailability(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "User not authenticated",
          timestamp: new Date().toISOString(),
        },
      });
    }

    // Get user's current level info
    const levelInfo = await getUserLevelInfo(userId);
    const targetLevel = levelInfo.currentLevel + 1;

    if (targetLevel > 6) {
      return res.status(200).json({
        success: true,
        data: {
          hasTest: false,
          testCount: 0,
          targetLevel: 6,
          canAttempt: false,
          reason: "max_level_reached",
        },
      });
    }

    // Check if tests exist
    const testsExist = await hasActiveTests(targetLevel);

    if (!testsExist) {
      return res.status(200).json({
        success: true,
        data: {
          hasTest: false,
          testCount: 0,
          targetLevel,
          canAttempt: false,
          reason: "no_tests_available",
        },
      });
    }

    // Check if user can attempt
    const retryInfo = await canRetakeTest(userId, targetLevel);

    return res.status(200).json({
      success: true,
      data: {
        hasTest: true,
        testCount: 1, // We don't expose exact count
        targetLevel,
        canAttempt: retryInfo.canRetry && levelInfo.testAvailable,
        cooldownRemaining: retryInfo.cooldownRemaining,
        xpNeededForRetry: retryInfo.xpNeededForRetry,
      },
    });
  } catch (error) {
    console.error("[LevelTest] Error checking test availability:", error);
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "Failed to check test availability",
        timestamp: new Date().toISOString(),
      },
    });
  }
}

/**
 * POST /api/level-test/start
 * Start a level-up test (randomly selects from active tests)
 */
export async function startTest(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "User not authenticated",
          timestamp: new Date().toISOString(),
        },
      });
    }

    const { level } = req.body;

    if (!level || level < 1 || level > 6) {
      return res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid level",
          timestamp: new Date().toISOString(),
        },
      });
    }

    // Get user's current level
    const levelInfo = await getUserLevelInfo(userId);
    const expectedLevel = levelInfo.currentLevel + 1;

    if (level !== expectedLevel) {
      return res.status(403).json({
        success: false,
        error: {
          code: "LEVEL_NOT_ELIGIBLE",
          message: "You are not eligible for this level test",
          timestamp: new Date().toISOString(),
        },
      });
    }

    // Select random test
    const test = await selectRandomTest(level);

    // Start test attempt
    const attemptData = await startTestAttempt(userId, test._id.toString());

    return res.status(200).json({
      success: true,
      data: attemptData,
    });
  } catch (error) {
    console.error("[LevelTest] Error starting test:", error);

    if (error.message.includes("wait")) {
      return res.status(429).json({
        success: false,
        error: {
          code: "COOLDOWN_ACTIVE",
          message: error.message,
          timestamp: new Date().toISOString(),
        },
      });
    }

    if (error.message.includes("XP")) {
      return res.status(403).json({
        success: false,
        error: {
          code: "INSUFFICIENT_XP_FOR_RETRY",
          message: error.message,
          timestamp: new Date().toISOString(),
        },
      });
    }

    if (error.message.includes("No active tests")) {
      return res.status(404).json({
        success: false,
        error: {
          code: "TEST_NOT_AVAILABLE",
          message: error.message,
          timestamp: new Date().toISOString(),
        },
      });
    }

    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "Failed to start test",
        timestamp: new Date().toISOString(),
      },
    });
  }
}

/**
 * POST /api/level-test/submit
 * Submit test answers and get results
 */
export async function submitTest(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "User not authenticated",
          timestamp: new Date().toISOString(),
        },
      });
    }

    const { attemptId, answers } = req.body;

    if (!attemptId || !answers || !Array.isArray(answers)) {
      return res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid request data",
          timestamp: new Date().toISOString(),
        },
      });
    }

    // Submit and score test
    const results = await submitTestAttempt(attemptId, answers);

    // If passed, advance user level
    let levelAdvanced = false;
    let newLevel = null;

    if (results.passed) {
      try {
        const advanceResult = await advanceUserLevel(
          userId,
          "test_passed",
          results.totalScore,
          attemptId
        );
        levelAdvanced = true;
        newLevel = advanceResult.newLevel;
      } catch (error) {
        console.error("[LevelTest] Error advancing level:", error);
        // Don't fail the submission if level advancement fails
      }
    }

    // Get retry info
    const levelInfo = await getUserLevelInfo(userId);
    const retryInfo = await canRetakeTest(userId, levelInfo.currentLevel + 1);

    return res.status(200).json({
      success: true,
      data: {
        attemptId: results.attemptId,
        totalScore: results.totalScore,
        sectionScores: results.sectionScores,
        passed: results.passed,
        passThreshold: results.passThreshold,
        levelAdvanced,
        newLevel,
        timeSpent: results.timeSpent,
        nextSteps: {
          canRetry: !results.passed && retryInfo.canRetry,
          cooldownEndsAt: retryInfo.cooldownRemaining
            ? new Date(Date.now() + retryInfo.cooldownRemaining * 1000).toISOString()
            : null,
          xpNeededForRetry: retryInfo.xpNeededForRetry,
        },
      },
    });
  } catch (error) {
    console.error("[LevelTest] Error submitting test:", error);

    if (error.message.includes("not found")) {
      return res.status(404).json({
        success: false,
        error: {
          code: "TEST_NOT_FOUND",
          message: error.message,
          timestamp: new Date().toISOString(),
        },
      });
    }

    if (error.message.includes("already submitted")) {
      return res.status(409).json({
        success: false,
        error: {
          code: "TEST_ALREADY_SUBMITTED",
          message: error.message,
          timestamp: new Date().toISOString(),
        },
      });
    }

    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "Failed to submit test",
        timestamp: new Date().toISOString(),
      },
    });
  }
}
