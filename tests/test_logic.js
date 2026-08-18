"use strict";

const assert = require("node:assert/strict");
const { fisherYates, createQueue, storedCurrentWord, safeState, serializeBackup, parseBackup } = require("../app.js");

const source = ["period", "field", "scale", "assignment"];
const sequence = [0.1, 0.7, 0.3, 0.9, 0.2];
let position = 0;
const random = () => sequence[position++ % sequence.length];

const shuffled = fisherYates(source, random);
assert.deepEqual([...shuffled].sort(), [...source].sort());
assert.deepEqual(source, ["period", "field", "scale", "assignment"]);
assert.equal(new Set(shuffled).size, source.length);

const nextRound = createQueue(source, "period", () => 0);
assert.notEqual(nextRound[0], "period");
assert.equal(new Set(nextRound).size, source.length);

const previousSessionWord = storedCurrentWord({ queue: ["scale", "field", "period"], position: 1 }, new Set(source));
assert.equal(previousSessionWord, "field");
assert.equal(storedCurrentWord({ queue: ["missing"], position: 0 }, new Set(source)), "");
const freshSession = createQueue(source, previousSessionWord, () => 0);
assert.notEqual(freshSession[0], previousSessionWord);

assert.deepEqual(safeState({ mode: "bad", filter: "X", weakWords: ["field", 2] }), {
  weakWords: ["field"],
  mode: "all",
  filter: "all",
  queue: [],
  position: 0,
  queueKey: "",
});

const backup = serializeBackup({ weakWords: ["field"], mode: "weak", filter: "S" }, "2026-08-18T00:00:00.000Z");
assert.deepEqual(parseBackup(backup), {
  weakWords: ["field"],
  mode: "weak",
  filter: "S",
  queue: [],
  position: 0,
  queueKey: "",
});
assert.throws(() => parseBackup('{"version":1}'));

console.log(JSON.stringify({ ok: true, tests: 12 }));
