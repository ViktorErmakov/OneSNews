from __future__ import annotations

import argparse
import json
import logging
import re
import sys
import time
from datetime import date, datetime
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin
from zoneinfo import ZoneInfo

from bs4 import BeautifulSoup
from bs4.element import Tag

AGENT = Path(__file__).resolve().parent
if str(AGENT) not in sys.path:
	sys.path.insert(0, str(AGENT))

from common import TMP, clip, load_config, load_sources, resolve_date, strip_html
from collect import http_get, local_date, source_meta

logger = logging.getLogger(__name__)

BASE = "https://1c-dn.com"
DATE_RE = re.compile(r"^(\d{2})\.(\d{2})\.(\d{4})$")
MIN_RE = re.compile(r"^\d+\s*min$", re.I)
BLOG_PATH_RE = re.compile(r"^https?://(?:www\.)?1c-dn\.com/blog/[^/?#]+/?$", re.I)
MAX_PAGES = 25
PAGE_PAUSE_SEC = 0.4


class OnesDnContractError(Exception):
	"""Blog HTML no longer matches the expected listing contract."""


def abs_url(href: str) -> str:
	href = (href or "").strip()
	if not href:
		return ""
	url = urljoin(BASE + "/", href)
	return url.split("#", 1)[0].split("?", 1)[0]


def pagen_number(url: str) -> int:
	m = re.search(r"PAGEN_1=(\d+)", url or "")
	return int(m.group(1)) if m else 1


def parse_listing_date(text: str) -> date | None:
	m = DATE_RE.match(re.sub(r"\s+", "", text or ""))
	if not m:
		return None
	try:
		return date(int(m.group(3)), int(m.group(2)), int(m.group(1)))
	except ValueError:
		return None


def listing_datetime(day: date | None, tz: ZoneInfo) -> datetime | None:
	if day is None:
		return None
	return datetime(day.year, day.month, day.day, tzinfo=tz)


def next_listing_url(soup: BeautifulSoup, current_url: str) -> str | None:
	wanted = pagen_number(current_url) + 1
	for a in soup.select("div.page-navi a[href*='PAGEN_1=']"):
		href = str(a.get("href") or "")
		if pagen_number(href) == wanted:
			return urljoin(current_url, href)
	return None


def parse_post(post: Tag) -> dict | None:
	title_el = post.select_one("a.post-title")
	if title_el is None:
		return None
	url = abs_url(str(title_el.get("href") or ""))
	title = title_el.get_text(" ", strip=True)
	if not url or not title or not BLOG_PATH_RE.match(url):
		return None
	author_el = post.select_one("p.username")
	author = author_el.get_text(" ", strip=True) if author_el else ""
	day = None
	for span in post.select(".text-block > span"):
		if "dot" in (span.get("class") or []):
			continue
		text = span.get_text(" ", strip=True)
		if MIN_RE.match(text):
			continue
		day = parse_listing_date(text)
		if day is not None:
			break
	return {
		"title": title,
		"url": url,
		"author": author,
		"day": day,
	}


def assert_listing_contract(url: str, html: str, posts: list[Tag]) -> None:
	if "posts-block" not in html and not posts:
		raise OnesDnContractError(
			f"1c-dn: HTML_CONTRACT_BROKEN reason=no_listing_marker url={url} html_len={len(html)}"
		)
	if not posts:
		raise OnesDnContractError(
			f"1c-dn: HTML_CONTRACT_BROKEN reason=zero_posts url={url} html_len={len(html)}"
		)


def parse_listing_html(html: str, url: str) -> list[dict]:
	soup = BeautifulSoup(html, "lxml")
	posts = soup.select("div.posts-block div.post")
	assert_listing_contract(url, html, posts)
	rows: list[dict] = []
	for post in posts:
		raw = parse_post(post)
		if raw is None:
			continue
		rows.append(raw)
	if not rows:
		raise OnesDnContractError(
			f"1c-dn: HTML_CONTRACT_BROKEN reason=unparsed_posts url={url} html_len={len(html)}"
		)
	return rows


def article_snippet(html: str, snippet_chars: int) -> tuple[str, list[str]]:
	soup = BeautifulSoup(html, "lxml")
	topics: list[str] = []
	for a in soup.select(".breadcrumb a[href*='industry=']"):
		label = a.get_text(" ", strip=True)
		if label:
			topics.append(label)
	root = soup.select_one(".post-page .text") or soup.select_one(".article-content .text")
	if root is None:
		return "", topics
	parts: list[str] = []
	for child in root.find_all(["p", "li"], recursive=True):
		if child.find_parent("blockquote") is not None:
			continue
		text = child.get_text(" ", strip=True)
		if not text:
			continue
		parts.append(text)
		joined = " ".join(parts)
		if len(joined) >= snippet_chars:
			break
	return clip(strip_html(" ".join(parts)), snippet_chars), topics


def fetch_html(url: str) -> str:
	try:
		data = http_get(url)
	except HTTPError as exc:
		raise OnesDnContractError(f"1c-dn: HTTP {exc.code} {url}") from exc
	except URLError as exc:
		raise OnesDnContractError(f"1c-dn: request failed {url}: {exc}") from exc
	return data.decode("utf-8", errors="replace")


def enrich_row(row: dict, snippet_chars: int) -> None:
	try:
		html = fetch_html(row["url"])
	except OnesDnContractError as exc:
		logger.warning("1c-dn: skip snippet %s: %s", row["url"], exc)
		return
	except Exception as exc:  # noqa: BLE001
		logger.warning("1c-dn: skip snippet %s: %s", row["url"], exc)
		return
	snippet, topics = article_snippet(html, snippet_chars)
	if snippet:
		row["snippet"] = snippet
	if topics:
		row["topics"] = topics


def collect_listing(
	base_url: str,
	start: date,
	end: date,
	tz: ZoneInfo,
) -> list[dict]:
	collected: list[dict] = []
	url = base_url
	for page in range(1, MAX_PAGES + 1):
		if page > 1:
			time.sleep(PAGE_PAUSE_SEC)
		html = fetch_html(url)
		soup = BeautifulSoup(html, "lxml")
		rows = parse_listing_html(html, url)
		page_days = [row["day"] for row in rows if row.get("day")]
		for row in rows:
			day = row.get("day")
			if day is None or day < start or day > end:
				continue
			collected.append(
				{
					**row,
					"published": listing_datetime(day, tz),
					"snippet": "",
					"topics": [],
				}
			)
		oldest = min(page_days) if page_days else None
		if oldest is not None and oldest < start:
			break
		next_url = next_listing_url(soup, url)
		if not next_url or next_url == url:
			break
		url = next_url
	else:
		logger.warning("1c-dn: hit max_pages=%s", MAX_PAGES)
	return collected


def to_raw_item(row: dict, source: dict, snippet_chars: int) -> dict:
	published = row.get("published")
	author = (row.get("author") or "").strip() or source.get("name") or "1C:DN"
	return {
		"title": row.get("title") or "Untitled",
		"url": row.get("url") or "",
		"author": author,
		"published_at": published.isoformat() if published else None,
		"snippet": clip(strip_html(row.get("snippet") or ""), snippet_chars),
		**source_meta(source, row.get("topics") or []),
	}


def collect_1cdn_range(
	source: dict,
	start: date,
	end: date,
	tz: ZoneInfo,
	snippet_chars: int,
) -> dict[date, list[dict]]:
	base_url = (source.get("url") or f"{BASE}/blog/").strip() or f"{BASE}/blog/"
	rows = collect_listing(base_url, start, end, tz)
	for index, row in enumerate(rows):
		if index:
			time.sleep(PAGE_PAUSE_SEC)
		enrich_row(row, snippet_chars)
	buckets: dict[date, list[dict]] = {}
	for row in rows:
		item = to_raw_item(row, source, snippet_chars)
		day = local_date(row.get("published"), tz)
		if day is None or day < start or day > end:
			continue
		buckets.setdefault(day, []).append(item)
	for day, group in buckets.items():
		group.sort(key=lambda it: it.get("published_at") or "", reverse=True)
		logger.info("1c-dn: %s items for %s", len(group), day.isoformat())
	if not buckets:
		logger.info("1c-dn: 0 items after filter for %s..%s", start.isoformat(), end.isoformat())
	return buckets


def collect_1cdn_source(source: dict, target: date, tz: ZoneInfo, snippet_chars: int) -> list[dict]:
	return collect_1cdn_range(source, target, target, tz, snippet_chars).get(target, [])


def ones_dn_source_from_yaml() -> dict:
	for src in load_sources(include_disabled=True):
		if src.get("fetch") == "1c_dn":
			return src
	raise SystemExit("1C:DN source (fetch: 1c_dn) is missing from sources.yaml")


def main() -> int:
	logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
	parser = argparse.ArgumentParser(description="Collect 1C:DN blog items")
	parser.add_argument("--date", help="YYYY-MM-DD (overrides config)")
	parser.add_argument("--from-date", dest="from_date")
	parser.add_argument("--to-date", dest="to_date")
	parser.add_argument(
		"--write-day",
		action="store_true",
		help="Merge into data/days without replacing other sources",
	)
	args = parser.parse_args()
	if (args.from_date and not args.to_date) or (args.to_date and not args.from_date):
		logger.error("Use both --from-date and --to-date")
		return 2
	if args.from_date and args.date:
		logger.error("Do not mix --date with --from-date/--to-date")
		return 2
	config = load_config()
	tz = ZoneInfo(config.get("timezone") or "Europe/Moscow")
	snippet_chars = int(config.get("snippet_chars") or 600)
	max_items = int(config.get("max_items") or 40)
	source = ones_dn_source_from_yaml()
	if args.from_date:
		start = date.fromisoformat(args.from_date)
		end = date.fromisoformat(args.to_date)
		try:
			by_day = collect_1cdn_range(source, start, end, tz, snippet_chars)
		except OnesDnContractError as exc:
			logger.error("%s", exc)
			return 1
		TMP.mkdir(parents=True, exist_ok=True)
		payload = {day.isoformat(): items[:max_items] for day, items in sorted(by_day.items())}
		out = TMP / f"raw-1cdn-{start.isoformat()}_{end.isoformat()}.json"
		out.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
		logger.info("Wrote %s", out)
		if args.write_day:
			from run import apply_direct_summary
			from write_day import merge_sources_into_day, write_sources_catalog

			write_sources_catalog()
			for day, items in sorted(by_day.items()):
				capped = [apply_direct_summary(item) for item in items[:max_items]]
				merge_sources_into_day(day, capped, replace_names={source.get("name")})
		return 0

	day = resolve_date(config, args.date)
	try:
		items = collect_1cdn_source(source, day, tz, snippet_chars)
	except OnesDnContractError as exc:
		logger.error("%s", exc)
		return 1
	items = items[:max_items]
	TMP.mkdir(parents=True, exist_ok=True)
	out = TMP / f"raw-1cdn-{day.isoformat()}.json"
	out.write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")
	logger.info("Wrote %s raw 1C:DN items to %s", len(items), out)
	if args.write_day:
		from run import apply_direct_summary
		from write_day import merge_sources_into_day, write_sources_catalog

		write_sources_catalog()
		capped = [apply_direct_summary(item) for item in items]
		if capped:
			merge_sources_into_day(day, capped, replace_names={source.get("name")})
	return 0


if __name__ == "__main__":
	raise SystemExit(main())
