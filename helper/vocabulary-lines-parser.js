/**
 * Parse multiple lines of vocabulary entries.
 *
 * Supported formats per line:
 * - apple - quả táo
 * - apple | quả táo
 * - benefit - /ˈbenɪfɪt/ - lợi ích - This policy brings many benefits.
 *
 * Separator detection:
 * - Prefer "|" if present
 * - Else split by " - " (spaces around hyphen)
 *
 * Output:
 * { items: [{ word, pronunciation?, meaning?, example? }], errors: [{ line, message, raw }] }
 */

const IPA_RE = /^\/[^/].*\/$/;

const normalizePiece = (value) =>
  String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");

const splitLine = (line) => {
  const raw = String(line ?? "").trim();
  if (!raw) return null;
  if (raw.includes("|")) {
    return raw.split("|").map((p) => normalizePiece(p));
  }
  // Only split on hyphen separator with spaces to reduce false splits in words like "check-in".
  return raw.split(" - ").map((p) => normalizePiece(p));
};

const looksLikeIpa = (piece) => IPA_RE.test(String(piece || "").trim());

export function parseVocabularyLines(rawText, flags = {}) {
  const includePronunciation = Boolean(flags.include_pronunciation ?? flags.includePronunciation);
  const includeMeaning = flags.include_meaning === undefined && flags.includeMeaning === undefined
    ? true
    : Boolean(flags.include_meaning ?? flags.includeMeaning);
  const includeExample = Boolean(flags.include_example ?? flags.includeExample);

  const text = String(rawText ?? "").replace(/\r\n/g, "\n");
  const lines = text.split("\n");

  const items = [];
  const errors = [];

  lines.forEach((line, idx) => {
    const pieces = splitLine(line);
    if (!pieces) return;

    const raw = String(line);
    const [p1, p2, p3, p4] = pieces;

    const word = normalizePiece(p1);
    if (!word) {
      errors.push({ line: idx + 1, raw, message: "Missing word" });
      return;
    }

    // Accept 2–4 parts.
    if (pieces.length < 2) {
      errors.push({ line: idx + 1, raw, message: "Missing meaning" });
      return;
    }
    if (pieces.length > 4) {
      errors.push({ line: idx + 1, raw, message: "Too many separators" });
      return;
    }

    let pronunciation = "";
    let meaning = "";
    let example = "";

    if (pieces.length === 2) {
      meaning = normalizePiece(p2);
    } else if (pieces.length === 3) {
      // Either: word - /ipa/ - meaning OR word - meaning - example
      if (looksLikeIpa(p2)) {
        pronunciation = normalizePiece(p2);
        meaning = normalizePiece(p3);
      } else {
        meaning = normalizePiece(p2);
        example = normalizePiece(p3);
      }
    } else {
      // 4 parts: word - /ipa/ - meaning - example (preferred)
      pronunciation = looksLikeIpa(p2) ? normalizePiece(p2) : "";
      meaning = normalizePiece(looksLikeIpa(p2) ? p3 : p2);
      example = normalizePiece(looksLikeIpa(p2) ? p4 : p3);
    }

    if (includeMeaning && !meaning) {
      errors.push({ line: idx + 1, raw, message: "Missing meaning" });
      return;
    }

    items.push({
      word,
      pronunciation: includePronunciation ? pronunciation : pronunciation || "",
      meaning: includeMeaning ? meaning : meaning || "",
      example: includeExample ? example : example || "",
    });
  });

  return { items, errors };
}

export default parseVocabularyLines;

