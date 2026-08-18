#!/usr/bin/env python3
"""Build the static card dataset from a Feishu document JSON export."""

from __future__ import annotations

import argparse
import json
import re
import xml.etree.ElementTree as ET
from pathlib import Path


PROJECT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = PROJECT / "source" / "feishu_export.json"
DEFAULT_OUTPUT = PROJECT / "data" / "words.json"

# Explicitly confirmed by the product brief. These are not internet additions.
CONFIRMED_PARAPHRASES = {"period": ["phase", "stage"]}


def clean_text(node: ET.Element) -> str:
    return " ".join("".join(node.itertext()).split())


def split_chinese(value: str) -> list[str]:
    return [item.strip() for item in re.split(r"[；;]", value) if item.strip() and item.strip() != "—"]


def split_slashes(value: str) -> list[str]:
    return [item.strip() for item in re.split(r"\s+/\s+", value) if item.strip() and item.strip() != "—"]


def read_document(source: Path) -> tuple[str, int | None]:
    payload = json.loads(source.read_text(encoding="utf-8-sig"))
    if isinstance(payload, dict) and "data" in payload:
        document = payload["data"]["document"]
        return document["content"], document.get("revision_id")
    raise ValueError("Expected a lark-cli docs +fetch JSON export")


def extract_words(markup: str) -> list[dict]:
    root = ET.fromstring(f"<root>{markup}</root>")
    active_priority: str | None = None
    words: list[dict] = []

    for node in root:
        if node.tag == "h1":
            heading = clean_text(node)
            if heading.startswith("02｜S级"):
                active_priority = "S"
            elif heading.startswith("03｜A级"):
                active_priority = "A"
            elif heading.startswith("04｜B级"):
                active_priority = "B"
            else:
                active_priority = None
            continue

        if node.tag != "table" or active_priority is None:
            continue
        body = node.find("tbody")
        if body is None:
            continue

        for row in body.findall("tr"):
            cells = [clean_text(cell) for cell in list(row) if cell.tag == "td"]
            if len(cells) != 6:
                continue
            word, meaning, collocation, paraphrase, _source, _status = cells
            item = {
                "word": word,
                "meaning": split_chinese(meaning),
                "paraphrases": split_slashes(paraphrase),
                "collocations": split_slashes(collocation),
                "priority": active_priority,
            }
            if word in CONFIRMED_PARAPHRASES:
                item["paraphrases"] = CONFIRMED_PARAPHRASES[word]
            words.append(item)

    words.sort(key=lambda item: ({"S": 0, "A": 1, "B": 2}[item["priority"]], item["word"].lower()))
    return words


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    markup, revision = read_document(args.source)
    words = extract_words(markup)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(words, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    counts = {grade: sum(item["priority"] == grade for item in words) for grade in "SAB"}
    print(json.dumps({"source_revision": revision, "total": len(words), "grades": counts, "output": str(args.output)}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
