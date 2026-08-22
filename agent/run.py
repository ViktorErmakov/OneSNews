#!/usr/bin/env python3
"""Collect sources for a date, summarize with Gemini when needed, write day JSON."""

from __future__ import annotations

import argparse
import logging
import sys
from datetime import date, timedelta
from pathlib import Path

AGENT = Path(__file__).resolve().parent
if str(AGENT) not in sys.path:
	sys.path.insert(0, str(AGENT))

from collect import collect, collect_range  # noqa: E402
from common import clean_snippet, load_dotenv, slug_id  # noqa: E402
from summarize import summarize  # noqa: E402
from write_day import merge_sources_into_day, write_day, write_sources_catalog  # noqa: E402


def build_parser() -> argparse.ArgumentParser:
	p = argparse.ArgumentParser(description="OneS News daily collect + summarize")
	p.add_argument("--date", help="YYYY-MM-DD (overrides agent/config.yaml)")
	p.add_argument("--from-date", dest="from_date", help="Range start YYYY-MM-DD (with --to-date)")
	p.add_argument("--to-date", dest="to_date", help="Range end YYYY-MM-DD (with --from-date)")
	p.add_argument("--collect-only", action="store_true", help="Stop after raw JSON")
	p.add_argument("--skip-llm", action="store_true", help="Write day file using snippets as summaries")
	return p


def apply_direct_summary(item: dict) -> dict:
	summary = clean_snippet(item.get("snippet") or item.get("title") or "")
	item["title"] = clean_snippet(item.get("title") or "Без названия")
	item["summary"] = summary
	return item


def summarize_items(items: list[dict], skip_llm: bool) -> list[dict]:
	if skip_llm:
		return [apply_direct_summary(item) for item in items]
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
	return merged


def write_collected_day(day: date, items: list[dict], *, merge: bool) -> None:
	if merge:
		path = merge_sources_into_day(day, items)
		if path is None:
			logging.info("No items for %s — day file not created", day.isoformat())
		return
	write_day(day, items)


def process_day(day: date, items: list[dict], args: argparse.Namespace, *, merge: bool) -> int:
	if not items:
		logging.info("No items for %s — day file not created", day.isoformat())
		return 0
	for i, item in enumerate(items, start=1):
		item["id"] = slug_id(day, i)
	if args.collect_only:
		logging.info("Collect-only: %s items for %s", len(items), day.isoformat())
		return 0
	items = summarize_items(items, args.skip_llm)
	write_collected_day(day, items, merge=merge)
	return 0


def each_date(start: date, end: date):
	cursor = start
	while cursor <= end:
		yield cursor
		cursor += timedelta(days=1)


def main() -> int:
	logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
	load_dotenv()
	args = build_parser().parse_args()
	write_sources_catalog()
	if (args.from_date and not args.to_date) or (args.to_date and not args.from_date):
		logging.error("Use both --from-date and --to-date")
		return 2
	if args.from_date and args.date:
		logging.error("Do not mix --date with --from-date/--to-date")
		return 2

	if args.from_date:
		start = date.fromisoformat(args.from_date)
		end = date.fromisoformat(args.to_date)
		by_day = collect_range(start, end)
		if args.collect_only:
			total = sum(len(v) for v in by_day.values())
			logging.info("Collect-only range %s..%s: %s items, %s days", start, end, total, len(by_day))
			return 0
		code = 0
		for day in each_date(start, end):
			items = by_day.get(day, [])
			code = process_day(day, items, args, merge=True) or code
		return code

	day, items = collect(cli_date=args.date)
	return process_day(day, items, args, merge=False)


if __name__ == "__main__":
	try:
		raise SystemExit(main())
	except Exception as exc:  # noqa: BLE001
		logging.exception("%s", exc)
		raise SystemExit(1)
