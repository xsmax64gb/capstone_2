// Service tạo bài kiểm tra cấp độ với AI
import { postOpenAiChatCompletion } from "../helper/openai.helper.js";

const getModel = () =>
  process.env.LEVEL_TEST_AI_OPENAI_MODEL ||
  process.env.LEARN_OPENAI_MODEL ||
  "gpt-4o-mini";

const LEVEL_TO_CEFR = {
  1: "A1",
  2: "A2",
  3: "B1",
  4: "B2",
  5: "C1",
  6: "C2",
};

const buildSystemPrompt = () => `You are an expert English language assessment designer creating comprehensive level tests.
You MUST output ONLY valid JSON in this exact format. No markdown, no code fences, no extra text.

Output format:
{
  "testName": "string",
  "description": "string",
  "sections": [
    {
      "sectionName": "string",
      "weight": number (0-100),
      "questions": [
        {
          "questionText": "string",
          "questionType": "mcq" | "fill_blank",
          "options": [{"text": "string", "isCorrect": boolean}],
          "correctAnswer": "string (for fill_blank)",
          "points": number
        }
      ]
    }
  ]
}

Rules:
- Create comprehensive tests that assess multiple skills (grammar, vocabulary, reading comprehension)
- Each section should have a clear focus and appropriate weight
- Questions must be appropriate for the specified CEFR level
- Include a mix of question types (MCQ and fill-in-the-blank)
- Ensure exactly one correct answer per MCQ question
- Make questions progressively harder within each section
- Total section weights should sum to 100`;

function buildUserPayload(fields) {
  const {
    level,
    testName,
    description = "",
    numberOfQuestions = 20,
    focusAreas = [],
    difficulty = "medium",
    additionalInstructions = "",
  } = fields;

  const cefrLevel = LEVEL_TO_CEFR[level] || "A1";

  const lines = [
    `Create a comprehensive English level test for CEFR level: ${cefrLevel}`,
    `Test name: ${testName}`,
    `Description: ${description}`,
    `Total number of questions: ${numberOfQuestions}`,
    `Difficulty: ${difficulty}`,
  ];

  if (focusAreas && focusAreas.length > 0) {
    lines.push(`Focus areas: ${focusAreas.join(", ")}`);
  }

  if (additionalInstructions) {
    lines.push(`Additional instructions: ${additionalInstructions}`);
  }

  lines.push("");
  lines.push("Create sections covering:");
  lines.push("1. Grammar (30-40% weight)");
  lines.push("2. Vocabulary (30-40% weight)");
  lines.push("3. Reading Comprehension (20-30% weight)");

  return lines.join("\n");
}

/**
 * Generate level test using AI
 * @param {Object} fields - Test generation parameters
 * @returns {Promise<Object>} Generated test data
 */
export async function generateLevelTestWithAi(fields) {
  const apiKey = process.env.OPENAI_API_KEY || "";
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required for AI test generation.");
  }

  const numberOfQuestions = Math.min(
    50,
    Math.max(5, Number.parseInt(String(fields.numberOfQuestions ?? 20), 10) || 20)
  );

  const model = getModel();
  const systemPrompt = buildSystemPrompt();
  const userContent = buildUserPayload({ ...fields, numberOfQuestions });

  const body = {
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ],
    temperature: 0.7,
    response_format: { type: "json_object" },
  };

  const response = await postOpenAiChatCompletion({
    apiKey,
    body,
    errorMessagePrefix: "OpenAI level test generation failed",
    maxErrorLength: 400,
    timeoutMs: Number.parseInt(process.env.LEVEL_TEST_AI_TIMEOUT_MS || "120000", 10) || 120000,
  });

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("OpenAI returned empty content for test generation.");
  }

  try {
    const testData = JSON.parse(content);
    
    // Validate structure
    if (!testData.sections || !Array.isArray(testData.sections)) {
      throw new Error("Invalid test structure: missing sections array");
    }

    // Ensure all sections have required fields
    testData.sections = testData.sections.map((section) => ({
      sectionName: section.sectionName || "Unnamed Section",
      weight: section.weight || 33,
      questions: (section.questions || []).map((q) => ({
        questionText: q.questionText || "",
        questionType: q.questionType || "mcq",
        options: q.options || [],
        correctAnswer: q.correctAnswer || "",
        points: q.points || 1,
      })),
    }));

    return {
      testData,
      model,
    };
  } catch (error) {
    console.error("Failed to parse AI response:", error);
    throw new Error("Failed to parse AI-generated test data");
  }
}
