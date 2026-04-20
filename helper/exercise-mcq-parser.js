/**
 * Parse AI MCQ output: blocks separated by blank lines; each block has q:, a–d:, @:
 * Returns shapes ready for Exercise.questions (prompt, options, correctIndex, correctAnswer).
 */

const parseLine = (line) => {
  const trimmed = String(line).trim();
  if (!trimmed) return null;
  const atMatch = /^@\s*:\s*(.*)$/i.exec(trimmed);
  if (atMatch) {
    return { key: "@", value: atMatch[1].trim() };
  }
  const m = /^([a-z])\s*:\s*(.*)$/i.exec(trimmed);
  if (!m) return null;
  return { key: m[1].toLowerCase(), value: m[2].trim() };
};

const letterToIndex = (letter) => {
  const L = String(letter || "").trim().toLowerCase();
  if (L === "a") return 0;
  if (L === "b") return 1;
  if (L === "c") return 2;
  if (L === "d") return 3;
  return -1;
};

export function parseMcqBlocks(rawText) {
  const text = String(rawText ?? "").replace(/\r\n/g, "\n");
  const blocks = text
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);

  const questions = [];
  const errors = [];

  blocks.forEach((block, blockIndex) => {
    const lines = block.split("\n").map((l) => l.trim());
    const data = {};
    for (const line of lines) {
      const parsed = parseLine(line);
      if (!parsed) {
        errors.push({ blockIndex, message: `Unrecognized line in block: ${line.slice(0, 80)}` });
        return;
      }
      if (parsed.key === "@") {
        data["@"] = parsed.value;
      } else {
        data[parsed.key] = parsed.value;
      }
    }

    if (!data.q) {
      errors.push({ blockIndex, message: "Missing q:" });
      return;
    }
    const opts = ["a", "b", "c", "d"].map((k) => data[k]);
    if (opts.some((o) => o === undefined || o === "")) {
      errors.push({ blockIndex, message: "Missing one or more options a:–d:" });
      return;
    }
    if (data["@"] === undefined || data["@"] === "") {
      errors.push({ blockIndex, message: "Missing @: correct answer" });
      return;
    }

    const correctLetter = String(data["@"]).trim().toLowerCase();
    const correctIndex = letterToIndex(correctLetter);
    if (correctIndex < 0) {
      errors.push({ blockIndex, message: "@: must be a, b, c, or d" });
      return;
    }

    questions.push({
      prompt: data.q,
      options: opts,
      correctIndex,
      correctAnswer: correctIndex,
      explanation: "",
      score: 1,
    });
  });

  return { questions, errors };
}

export default parseMcqBlocks;
