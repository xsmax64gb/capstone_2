// Controller cho API quản lý bài kiểm tra (admin)
import {
  createLevelTest,
  updateLevelTest,
  toggleTestActive,
  getTestList,
  deleteTest,
} from "../services/test-engine.service.js";
import { generateLevelTestWithAi } from "../services/level-test-ai.service.js";

/**
 * POST /api/admin/level-test/generate-ai
 * Generate a level test using AI
 */
export async function generateTestWithAi(req, res) {
  try {
    const userId = req.user?.id;
    const userRole = req.user?.role;

    if (!userId || userRole !== "admin") {
      return res.status(403).json({
        success: false,
        error: {
          code: "ADMIN_ONLY",
          message: "This endpoint requires admin role",
          timestamp: new Date().toISOString(),
        },
      });
    }

    const { level, testName, description, numberOfQuestions, focusAreas, difficulty, additionalInstructions } = req.body;

    if (!level || !testName) {
      return res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Level and test name are required",
          timestamp: new Date().toISOString(),
        },
      });
    }

    const { testData, model } = await generateLevelTestWithAi({
      level,
      testName,
      description,
      numberOfQuestions,
      focusAreas,
      difficulty,
      additionalInstructions,
    });

    return res.status(200).json({
      success: true,
      data: {
        testData,
        model,
      },
    });
  } catch (error) {
    console.error("[AdminLevelTest] Error generating test with AI:", error);

    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_ERROR",
        message: error.message || "Failed to generate test with AI",
        timestamp: new Date().toISOString(),
      },
    });
  }
}

/**
 * POST /api/admin/level-test/create
 * Create a new level test
 */
export async function createTest(req, res) {
  try {
    const userId = req.user?.id;
    const userRole = req.user?.role;

    if (!userId || userRole !== "admin") {
      return res.status(403).json({
        success: false,
        error: {
          code: "ADMIN_ONLY",
          message: "This endpoint requires admin role",
          timestamp: new Date().toISOString(),
        },
      });
    }

    const testData = req.body;

    const test = await createLevelTest(testData, userId);

    return res.status(201).json({
      success: true,
      data: {
        testId: test._id.toString(),
        message: "Test created successfully",
      },
    });
  } catch (error) {
    console.error("[AdminLevelTest] Error creating test:", error);

    if (error.message.includes("must")) {
      return res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: error.message,
          timestamp: new Date().toISOString(),
        },
      });
    }

    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "Failed to create test",
        timestamp: new Date().toISOString(),
      },
    });
  }
}

/**
 * PUT /api/admin/level-test/:testId
 * Update an existing test
 */
export async function updateTest(req, res) {
  try {
    const userId = req.user?.id;
    const userRole = req.user?.role;

    if (!userId || userRole !== "admin") {
      return res.status(403).json({
        success: false,
        error: {
          code: "ADMIN_ONLY",
          message: "This endpoint requires admin role",
          timestamp: new Date().toISOString(),
        },
      });
    }

    const { testId } = req.params;
    const updates = req.body;

    const test = await updateLevelTest(testId, updates);

    return res.status(200).json({
      success: true,
      data: {
        testId: test._id.toString(),
        message: "Test updated successfully",
      },
    });
  } catch (error) {
    console.error("[AdminLevelTest] Error updating test:", error);

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

    if (error.message.includes("must")) {
      return res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: error.message,
          timestamp: new Date().toISOString(),
        },
      });
    }

    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "Failed to update test",
        timestamp: new Date().toISOString(),
      },
    });
  }
}

/**
 * PATCH /api/admin/level-test/:testId/toggle
 * Activate or deactivate a test
 */
export async function toggleTest(req, res) {
  try {
    const userId = req.user?.id;
    const userRole = req.user?.role;

    if (!userId || userRole !== "admin") {
      return res.status(403).json({
        success: false,
        error: {
          code: "ADMIN_ONLY",
          message: "This endpoint requires admin role",
          timestamp: new Date().toISOString(),
        },
      });
    }

    const { testId } = req.params;
    const { isActive } = req.body;

    if (typeof isActive !== "boolean") {
      return res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "isActive must be a boolean",
          timestamp: new Date().toISOString(),
        },
      });
    }

    const test = await toggleTestActive(testId, isActive);

    return res.status(200).json({
      success: true,
      data: {
        testId: test._id.toString(),
        isActive: test.isActive,
      },
    });
  } catch (error) {
    console.error("[AdminLevelTest] Error toggling test:", error);

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

    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "Failed to toggle test",
        timestamp: new Date().toISOString(),
      },
    });
  }
}

/**
 * GET /api/admin/level-test/list
 * List all tests with optional filtering
 */
export async function listTests(req, res) {
  try {
    const userId = req.user?.id;
    const userRole = req.user?.role;

    if (!userId || userRole !== "admin") {
      return res.status(403).json({
        success: false,
        error: {
          code: "ADMIN_ONLY",
          message: "This endpoint requires admin role",
          timestamp: new Date().toISOString(),
        },
      });
    }

    const filters = {};

    if (req.query.level) {
      filters.level = parseInt(req.query.level, 10);
    }

    if (req.query.isActive !== undefined) {
      filters.isActive = req.query.isActive === "true";
    }

    const tests = await getTestList(filters);

    return res.status(200).json({
      success: true,
      data: {
        tests,
      },
    });
  } catch (error) {
    console.error("[AdminLevelTest] Error listing tests:", error);
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "Failed to list tests",
        timestamp: new Date().toISOString(),
      },
    });
  }
}

/**
 * DELETE /api/admin/level-test/:testId
 * Delete a test (soft delete - mark as inactive)
 */
export async function removeTest(req, res) {
  try {
    const userId = req.user?.id;
    const userRole = req.user?.role;

    if (!userId || userRole !== "admin") {
      return res.status(403).json({
        success: false,
        error: {
          code: "ADMIN_ONLY",
          message: "This endpoint requires admin role",
          timestamp: new Date().toISOString(),
        },
      });
    }

    const { testId } = req.params;

    await deleteTest(testId);

    return res.status(200).json({
      success: true,
      data: {
        message: "Test deleted successfully",
      },
    });
  } catch (error) {
    console.error("[AdminLevelTest] Error deleting test:", error);

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

    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "Failed to delete test",
        timestamp: new Date().toISOString(),
      },
    });
  }
}
