"use strict";

const assert = require("node:assert/strict");
const entries = require("../data/words.json");
const words = entries.map((entry) => entry.word);
const {
  fisherYates,
  createQueue,
  createPriorityDailyDeck,
  createPriorityQueue,
  shiftDateKey,
  calculateStreak,
  storedCurrentWord,
  safeState,
  serializeBackup,
  parseBackup,
} = require("../app.js");

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

const dailyDeck = createPriorityDailyDeck(entries, "2026-08-18", [], 50);
assert.equal(dailyDeck.length, 50);
assert.equal(new Set(dailyDeck).size, 50);
assert.ok(dailyDeck.every((word) => entries.find((entry) => entry.word === word).priority === "S"));
assert.deepEqual(createPriorityDailyDeck(entries, "2026-08-18", [], 50), dailyDeck);
assert.notDeepEqual(createPriorityDailyDeck(entries, "2026-08-19", [], 50), dailyDeck);
const trainedS = entries.filter((entry) => entry.priority === "S").map((entry) => entry.word);
const afterS = createPriorityDailyDeck(entries, "2026-08-18", trainedS, 50);
assert.ok(afterS.every((word) => entries.find((entry) => entry.word === word).priority === "A"));
const priorityQueue = createPriorityQueue(
  [
    { word: "b-word", priority: "B" },
    { word: "s-word", priority: "S" },
    { word: "a-word", priority: "A" },
  ],
  "",
  () => 0,
);
assert.deepEqual(priorityQueue, ["s-word", "a-word", "b-word"]);
assert.equal(shiftDateKey("2026-03-01", -1), "2026-02-28");
assert.equal(calculateStreak(["2026-08-16", "2026-08-17"], "2026-08-18"), 2);
assert.equal(calculateStreak(["2026-08-16", "2026-08-17", "2026-08-18"], "2026-08-18"), 3);

assert.deepEqual(safeState({ mode: "bad", filter: "X", weakWords: ["field", 2] }), {
  weakWords: ["field"],
  mode: "all",
  filter: "all",
  queue: [],
  position: 0,
  queueKey: "",
  daily: { date: "", deckWords: [], knownWords: [], weakWords: [], trainedWords: [], completedDates: [] },
});

const backup = serializeBackup({ weakWords: ["field"], mode: "weak", filter: "S" }, "2026-08-18T00:00:00.000Z");
assert.deepEqual(parseBackup(backup), {
  weakWords: ["field"],
  mode: "weak",
  filter: "S",
  queue: [],
  position: 0,
  queueKey: "",
  daily: { date: "", deckWords: [], knownWords: [], weakWords: [], trainedWords: [], completedDates: [] },
});
assert.throws(() => parseBackup('{"version":1}'));

console.log(JSON.stringify({ ok: true, tests: 22 }));
