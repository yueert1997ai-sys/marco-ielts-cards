"use strict";

const assert = require("node:assert/strict");
const entries = require("../data/words.json");
const words = entries.map((entry) => entry.word);
const {
  fisherYates,
  createQueue,
  createPriorityDailyDeck,
  createSpacedDailyDeck,
  createPriorityQueue,
  shiftDateKey,
  calculateStreak,
  scheduleReview,
  isReviewDue,
  sanitizeReviewRecords,
  fittedFontSize,
  storedCurrentWord,
  safeState,
  serializeBackup,
  parseBackup,
  cloneProgressState,
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

const firstKnownReview = scheduleReview(null, "known", "2026-08-18");
assert.deepEqual(firstKnownReview, {
  stage: 0,
  interval: 1,
  dueDate: "2026-08-19",
  lastReviewed: "2026-08-18",
  lastResult: "known",
  lapses: 0,
});
const secondKnownReview = scheduleReview(firstKnownReview, "known", "2026-08-19");
assert.equal(secondKnownReview.stage, 1);
assert.equal(secondKnownReview.interval, 3);
assert.equal(secondKnownReview.dueDate, "2026-08-22");
const thirdKnownReview = scheduleReview(secondKnownReview, "known", "2026-08-22");
assert.equal(thirdKnownReview.interval, 7);
assert.equal(thirdKnownReview.dueDate, "2026-08-29");
let intervalReview = null;
let intervalDate = "2026-08-18";
[1, 3, 7, 14, 30, 60, 60].forEach((expectedInterval) => {
  intervalReview = scheduleReview(intervalReview, "known", intervalDate);
  assert.equal(intervalReview.interval, expectedInterval);
  assert.equal(intervalReview.dueDate, shiftDateKey(intervalDate, expectedInterval));
  intervalDate = intervalReview.dueDate;
});
const resetReview = scheduleReview(thirdKnownReview, "weak", "2026-08-23");
assert.equal(resetReview.stage, 0);
assert.equal(resetReview.interval, 1);
assert.equal(resetReview.dueDate, "2026-08-24");
assert.equal(resetReview.lapses, 1);
assert.equal(isReviewDue(resetReview, "2026-08-23"), false);
assert.equal(isReviewDue(resetReview, "2026-08-24"), true);
assert.throws(() => scheduleReview(null, "skip", "2026-08-18"));

const spacedEntries = [
  { word: "new-s", priority: "S" },
  { word: "due-a", priority: "A" },
  { word: "due-b", priority: "B" },
];
const spacedReviews = {
  "due-a": { stage: 1, dueDate: "2026-08-18", lastReviewed: "2026-08-15", lastResult: "known", lapses: 0 },
  "due-b": { stage: 0, dueDate: "2026-08-17", lastReviewed: "2026-08-16", lastResult: "weak", lapses: 1 },
};
const spacedDeck = createSpacedDailyDeck(spacedEntries, "2026-08-18", ["due-a", "due-b"], spacedReviews, 3);
assert.deepEqual(spacedDeck, ["due-b", "due-a", "new-s"]);
assert.deepEqual(createSpacedDailyDeck(spacedEntries, "2026-08-18", ["due-a", "due-b"], spacedReviews, 3), spacedDeck);
assert.deepEqual(sanitizeReviewRecords({ broken: { dueDate: "today" } }), {});
assert.deepEqual(sanitizeReviewRecords({ capped: { stage: 99, dueDate: "2026-09-01" } }).capped, {
  stage: 5,
  interval: 60,
  dueDate: "2026-09-01",
  lastReviewed: "",
  lastResult: "",
  lapses: 0,
});
assert.equal(shiftDateKey("2026-03-01", -1), "2026-02-28");
assert.equal(calculateStreak(["2026-08-16", "2026-08-17"], "2026-08-18"), 2);
assert.equal(calculateStreak(["2026-08-16", "2026-08-17", "2026-08-18"], "2026-08-18"), 3);
assert.equal(fittedFontSize(48, 300, 360), 38);
assert.equal(fittedFontSize(48, 360, 300), 48);

assert.deepEqual(safeState({ mode: "bad", filter: "X", weakWords: ["field", 2] }), {
  weakWords: ["field"],
  reviews: {},
  mode: "all",
  filter: "all",
  queue: [],
  position: 0,
  queueKey: "",
  daily: { date: "", deckVersion: 0, deckWords: [], knownWords: [], weakWords: [], trainedWords: [], completedDates: [] },
});

const backup = serializeBackup({ weakWords: ["field"], mode: "weak", filter: "S" }, "2026-08-18T00:00:00.000Z");
assert.deepEqual(parseBackup(backup), {
  weakWords: ["field"],
  reviews: {},
  mode: "weak",
  filter: "S",
  queue: [],
  position: 0,
  queueKey: "",
  daily: { date: "", deckVersion: 0, deckWords: [], knownWords: [], weakWords: [], trainedWords: [], completedDates: [] },
});
assert.throws(() => parseBackup('{"version":1}'));

const undoSource = safeState({ weakWords: ["field"], mode: "daily", filter: "S" });
undoSource.reviews.field = firstKnownReview;
const undoSnapshot = cloneProgressState(undoSource);
undoSource.weakWords.push("period");
undoSource.daily.knownWords.push("scale");
undoSource.reviews.field.stage = 4;
assert.deepEqual(undoSnapshot.weakWords, ["field"]);
assert.deepEqual(undoSnapshot.daily.knownWords, []);
assert.equal(undoSnapshot.reviews.field.stage, 0);

console.log(JSON.stringify({ ok: true, tests: 52 }));
