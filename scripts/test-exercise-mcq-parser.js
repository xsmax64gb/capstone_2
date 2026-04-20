import assert from "node:assert/strict";
import { parseMcqBlocks } from "../helper/exercise-mcq-parser.js";

const sample = `q: Apple is a ___.
a: fruit
b: animal
c: car
d: book
@: a

q: She ___ to school every day.
a: go
b: goes
c: going
d: gone
@: b`;

const { questions, errors } = parseMcqBlocks(sample);
assert.equal(errors.length, 0);
assert.equal(questions.length, 2);
assert.equal(questions[0].correctIndex, 0);
assert.equal(questions[1].correctIndex, 1);
assert.deepEqual(questions[0].options, ["fruit", "animal", "car", "book"]);

const bad = parseMcqBlocks("q: Only question\na: x");
assert.ok(bad.errors.length > 0);

console.log("exercise-mcq-parser tests OK");
