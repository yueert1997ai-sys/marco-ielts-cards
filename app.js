(function () {
  "use strict";

  const STORAGE_KEY = "marcoIeltsCards.v1";
  const DAILY_TARGET = 50;
  const PRIORITY_ORDER = ["S", "A", "B"];
  const emptyDailyState = () => ({ date: "", deckWords: [], knownWords: [], weakWords: [], trainedWords: [], completedDates: [] });
  const DEFAULT_STATE = {
    weakWords: [],
    mode: "all",
    filter: "all",
    queue: [],
    position: 0,
    queueKey: "",
    daily: emptyDailyState(),
  };
  const BACKUP_FORMAT = "marco-ielts-cards-progress";
  const PRIORITY_LABELS = { S: "必须秒懂", A: "重点掌握", B: "扩展积累" };

  function fisherYates(items, random = Math.random) {
    const result = [...items];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const target = Math.floor(random() * (index + 1));
      [result[index], result[target]] = [result[target], result[index]];
    }
    return result;
  }

  function createQueue(words, previousWord = "", random = Math.random) {
    const queue = fisherYates(words, random);
    if (queue.length > 1 && queue[0] === previousWord) {
      const swapIndex = 1 + Math.floor(random() * (queue.length - 1));
      [queue[0], queue[swapIndex]] = [queue[swapIndex], queue[0]];
    }
    return queue;
  }

  function hashString(value) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function seededRandom(seed) {
    let value = seed >>> 0;
    return () => {
      value += 0x6d2b79f5;
      let result = value;
      result = Math.imul(result ^ (result >>> 15), result | 1);
      result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
      return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffleDailyGroup(entries, dateKey, label) {
    const names = entries.map((entry) => entry.word);
    const seed = hashString(`${dateKey}|${label}|${names.join("|")}`);
    return fisherYates(names, seededRandom(seed));
  }

  function createPriorityDailyDeck(entries, dateKey, trainedWords = [], count = DAILY_TARGET) {
    const trained = new Set(trainedWords);
    const untrainedGroups = PRIORITY_ORDER.flatMap((priority) =>
      shuffleDailyGroup(
        entries.filter((entry) => entry.priority === priority && !trained.has(entry.word)),
        dateKey,
        `new-${priority}`,
      ),
    );
    const trainedGroups = PRIORITY_ORDER.flatMap((priority) =>
      shuffleDailyGroup(
        entries.filter((entry) => entry.priority === priority && trained.has(entry.word)),
        dateKey,
        `review-${priority}`,
      ),
    );
    return [...untrainedGroups, ...trainedGroups].slice(0, Math.min(count, entries.length));
  }

  function createPriorityQueue(entries, previousWord = "", random = Math.random) {
    return PRIORITY_ORDER.flatMap((priority) =>
      createQueue(
        entries.filter((entry) => entry.priority === priority).map((entry) => entry.word),
        previousWord,
        random,
      ),
    );
  }

  function localDateKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function shiftDateKey(dateKey, offset) {
    const [year, month, day] = dateKey.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    date.setUTCDate(date.getUTCDate() + offset);
    return date.toISOString().slice(0, 10);
  }

  function calculateStreak(completedDates, todayKey) {
    const completed = new Set(completedDates);
    let cursor = completed.has(todayKey) ? todayKey : shiftDateKey(todayKey, -1);
    let streak = 0;
    while (completed.has(cursor)) {
      streak += 1;
      cursor = shiftDateKey(cursor, -1);
    }
    return streak;
  }

  function fittedFontSize(baseSize, availableWidth, requiredWidth, minimumSize = 18) {
    if (![baseSize, availableWidth, requiredWidth].every((value) => Number.isFinite(value) && value > 0)) return baseSize;
    if (requiredWidth <= availableWidth) return baseSize;
    return Math.max(minimumSize, Math.floor(baseSize * (availableWidth / requiredWidth) * 0.96));
  }

  function storedCurrentWord(rawState, vocabulary) {
    if (!rawState || !Array.isArray(rawState.queue) || !Number.isInteger(rawState.position)) return "";
    const candidate = rawState.queue[rawState.position];
    return typeof candidate === "string" && vocabulary && vocabulary.has(candidate) ? candidate : "";
  }

  function safeState(raw) {
    if (!raw || typeof raw !== "object") return { ...DEFAULT_STATE, daily: emptyDailyState() };
    const rawDaily = raw.daily && typeof raw.daily === "object" ? raw.daily : {};
    const stringsOnly = (value) => (Array.isArray(value) ? [...new Set(value.filter((item) => typeof item === "string"))] : []);
    return {
      weakWords: stringsOnly(raw.weakWords),
      mode: ["weak", "daily"].includes(raw.mode) ? raw.mode : "all",
      filter: ["all", "S", "A", "B"].includes(raw.filter) ? raw.filter : "all",
      queue: stringsOnly(raw.queue),
      position: Number.isInteger(raw.position) && raw.position >= 0 ? raw.position : 0,
      queueKey: typeof raw.queueKey === "string" ? raw.queueKey : "",
      daily: {
        date: /^\d{4}-\d{2}-\d{2}$/.test(rawDaily.date) ? rawDaily.date : "",
        deckWords: stringsOnly(rawDaily.deckWords),
        knownWords: stringsOnly(rawDaily.knownWords),
        weakWords: stringsOnly(rawDaily.weakWords),
        trainedWords: stringsOnly(rawDaily.trainedWords),
        completedDates: stringsOnly(rawDaily.completedDates).filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date)),
      },
    };
  }

  function serializeBackup(rawState, exportedAt = new Date().toISOString()) {
    return JSON.stringify(
      {
        format: BACKUP_FORMAT,
        version: 1,
        exportedAt,
        state: safeState(rawState),
      },
      null,
      2,
    );
  }

  function parseBackup(text) {
    const payload = JSON.parse(text);
    if (!payload || payload.format !== BACKUP_FORMAT || payload.version !== 1 || !payload.state) {
      throw new Error("unsupported progress backup");
    }
    return safeState(payload.state);
  }

  function boot() {
    const elements = {
      shell: document.querySelector(".app-shell"),
      counter: document.querySelector("#counter"),
      weakCount: document.querySelector("#weak-count"),
      card: document.querySelector("#word-card"),
      front: document.querySelector("#card-front"),
      back: document.querySelector("#card-back"),
      frontWord: document.querySelector("#front-word"),
      backWord: document.querySelector("#back-word"),
      priorityBadge: document.querySelector("#priority-badge"),
      partOfSpeech: document.querySelector("#part-of-speech"),
      meaning: document.querySelector("#meaning"),
      paraphraseBlock: document.querySelector("#paraphrase-block"),
      paraphrases: document.querySelector("#paraphrases"),
      collocationBlock: document.querySelector("#collocation-block"),
      collocations: document.querySelector("#collocations"),
      showAnswer: document.querySelector("#show-answer"),
      ratingActions: document.querySelector("#rating-actions"),
      markWeak: document.querySelector("#mark-weak"),
      markKnown: document.querySelector("#mark-known"),
      skipWord: document.querySelector("#skip-word"),
      status: document.querySelector("#status-message"),
      exportProgress: document.querySelector("#export-progress"),
      importProgress: document.querySelector("#import-progress"),
      progressFile: document.querySelector("#progress-file"),
      filters: document.querySelector(".filters"),
      dailyDashboard: document.querySelector("#daily-dashboard"),
      dailyTitle: document.querySelector("#daily-title"),
      dailyKnown: document.querySelector("#daily-known"),
      dailyWeak: document.querySelector("#daily-weak"),
      dailyLevel: document.querySelector("#daily-level"),
      dailyStreak: document.querySelector("#daily-streak"),
      dailyCompleted: document.querySelector("#daily-completed"),
      dailyProgress: document.querySelector("#daily-progress"),
      dailyProgressFill: document.querySelector("#daily-progress-fill"),
      dailyCalendar: document.querySelector("#daily-calendar"),
      modeButtons: [...document.querySelectorAll("[data-mode]")],
      filterButtons: [...document.querySelectorAll("[data-filter]")],
    };

    let words = [];
    let byWord = new Map();
    let state = loadState();
    let current = null;
    let isBack = false;
    let todayKey = localDateKey();
    let todayDeck = [];
    let wordFitFrame = 0;

    function loadState() {
      try {
        return safeState(JSON.parse(localStorage.getItem(STORAGE_KEY)));
      } catch (_error) {
        return { ...DEFAULT_STATE };
      }
    }

    function saveState() {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }

    function weakSet() {
      return new Set(state.weakWords.filter((word) => byWord.has(word)));
    }

    function eligibleWords() {
      if (state.mode === "daily") {
        const completed = dailyCompletedSet();
        const dailyWords = new Set(todayDeck);
        return words.filter((entry) => dailyWords.has(entry.word) && !completed.has(entry.word));
      }
      const weak = weakSet();
      return words.filter((entry) => {
        const modeMatch = state.mode === "all" || weak.has(entry.word);
        const filterMatch = state.filter === "all" || entry.priority === state.filter;
        return modeMatch && filterMatch;
      });
    }

    function currentQueueKey(eligible) {
      if (state.mode === "daily") {
        return `daily:${todayKey}:${[...dailyCompletedSet()].sort().join("|")}:${eligible.length}`;
      }
      const weakSignature = state.mode === "weak" ? [...weakSet()].sort().join("|") : "all";
      return `${state.mode}:${state.filter}:${weakSignature}:${eligible.length}`;
    }

    function queueIsRestorable(eligible, key) {
      if (state.queueKey !== key || state.position >= state.queue.length) return false;
      const eligibleNames = new Set(eligible.map((entry) => entry.word));
      const queueNames = new Set(state.queue);
      return state.queue.length === eligible.length && queueNames.size === eligibleNames.size && [...queueNames].every((word) => eligibleNames.has(word));
    }

    function resetQueue(previousWord = "") {
      const eligible = eligibleWords();
      const names = eligible.map((entry) => entry.word);
      state.queue = state.mode === "daily" ? createPriorityQueue(eligible, previousWord) : createQueue(names, previousWord);
      state.position = 0;
      state.queueKey = currentQueueKey(eligible);
      saveState();
    }

    function ensureQueue() {
      const eligible = eligibleWords();
      const key = currentQueueKey(eligible);
      if (!queueIsRestorable(eligible, key)) resetQueue();
    }

    function dailyCompletedSet() {
      return new Set([...state.daily.knownWords, ...state.daily.weakWords]);
    }

    function prepareDailyState() {
      todayKey = localDateKey();
      const vocabulary = new Set(words.map((entry) => entry.word));
      state.daily.trainedWords = state.daily.trainedWords.filter((word) => vocabulary.has(word));
      if (state.daily.date !== todayKey) {
        if (state.daily.trainedWords.length >= vocabulary.size) state.daily.trainedWords = [];
        state.daily.date = todayKey;
        state.daily.knownWords = [];
        state.daily.weakWords = [];
        state.daily.deckWords = createPriorityDailyDeck(words, todayKey, state.daily.trainedWords, DAILY_TARGET);
      }

      const deckIsValid =
        state.daily.deckWords.length === Math.min(DAILY_TARGET, words.length) &&
        new Set(state.daily.deckWords).size === state.daily.deckWords.length &&
        state.daily.deckWords.every((word) => vocabulary.has(word));
      if (!deckIsValid) state.daily.deckWords = createPriorityDailyDeck(words, todayKey, state.daily.trainedWords, DAILY_TARGET);
      todayDeck = [...state.daily.deckWords];

      const deck = new Set(todayDeck);
      state.daily.weakWords = state.daily.weakWords.filter((word) => deck.has(word));
      const dailyWeak = new Set(state.daily.weakWords);
      state.daily.knownWords = state.daily.knownWords.filter((word) => deck.has(word) && !dailyWeak.has(word));
      state.daily.completedDates = [...new Set(state.daily.completedDates)].sort().slice(-366);
      saveState();
    }

    function recordDailyResult(result) {
      if (!current || state.mode !== "daily") return;
      const known = new Set(state.daily.knownWords);
      const weak = new Set(state.daily.weakWords);
      known.delete(current.word);
      weak.delete(current.word);
      if (result === "known") known.add(current.word);
      if (result === "weak") weak.add(current.word);
      state.daily.knownWords = [...known];
      state.daily.weakWords = [...weak];
      state.daily.trainedWords = [...new Set([...state.daily.trainedWords, current.word])];

      if (dailyCompletedSet().size >= todayDeck.length && todayDeck.length > 0) {
        state.daily.completedDates = [...new Set([...state.daily.completedDates, todayKey])].sort().slice(-366);
      }
    }

    function renderDailyDashboard() {
      const completed = dailyCompletedSet().size;
      const target = todayDeck.length || DAILY_TARGET;
      const [, month, day] = todayKey.split("-");
      elements.dailyTitle.textContent = `今日训练 · ${Number(month)}月${Number(day)}日`;
      elements.dailyKnown.textContent = String(state.daily.knownWords.length);
      elements.dailyWeak.textContent = String(state.daily.weakWords.length);
      const remainingEntries = eligibleWords();
      elements.dailyLevel.textContent = PRIORITY_ORDER.find((priority) => remainingEntries.some((entry) => entry.priority === priority)) || "—";
      elements.dailyStreak.textContent = String(calculateStreak(state.daily.completedDates, todayKey));
      elements.dailyCompleted.textContent = String(completed);
      elements.dailyProgress.setAttribute("aria-valuemax", String(target));
      elements.dailyProgress.setAttribute("aria-valuenow", String(completed));
      elements.dailyProgressFill.style.width = `${target ? (completed / target) * 100 : 0}%`;

      const completedDates = new Set(state.daily.completedDates);
      const weekdayLabels = ["日", "一", "二", "三", "四", "五", "六"];
      const fragment = document.createDocumentFragment();
      for (let offset = -6; offset <= 0; offset += 1) {
        const dateKey = shiftDateKey(todayKey, offset);
        const [year, calendarMonth, calendarDay] = dateKey.split("-").map(Number);
        const item = document.createElement("span");
        item.className = "daily-day";
        if (offset === 0) item.classList.add("is-today");
        if (completedDates.has(dateKey)) item.classList.add("is-complete");
        item.setAttribute("aria-label", `${calendarMonth}月${calendarDay}日${completedDates.has(dateKey) ? "已完成" : "未完成"}`);

        const weekday = document.createElement("span");
        weekday.textContent = weekdayLabels[new Date(Date.UTC(year, calendarMonth - 1, calendarDay)).getUTCDay()];
        const date = document.createElement("span");
        date.className = "daily-date";
        date.textContent = completedDates.has(dateKey) ? "✓" : String(calendarDay);
        item.append(weekday, date);
        fragment.append(item);
      }
      elements.dailyCalendar.replaceChildren(fragment);
    }

    function setFace(back) {
      isBack = back;
      elements.front.hidden = back;
      elements.back.hidden = !back;
      elements.showAnswer.hidden = back || !current;
      elements.ratingActions.hidden = !back || !current;
      elements.card.setAttribute("aria-pressed", String(back));
      elements.card.setAttribute("aria-label", back ? "返回单词正面" : "显示答案");
    }

    function setFrontWord(text) {
      const value = String(text || "");
      const isSingleWord = !/\s/.test(value.trim());
      elements.frontWord.textContent = value;
      elements.frontWord.classList.toggle("is-single-word", isSingleWord);
      elements.frontWord.classList.toggle("is-phrase", !isSingleWord);
      elements.frontWord.style.removeProperty("font-size");
      window.cancelAnimationFrame(wordFitFrame);

      if (!isSingleWord) return;
      wordFitFrame = window.requestAnimationFrame(() => {
        if (elements.frontWord.textContent !== value) return;
        const availableWidth = elements.frontWord.clientWidth;
        const requiredWidth = elements.frontWord.scrollWidth;
        const baseSize = Number.parseFloat(window.getComputedStyle(elements.frontWord).fontSize);
        const nextSize = fittedFontSize(baseSize, availableWidth, requiredWidth);
        if (nextSize < baseSize) elements.frontWord.style.fontSize = `${nextSize}px`;
      });
    }

    function renderControls() {
      const weak = weakSet();
      const isDaily = state.mode === "daily";
      elements.weakCount.textContent = String(weak.size);
      elements.shell.classList.toggle("is-daily", isDaily);
      elements.filters.hidden = isDaily;
      elements.dailyDashboard.hidden = !isDaily;
      elements.markKnown.textContent = isDaily ? "认识" : "会了";
      elements.skipWord.textContent = isDaily ? "跳过" : "下一张";
      elements.modeButtons.forEach((button) => {
        const active = button.dataset.mode === state.mode;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-pressed", String(active));
      });
      elements.filterButtons.forEach((button) => {
        const active = button.dataset.filter === state.filter;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-pressed", String(active));
      });
      if (isDaily) renderDailyDashboard();
    }

    function renderCurrent() {
      renderControls();
      current = state.queue.length ? byWord.get(state.queue[state.position]) : null;
      setFace(false);

      if (!current) {
        const dailyComplete = state.mode === "daily" && todayDeck.length > 0 && dailyCompletedSet().size >= todayDeck.length;
        elements.counter.textContent = dailyComplete ? `${todayDeck.length} / ${todayDeck.length}` : "0 / 0";
        setFrontWord(dailyComplete ? "今日 50 词完成" : state.mode === "weak" ? "还没有不会的词" : "没有符合条件的词");
        elements.status.textContent = dailyComplete
          ? `认识 ${state.daily.knownWords.length} · 不会 ${state.daily.weakWords.length} · 连续 ${calculateStreak(state.daily.completedDates, todayKey)} 天`
          : state.mode === "weak"
            ? "先回到“随机”，遇到不会的词时点“不会”。"
            : "换一个优先级筛选试试。";
        elements.showAnswer.hidden = true;
        return;
      }

      elements.status.textContent = state.mode === "daily" ? "“认识”或“不会”计入今日进度；跳过的词稍后还会出现。" : "";
      elements.counter.textContent = state.mode === "daily" ? `${dailyCompletedSet().size} / ${todayDeck.length}` : `${state.position + 1} / ${state.queue.length}`;
      setFrontWord(current.word);
      elements.backWord.textContent = current.word;
      elements.priorityBadge.textContent = `${current.priority} · ${PRIORITY_LABELS[current.priority]}`;
      elements.priorityBadge.dataset.priority = current.priority;
      elements.partOfSpeech.textContent = current.partOfSpeech
        ? `词性 ${current.partOfSpeech}`
        : /\s/.test(current.word)
          ? "词组"
          : "词性待补充";
      elements.meaning.textContent = current.meaning.join("；");

      const hasParaphrases = current.paraphrases.length > 0;
      elements.paraphrases.classList.toggle("detail-copy-muted", !hasParaphrases);
      elements.paraphrases.textContent = hasParaphrases ? current.paraphrases.join(" · ") : "飞书词库暂未收录可靠改写";

      const hasCollocations = current.collocations.length > 0;
      elements.collocationBlock.hidden = !hasCollocations;
      elements.collocations.textContent = current.collocations.join(" · ");
    }

    function advance() {
      if (!current) return;
      const previous = current.word;
      if (state.position + 1 < state.queue.length) {
        state.position += 1;
        saveState();
      } else {
        resetQueue(previous);
      }
      renderCurrent();
    }

    function changeScope() {
      if (state.mode === "daily" && localDateKey() !== todayKey) prepareDailyState();
      resetQueue(current ? current.word : "");
      renderCurrent();
    }

    function markWeak() {
      if (!current) return;
      const weak = weakSet();
      weak.add(current.word);
      state.weakWords = [...weak].sort();
      if (state.mode === "daily") recordDailyResult("weak");
      saveState();
      advance();
    }

    function markKnown() {
      if (!current) return;
      const weak = weakSet();
      const removed = weak.delete(current.word);
      state.weakWords = [...weak].sort();
      if (state.mode === "daily") {
        recordDailyResult("known");
        saveState();
        advance();
        return;
      }
      if (removed && state.mode === "weak") {
        resetQueue(current.word);
        renderCurrent();
        return;
      }
      saveState();
      advance();
    }

    function exportProgress() {
      const backup = new Blob([serializeBackup(state)], { type: "application/json" });
      const url = URL.createObjectURL(backup);
      const link = document.createElement("a");
      link.href = url;
      link.download = `marco-ielts-progress-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      elements.status.textContent = "进度备份已下载。";
    }

    function importProgress(file) {
      if (!file) return;
      file
        .text()
        .then((text) => {
          state = parseBackup(text);
          state.weakWords = state.weakWords.filter((word) => byWord.has(word));
          prepareDailyState();
          ensureQueue();
          saveState();
          renderCurrent();
          elements.status.textContent = "进度已恢复。";
        })
        .catch(() => {
          elements.status.textContent = "恢复失败：请选择本站导出的进度 JSON。";
        })
        .finally(() => {
          elements.progressFile.value = "";
        });
    }

    elements.card.addEventListener("click", () => {
      if (current) setFace(!isBack);
    });
    elements.card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        if (current) setFace(!isBack);
      }
    });
    elements.showAnswer.addEventListener("click", () => setFace(true));
    elements.markWeak.addEventListener("click", markWeak);
    elements.markKnown.addEventListener("click", markKnown);
    elements.skipWord.addEventListener("click", advance);
    elements.exportProgress.addEventListener("click", exportProgress);
    elements.importProgress.addEventListener("click", () => elements.progressFile.click());
    elements.progressFile.addEventListener("change", () => importProgress(elements.progressFile.files[0]));
    elements.modeButtons.forEach((button) => {
      button.addEventListener("click", () => {
        state.mode = button.dataset.mode;
        changeScope();
      });
    });
    elements.filterButtons.forEach((button) => {
      button.addEventListener("click", () => {
        state.filter = button.dataset.filter;
        changeScope();
      });
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "ArrowRight" && current) advance();
    });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState !== "visible" || localDateKey() === todayKey) return;
      prepareDailyState();
      if (state.mode === "daily") {
        resetQueue();
        renderCurrent();
      }
    });
    window.addEventListener("resize", () => {
      if (current && !isBack) setFrontWord(current.word);
    });

    fetch("./data/words.json")
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((data) => {
        if (!Array.isArray(data) || data.length === 0) throw new Error("empty word data");
        words = data;
        byWord = new Map(words.map((entry) => [entry.word, entry]));
        state.weakWords = state.weakWords.filter((word) => byWord.has(word));
        prepareDailyState();
        // Every page session begins with a fresh shuffle. Learning preferences still persist.
        resetQueue(storedCurrentWord(state, byWord));
        renderCurrent();
      })
      .catch(() => {
        current = null;
        elements.counter.textContent = "— / —";
        elements.frontWord.textContent = "词库加载失败";
        elements.showAnswer.hidden = true;
        elements.status.textContent = "请通过本地服务器或 GitHub Pages 打开。";
      });
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      fisherYates,
      createQueue,
      createPriorityDailyDeck,
      createPriorityQueue,
      localDateKey,
      shiftDateKey,
      calculateStreak,
      fittedFontSize,
      storedCurrentWord,
      safeState,
      serializeBackup,
      parseBackup,
    };
  }
  if (typeof document !== "undefined") {
    document.addEventListener("DOMContentLoaded", boot);
  }
})();
