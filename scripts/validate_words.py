#!/usr/bin/env python3
"""Validate the generated Marco IELTS card dataset."""

from __future__ import annotations

import json
from collections import Counter
from pathlib import Path


PROJECT = Path(__file__).resolve().parents[1]
DATA = PROJECT / "data" / "words.json"
REQUIRED = {"assignment", "period", "field", "pattern", "proposal", "scale"}
BANNED = {
    "relevant": {"relative"},
    "thanks to": {"according to"},
    "rather than": {"however"},
    "fertiliser": {"toxic"},
    "primary": {"principle"},
}


def main() -> int:
    words = json.loads(DATA.read_text(encoding="utf-8"))
    assert isinstance(words, list) and words
    assert all(set(item) == {"word", "partOfSpeech", "meaning", "paraphrases", "collocations", "priority"} for item in words)
    assert all(item["word"] and item["meaning"] and item["priority"] in "SAB" for item in words)
    assert all(isinstance(item["partOfSpeech"], str) for item in words)
    assert all(isinstance(item[field], list) for item in words for field in ("meaning", "paraphrases", "collocations"))

    by_word = {item["word"]: item for item in words}
    assert len(by_word) == len(words), "duplicate headwords"
    assert REQUIRED <= set(by_word)
    assert all(by_word[word]["priority"] == "S" for word in REQUIRED)
    assert by_word["assignment"]["meaning"] == ["任务", "作业", "分配的工作"]
    assert by_word["period"]["paraphrases"] == ["phase", "stage"]

    for word, banned_values in BANNED.items():
        actual = {value.lower() for value in by_word[word]["paraphrases"]}
        assert actual.isdisjoint(banned_values), f"unsafe paraphrase for {word}: {actual & banned_values}"

    grades = Counter(item["priority"] for item in words)
    assert len(words) == 903, len(words)
    assert grades == Counter({"S": 128, "A": 583, "B": 192}), grades
    print(json.dumps({"ok": True, "total": len(words), "grades": dict(grades), "required_words": sorted(REQUIRED)}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
