#!/usr/bin/env python3
"""Collect sources for a date, summarize with Gemini when needed, write day JSON."""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

AGENT = Path(__file__).resolve().parent
if str(AGENT) not in sys.path:
	sys.path.insert(0, str(AGENT))

from collect import collect  # noqa: E402
from common import clean_snippet, load_dotenv, slug_id  # noqa: E402
from summarize import summarize  # noqa: E402
from write_day import write_day  # noqa: E402


def build_parser() -> argparse.ArgumentParser:
	p = argparse.ArgumentParser(description="OneS News daily collect + summarize")
	p.add_argument("--date", help="YYYY-MM-DD (overrides agent/config.yaml)")
	p.add_argument("--collect-only", action="store_true", help="Stop after raw JSON")
	p.add_argument("--skip-llm", action="store_true", help="Write day file using snippets as summaries")
	return p


def apply_direct_summary(item: dict) -> dict:
	summary = clean_snippet(item.get("snippet") or item.get("title") or "")
	item["title"] = clean_snippet(item.get("title") or "Без названия")
	item["summary"] = summary
	return item


def main() -> int:
	logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
	load_dotenv()
	args = build_parser().parse_args()

	day, items = collect(cli_date=args.date)
	if not items:
		logging.info("No items for %s — day file not created", day.isoformat())
		return 0

	for i, item in enumerate(items, start=1):
		item["id"] = slug_id(day, i)

	if args.collect_only:
		logging.info("Collect-only: %s items", len(items))
		return 0

	if args.skip_llm:
		items = [apply_direct_summary(item) for item in items]
	else:
		direct = [item for item in items if item.get("summarize") is False]
		need_llm = [item for item in items if item.get("summarize") is not False]
		for item in direct:
			apply_direct_summary(item)
		if need_llm:
			logging.info("Gemini summaries for %s items", len(need_llm))
			need_llm = summarize(need_llm)
		else:
			logging.info("All sources have summarize: false — skip Gemini")
		by_id = {item["id"]: item for item in need_llm}
		merged = []
		for item in items:
			merged.append(by_id.get(item["id"], item))
		items = merged

	write_day(day, items)
	return 0


if __name__ == "__main__":
	try:
		raise SystemExit(main())
	except Exception as exc:  # noqa: BLE001
		logging.exception("%s", exc)
		raise SystemExit(1)
