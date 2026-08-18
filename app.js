(function () {
  "use strict";

  const STORAGE_KEY = "marcoIeltsCards.v1";
  const DEFAULT_STATE = {
    weakWords: [],
    mode: "all",
    filter: "all",
    queue: [],
    position: 0,
    queueKey: "",
  };

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

  function safeState(raw) {
    if (!raw || typeof raw !== "object") return { ...DEFAULT_STATE };
    return {
      weakWords: Array.isArray(raw.weakWords) ? raw.weakWords.filter((word) => typeof word === "string") : [],
      mode: raw.mode === "weak" ? "weak" : "all",
      filter: ["all", "S", "A", "B"].includes(raw.filter) ? raw.filter : "all",
      queue: Array.isArray(raw.queue) ? raw.queue.filter((word) => typeof word === "string") : [],
      position: Number.isInteger(raw.position) && raw.position >= 0 ? raw.position : 0,
      queueKey: typeof raw.queueKey === "string" ? raw.queueKey : "",
    };
  }

  function boot() {
    const elements = {
      counter: document.querySelector("#counter"),
      weakCount: document.querySelector("#weak-count"),
      card: document.querySelector("#word-card"),
      front: document.querySelector("#card-front"),
      back: document.querySelector("#card-back"),
      frontWord: document.querySelector("#front-word"),
      backWord: document.querySelector("#back-word"),
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
      modeButtons: [...document.querySelectorAll("[data-mode]")],
      filterButtons: [...document.querySelectorAll("[data-filter]")],
    };

    let words = [];
    let byWord = new Map();
    let state = loadState();
    let current = null;
    let isBack = false;

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
      const weak = weakSet();
      return words.filter((entry) => {
        const modeMatch = state.mode === "all" || weak.has(entry.word);
        const filterMatch = state.filter === "all" || entry.priority === state.filter;
        return modeMatch && filterMatch;
      });
    }

    function currentQueueKey(eligible) {
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
      state.queue = createQueue(names, previousWord);
      state.position = 0;
      state.queueKey = currentQueueKey(eligible);
      saveState();
    }

    function ensureQueue() {
      const eligible = eligibleWords();
      const key = currentQueueKey(eligible);
      if (!queueIsRestorable(eligible, key)) resetQueue();
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

    function renderControls() {
      const weak = weakSet();
      elements.weakCount.textContent = String(weak.size);
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
    }

    function renderCurrent() {
      renderControls();
      current = state.queue.length ? byWord.get(state.queue[state.position]) : null;
      setFace(false);

      if (!current) {
        elements.counter.textContent = "0 / 0";
        elements.frontWord.textContent = state.mode === "weak" ? "还没有不会的词" : "没有符合条件的词";
        elements.status.textContent = state.mode === "weak" ? "先回到“全部”，遇到不会的词时点“不会”。" : "换一个优先级筛选试试。";
        elements.showAnswer.hidden = true;
        return;
      }

      elements.status.textContent = "";
      elements.counter.textContent = `${state.position + 1} / ${state.queue.length}`;
      elements.frontWord.textContent = current.word;
      elements.backWord.textContent = current.word;
      elements.meaning.textContent = current.meaning.join("；");

      const hasParaphrases = current.paraphrases.length > 0;
      elements.paraphraseBlock.hidden = !hasParaphrases;
      elements.paraphrases.textContent = current.paraphrases.join(" · ");

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
      resetQueue(current ? current.word : "");
      renderCurrent();
    }

    function markWeak() {
      if (!current) return;
      const weak = weakSet();
      weak.add(current.word);
      state.weakWords = [...weak].sort();
      saveState();
      advance();
    }

    function markKnown() {
      if (!current) return;
      const weak = weakSet();
      const removed = weak.delete(current.word);
      state.weakWords = [...weak].sort();
      if (removed && state.mode === "weak") {
        resetQueue(current.word);
        renderCurrent();
        return;
      }
      saveState();
      advance();
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
        ensureQueue();
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
    module.exports = { fisherYates, createQueue, safeState };
  }
  if (typeof document !== "undefined") {
    document.addEventListener("DOMContentLoaded", boot);
  }
})();
