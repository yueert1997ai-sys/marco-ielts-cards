#!/usr/bin/env python3
"""Enrich Marco IELTS entries with English parts of speech and build a Feishu index."""

from __future__ import annotations

import argparse
import html
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path


PROJECT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT = PROJECT / "data" / "words.json"
DEFAULT_WORK = PROJECT / "work" / "pos-enrichment"

PHRASE_POS = {
    "account for": "v. phr.",
    "be associated with": "adj. phr.",
    "be liable to": "adj. phr.",
    "be subject to": "adj. phr.",
    "comply with": "v. phr.",
    "contribute to": "v. phr.",
    "deal with": "v. phr.",
    "give rise to": "v. phr.",
    "in accordance with": "prep. phr.",
    "in terms of": "prep. phr.",
    "in the absence of": "prep. phr.",
    "lead to": "v. phr.",
    "rather than": "conj. phr.",
    "rely on": "v. phr.",
    "thanks to": "prep. phr.",
    "a lack of": "n. phr.",
    "adapt to": "v. phr.",
    "be capable of doing": "adj. phr.",
    "be prone to": "adj. phr.",
    "carry out": "v. phr.",
    "come across": "v. phr.",
    "have access to": "v. phr.",
    "hold off doing": "v. phr.",
    "it turns out that": "clause pattern",
    "play a major role in": "v. phr.",
    "prefer to": "v. phr.",
    "prove to be": "v. phr.",
    "struggle to do": "v. phr.",
    "work out a plan": "v. phr.",
    "be consistent with": "adj. phr.",
    "manage to do": "v. phr.",
    "out of the question": "adj. phr.",
    "plenty of": "quantifier phr.",
    "refer to": "v. phr.",
}

SINGLE_POS_OVERRIDES = {
    "eco-friendly": "adj.",
}

POS_ALIASES = {
    "noun": "n.",
    "verb": "v.",
    "adjective": "adj.",
    "adverb": "adv.",
    "preposition": "prep.",
    "conjunction": "conj.",
    "pronoun": "pron.",
    "determiner": "det.",
    "exclamation": "interj.",
    "interjection": "interj.",
    "numeral": "num.",
    "number": "num.",
    "article": "art.",
    "auxiliary verb": "aux. v.",
}

POS_ORDER = {
    "n.": 0,
    "v.": 1,
    "adj.": 2,
    "adv.": 3,
    "prep.": 4,
    "conj.": 5,
    "pron.": 6,
    "det.": 7,
    "num.": 8,
    "art.": 9,
    "aux. v.": 10,
    "interj.": 11,
}


def wordnet_pos(word: str) -> str:
    deps = DEFAULT_WORK / "python-deps"
    nltk_data = DEFAULT_WORK / "nltk_data"
    if str(deps) not in sys.path:
        sys.path.insert(0, str(deps))
    try:
        import nltk
        from nltk.corpus import wordnet
    except ImportError:
        return ""

    if str(nltk_data) not in nltk.data.path:
        nltk.data.path.insert(0, str(nltk_data))

    candidates = {
        word.lower().replace(" ", "_"),
        word.lower().replace("-", "_"),
        word.lower().replace("-", ""),
    }
    classes: set[str] = set()
    mapping = {"n": "n.", "v": "v.", "a": "adj.", "s": "adj.", "r": "adv."}
    for candidate in candidates:
        for synset in wordnet.synsets(candidate):
            if synset.pos() in mapping:
                classes.add(mapping[synset.pos()])
    return " / ".join(sorted(classes, key=lambda item: POS_ORDER.get(item, 99)))


def request_json(url: str, attempts: int = 3) -> object:
    request = urllib.request.Request(url, headers={"User-Agent": "MarcoIELTSCards/1.0"})
    for attempt in range(attempts):
        try:
            with urllib.request.urlopen(request, timeout=15) as response:
                return json.load(response)
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
            if attempt + 1 == attempts:
                raise
            time.sleep(0.5 * (attempt + 1))
    raise RuntimeError("unreachable")


def dictionary_pos(word: str) -> str:
    if word in SINGLE_POS_OVERRIDES:
        return SINGLE_POS_OVERRIDES[word]
    if word in PHRASE_POS:
        return PHRASE_POS[word]

    local_result = wordnet_pos(word)
    if local_result:
        return local_result

    encoded = urllib.parse.quote(word)
    url = f"https://api.dictionaryapi.dev/api/v2/entries/en/{encoded}"
    try:
        payload = request_json(url)
    except urllib.error.HTTPError as error:
        if error.code != 404:
            raise
        return ""

    classes: set[str] = set()
    if isinstance(payload, list):
        for entry in payload:
            if not isinstance(entry, dict):
                continue
            for meaning in entry.get("meanings", []):
                raw = str(meaning.get("partOfSpeech", "")).strip().lower()
                if raw in POS_ALIASES:
                    classes.add(POS_ALIASES[raw])

    return " / ".join(sorted(classes, key=lambda item: POS_ORDER.get(item, 99)))


def table_xml(entries: list[dict]) -> str:
    rows = []
    for entry in entries:
        word = html.escape(entry["word"])
        part = html.escape(entry["partOfSpeech"])
        rows.append(f"<tr><td><p><b>{word}</b></p></td><td><p>{part}</p></td></tr>")
    return (
        "<table><colgroup><col width=\"220\"/><col width=\"140\"/></colgroup>"
        "<thead><tr><th><p>词 / 短语</p></th><th><p>词性</p></th></tr></thead>"
        f"<tbody>{''.join(rows)}</tbody></table>"
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--work-dir", type=Path, default=DEFAULT_WORK)
    parser.add_argument("--workers", type=int, default=12)
    args = parser.parse_args()

    words = json.loads(args.input.read_text(encoding="utf-8"))
    args.work_dir.mkdir(parents=True, exist_ok=True)
    cache_path = args.work_dir / "pos-cache.json"
    cache = json.loads(cache_path.read_text(encoding="utf-8")) if cache_path.exists() else {}

    pending = [entry["word"] for entry in words if not cache.get(entry["word"])]
    wordnet_pos("example")
    with ThreadPoolExecutor(max_workers=args.workers) as executor:
        futures = {executor.submit(dictionary_pos, word): word for word in pending}
        for future in as_completed(futures):
            word = futures[future]
            try:
                cache[word] = future.result()
            except Exception:
                cache[word] = ""

    cache_path.write_text(json.dumps(cache, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    for entry in words:
        entry["partOfSpeech"] = cache.get(entry["word"], "")

    unresolved = [entry["word"] for entry in words if not entry["partOfSpeech"]]
    enriched_path = args.work_dir / "enriched-words.json"
    enriched_path.write_text(json.dumps(words, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    chunks: list[str] = []
    header = (
        f"<h1>14｜词性索引（{len(words)}）</h1>"
        "<p>本索引是 S/A/B 主词条的词性元数据视图，供网页单词卡读取。"
        "词性采用常见英文缩写；多词表达按短语或句式功能标注，不改变原词义、可靠改写、来源、等级和学习状态。</p>"
    )
    header_path = args.work_dir / "pos-index-00-header.xml"
    header_path.write_text(header, encoding="utf-8")
    chunks.append(str(header_path))

    part = 1
    for grade in "SAB":
        grade_entries = [entry for entry in words if entry["priority"] == grade]
        for index in range(0, len(grade_entries), 80):
            batch = grade_entries[index : index + 80]
            start = index + 1
            end = index + len(batch)
            heading = f"<h2>{grade}｜{start:03d}–{end:03d}</h2>"
            path = args.work_dir / f"pos-index-{part:02d}-{grade}-{start:03d}-{end:03d}.xml"
            path.write_text(heading + table_xml(batch), encoding="utf-8")
            chunks.append(str(path))
            part += 1

    manifest = {
        "total": len(words),
        "resolved": len(words) - len(unresolved),
        "unresolved": unresolved,
        "chunks": chunks,
        "enriched": str(enriched_path),
    }
    (args.work_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(manifest, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
