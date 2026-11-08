from __future__ import annotations

import json
import logging
import re
import sys
import time
from datetime import date, datetime
from pathlib import Path
from urllib.error import HTTPError, URLError
from zoneinfo import ZoneInfo

from bs4 import BeautifulSoup

AGENT = Path(__file__).resolve().parent
if str(AGENT) not in sys.path:
	sys.path.insert(0, str(AGENT))

from common import TMP, clip, load_config, load_sources, resolve_date, strip_html
from collect import http_get, source_meta

logger = logging.getLogger(__name__)

BASE = "https://kb.1ci.com/1C_Drive/Whats_New_in_Documentation"
STATE_PATH = AGENT / "state" / "1ci_drive_whats_new.json"
QUARTER_RE = re.compile(r"^Q([1-4])_(\d{4})$")
DIGEST_TITLE_RE = re.compile(
	r"1C:Drive\s+Q([1-4])\s+(\d{4})\s+Digest",
	re.IGNORECASE,
)
MAX_PROBE = 8
PAGE_PAUSE_SEC = 0.4


class OnesCiKbContractError(Exception):
	"""Digest HTML no longer matches the expected contract."""


def parse_quarter(value: str) -> tuple[int, int] | None:
	m = QUARTER_RE.match((value or "").strip())
	if not m:
		return None
	return int(m.group(1)), int(m.group(2))


def format_quarter(q: int, year: int) -> str:
	return f"Q{q}_{year}"


def next_quarter(value: str) -> str:
	parsed = parse_quarter(value)
	if parsed is None:
		raise ValueError(f"Invalid quarter key: {value!r}")
	q, year = parsed
	if q == 4:
		return format_quarter(1, year + 1)
	return format_quarter(q + 1, year)


def quarter_sort_key(value: str) -> tuple[int, int]:
	parsed = parse_quarter(value)
	if parsed is None:
		raise ValueError(f"Invalid quarter key: {value!r}")
	q, year = parsed
	return year, q


def digest_url(quarter: str) -> str:
	return f"{BASE}/{quarter}/?language=en"


def load_last_quarter() -> str:
	if not STATE_PATH.exists():
		return "Q2_2026"
	try:
		data = json.loads(STATE_PATH.read_text(encoding="utf-8"))
	except (OSError, json.JSONDecodeError) as exc:
		raise OnesCiKbContractError(f"1ci-kb: bad state file {STATE_PATH}: {exc}") from exc
	value = str((data or {}).get("last_quarter") or "").strip()
	if parse_quarter(value) is None:
		raise OnesCiKbContractError(f"1ci-kb: invalid last_quarter in state: {value!r}")
	return value


def save_last_quarter(quarter: str) -> None:
	if parse_quarter(quarter) is None:
		raise ValueError(f"Invalid quarter key: {quarter!r}")
	STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
	payload = {"last_quarter": quarter}
	STATE_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
	logger.info("1ci-kb: saved last_quarter=%s", quarter)


def commit_cursor_from_items(items: list[dict]) -> None:
	quarters: list[str] = []
	for item in items:
		q = str(item.get("digest_quarter") or "").strip()
		if parse_quarter(q) is not None:
			quarters.append(q)
	if not quarters:
		return
	newest = max(quarters, key=quarter_sort_key)
	current = load_last_quarter()
	if quarter_sort_key(newest) > quarter_sort_key(current):
		save_last_quarter(newest)


def fetch_html(url: str) -> str | None:
	"""Return HTML, None on 404, raise on other failures."""
	try:
		data = http_get(url)
	except HTTPError as exc:
		if exc.code == 404:
			return None
		raise OnesCiKbContractError(f"1ci-kb: HTTP {exc.code} {url}") from exc
	except URLError as exc:
		raise OnesCiKbContractError(f"1ci-kb: request failed {url}: {exc}") from exc
	return data.decode("utf-8", errors="replace")


def parse_digest_html(html: str, url: str) -> dict:
	soup = BeautifulSoup(html, "lxml")
	title = ""
	heading = None
	for tag in soup.find_all(["h1", "h2"]):
		text = tag.get_text(" ", strip=True)
		text = re.sub(r"^[\W_]+", "", text or "", flags=re.UNICODE).strip()
		if DIGEST_TITLE_RE.search(text):
			title = text
			heading = tag
			break
	if not title or heading is None:
		raise OnesCiKbContractError(
			f"1ci-kb: HTML_CONTRACT_BROKEN reason=no_digest_heading url={url} html_len={len(html)}"
		)
	m = DIGEST_TITLE_RE.search(title)
	assert m is not None
	quarter = format_quarter(int(m.group(1)), int(m.group(2)))
	title = f"1C:Drive Q{m.group(1)} {m.group(2)} Digest"

	paragraph = ""
	for sib in heading.next_siblings:
		name = getattr(sib, "name", None)
		if name in {"h1", "h2", "h3", "h4", "ul", "ol"}:
			break
		if name == "p":
			paragraph = sib.get_text(" ", strip=True)
			if paragraph:
				break
	if not paragraph:
		# Fallback: first meaningful p in content area after heading text match
		for p in soup.find_all("p"):
			text = p.get_text(" ", strip=True)
			if len(text) >= 40:
				paragraph = text
				break
	if not paragraph:
		raise OnesCiKbContractError(
			f"1ci-kb: HTML_CONTRACT_BROKEN reason=no_intro_paragraph url={url} html_len={len(html)}"
		)
	return {
		"title": title,
		"snippet": paragraph,
		"url": url.split("#", 1)[0],
		"quarter": quarter,
	}


def probe_new_digests(after_quarter: str) -> list[dict]:
	found: list[dict] = []
	cursor = after_quarter
	for index in range(MAX_PROBE):
		cursor = next_quarter(cursor)
		url = digest_url(cursor)
		if index:
			time.sleep(PAGE_PAUSE_SEC)
		html = fetch_html(url)
		if html is None:
			logger.info("1ci-kb: no page yet for %s", cursor)
			break
		try:
			row = parse_digest_html(html, url)
		except OnesCiKbContractError as exc:
			# Stub/empty XWiki shells often return 200 without a Digest heading.
			logger.info("1ci-kb: %s not ready yet (%s)", cursor, exc)
			break
		# URL slug is source of truth for quarter key
		row["quarter"] = cursor
		found.append(row)
		logger.info("1ci-kb: found %s", cursor)
	return found


def to_raw_item(row: dict, source: dict, target: date, tz: ZoneInfo, snippet_chars: int) -> dict:
	published = datetime(target.year, target.month, target.day, tzinfo=tz)
	author = (source.get("name") or "1C:Drive Docs Digest").strip()
	return {
		"title": row.get("title") or "Untitled",
		"url": row.get("url") or "",
		"author": author,
		"published_at": published.isoformat(),
		"snippet": clip(strip_html(row.get("snippet") or ""), snippet_chars),
		"digest_quarter": row.get("quarter") or "",
		**source_meta(source),
	}


def collect_1ci_kb_source(source: dict, target: date, tz: ZoneInfo, snippet_chars: int) -> list[dict]:
	last = load_last_quarter()
	rows = probe_new_digests(last)
	items = [to_raw_item(row, source, target, tz, snippet_chars) for row in rows]
	if not items:
		logger.info("1ci-kb: 0 new digests after %s for %s", last, target.isoformat())
	else:
		logger.info("1ci-kb: %s new digest(s) for %s", len(items), target.isoformat())
	return items


def collect_1ci_kb_range(
	source: dict,
	start: date,
	end: date,
	tz: ZoneInfo,
	snippet_chars: int,
) -> dict[date, list[dict]]:
	# New digests are attributed to the end (collection) day of the range.
	items = collect_1ci_kb_source(source, end, tz, snippet_chars)
	if not items:
		return {}
	return {end: items}


def ones_ci_kb_source_from_yaml() -> dict:
	for src in load_sources(include_disabled=True):
		if src.get("fetch") == "1ci_kb_docs":
			return src
	raise SystemExit("1C:Drive Docs Digest source (fetch: 1ci_kb_docs) is missing from sources.yaml")


def main() -> int:
	import argparse

	logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
	parser = argparse.ArgumentParser(description="Collect 1Ci KB Drive documentation digests")
	parser.add_argument("--date", help="YYYY-MM-DD (overrides config)")
	parser.add_argument(
		"--write-day",
		action="store_true",
		help="Merge into data/days and advance cursor",
	)
	args = parser.parse_args()
	config = load_config()
	tz = ZoneInfo(config.get("timezone") or "Europe/Moscow")
	snippet_chars = int(config.get("snippet_chars") or 600)
	max_items = int(config.get("max_items") or 40)
	source = ones_ci_kb_source_from_yaml()
	day = resolve_date(config, args.date)
	try:
		items = collect_1ci_kb_source(source, day, tz, snippet_chars)[:max_items]
	except OnesCiKbContractError as exc:
		logger.error("%s", exc)
		return 1
	TMP.mkdir(parents=True, exist_ok=True)
	out = TMP / f"raw-1ci-kb-{day.isoformat()}.json"
	out.write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")
	logger.info("Wrote %s raw 1ci-kb items to %s", len(items), out)
	if args.write_day and items:
		from run import apply_direct_summary
		from write_day import merge_sources_into_day, write_sources_catalog

		write_sources_catalog()
		capped = [apply_direct_summary(item) for item in items]
		merge_sources_into_day(day, capped, replace_names={source.get("name")})
		commit_cursor_from_items(capped)
	return 0


if __name__ == "__main__":
	raise SystemExit(main())
