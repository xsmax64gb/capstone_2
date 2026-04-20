import assert from "node:assert/strict";
import { parseVocabularyLines } from "../helper/vocabulary-lines-parser.js";

const sample = `apple - quả táo
book | quyển sách
improve - /ɪmˈpruːv/ - cải thiện
benefit - /ˈbenɪfɪt/ - lợi ích - This policy brings many benefits.`;

const res = parseVocabularyLines(sample, {
  includePronunciation: true,
  includeMeaning: true,
  includeExample: true,
});

assert.equal(res.errors.length, 0);
assert.equal(res.items.length, 4);
assert.equal(res.items[0].word, "apple");
assert.equal(res.items[1].meaning, "quyển sách");
assert.ok(res.items[2].pronunciation.includes("/"));
assert.ok(res.items[3].example.includes("benefits"));

const bad = parseVocabularyLines("onlyword", { includeMeaning: true });
assert.ok(bad.errors.length > 0);

console.log("vocabulary-lines-parser tests OK");

