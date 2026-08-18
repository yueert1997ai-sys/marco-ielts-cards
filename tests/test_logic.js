"use strict";

const assert = require("node:assert/strict");
const { fisherYates, createQueue, safeState } = require("../app.js");

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

assert.deepEqual(safeState({ mode: "bad", filter: "X", weakWords: ["field", 2] }), {
  weakWords: ["field"],
  mode: "all",
  filter: "all",
  queue: [],
  position: 0,
  queueKey: "",
});

console.log(JSON.stringify({ ok: true, tests: 7 }));
