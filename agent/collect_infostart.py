from __future__ import annotations

import argparse
import json
import logging
import re
import sys
import time
from datetime import date, datetime, timedelta
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

from bs4 import BeautifulSoup
from bs4.element import Tag
import feedparser

from common import (
	TMP,
	clean_snippet,
	clip,
	load_config,
	load_sources,
	resolve_date,
	strip_html,
)
from collect import USER_AGENT, local_date, parse_datetime, source_meta

logger = logging.getLogger(__name__)

CATALOGS = (
	"https://infostart.ru/1c/articles/",
	"https://infostart.ru/1c/tools/",
	"https://infostart.ru/1c/reports/",
)
MAX_PAGES = 25
PAGE_PAUSE_SEC = 0.4
FIELD_FAIL_RATIO = 0.3
EDITORIAL_AUTHORS = {
	"infostart",
	"infostart-press",
	"infostart_press",
	"infostart.ru",
	"infostart.press",
}
ARTICLE_RE = re.compile(r"^https?://(?:www\.)?infostart\.ru/1c/articles/\d+/?$", re.I)
TOOL_RE = re.compile(r"^https?://(?:www\.)?infostart\.ru/1c/tools/\d+/?$", re.I)
REPORT_RE = re.compile(r"^https?://(?:www\.)?infostart\.ru/1c/reports/\d+/?$", re.I)
DROP_PATH_RE = re.compile(
	r"/journal/news/|/support/|/marketplace/|/edu/|/event/",
	re.I,
)
RUBLE_RE = re.compile(r"(?<!\w)\d[\d\s]*\s*руб", re.I)
SM_RE = re.compile(r"\d+\s*стартмани", re.I)
ABS_DATE_RE = re.compile(r"^(\d{1,2})\.(\d{1,2})\.(\d{4})")
TIME_RE = re.compile(r"в\s+(\d{1,2}):(\d{2})")
COPYRIGHT_RE = re.compile(
	r"©\s*(?:<a\b[^>]*>)?\s*([^<]+?)\s*(?:</a>)?",
	re.I,
)


class InfostartContractError(Exception):
	"""Listing HTML no longer matches the expected catalog contract."""


def http_get_html(url: str, timeout: int = 30) -> tuple[int, bytes, str]:
	req = Request(url, headers={"User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml,*/*"})
	with urlopen(req, timeout=timeout) as resp:  # noqa: S310
		return int(resp.status), resp.read(), resp.headers.get("Content-Type") or ""


def decode_html(data: bytes, content_type: str = "") -> str:
	lower = content_type.lower()
	head = data[:800].lower()
	if "utf-8" in lower or b"charset=utf-8" in head:
		return data.decode("utf-8", errors="replace")
	return data.decode("cp1251", errors="replace")


def abs_url(href: str) -> str:
	href = (href or "").strip()
	if not href:
		return ""
	url = urljoin("https://infostart.ru/", href)
	return url.split("#", 1)[0].split("?", 1)[0]


def catalog_page_url(base: str, page: int) -> str:
	if page <= 1:
		return base
	sep = "&" if "?" in base else "?"
	return f"{base}{sep}PAGEN_1={page}"


def pagen_number(url: str) -> int:
	m = re.search(r"PAGEN_1=(\d+)", url)
	return int(m.group(1)) if m else 1


def next_catalog_url(soup: BeautifulSoup, current_url: str) -> str | None:
	wanted = pagen_number(current_url) + 1
	for a in soup.select("a[href*='PAGEN_1=']"):
		href = str(a.get("href") or "")
		if pagen_number(href) == wanted:
			return urljoin(current_url, href)
	return None


def parse_catalog_date(text: str, today: date) -> date | None:
	text = re.sub(r"\s+", " ", (text or "").strip()).lower()
	if not text:
		return None
	if text.startswith("сегодня"):
		return today
	if text.startswith("вчера"):
		return today - timedelta(days=1)
	m = ABS_DATE_RE.match(text)
	if m:
		try:
			return date(int(m.group(3)), int(m.group(2)), int(m.group(1)))
		except ValueError:
			return None
	return None


def parse_catalog_datetime(text: str, today: date, tz: ZoneInfo) -> datetime | None:
	day = parse_catalog_date(text, today)
	if day is None:
		return None
	hour, minute = 0, 0
	m = TIME_RE.search(text or "")
	if m:
		hour, minute = int(m.group(1)), int(m.group(2))
	return datetime(day.year, day.month, day.day, hour, minute, tzinfo=tz)


def span_after_icon(root: Tag | None, icon_class: str) -> str:
	if root is None:
		return ""
	icon = root.select_one(f"i.{icon_class.replace(' ', '.')}")
	if icon is None:
		return ""
	parent = icon.find_parent("span") or icon.parent
	if parent is None:
		return ""
	return parent.get_text(" ", strip=True)


def card_blob(card: Tag) -> str:
	return card.get_text(" ", strip=True)


def is_editorial_author(author: str) -> bool:
	key = re.sub(r"\s+", " ", (author or "").strip()).lower()
	return key in EDITORIAL_AUTHORS or key.startswith("infostart ")


def is_ruble_publication(blob: str) -> bool:
	if SM_RE.search(blob) or re.search(r"бесплатно", blob, re.I):
		return False
	return bool(RUBLE_RE.search(blob))


def accept_url(url: str, blob: str) -> bool:
	if not url or DROP_PATH_RE.search(url):
		return False
	if ARTICLE_RE.match(url):
		return True
	if TOOL_RE.match(url) or REPORT_RE.match(url):
		if is_ruble_publication(blob):
			return False
		return True
	return False


def clean_infostart_snippet(text: str, snippet_chars: int) -> str:
	text = strip_html(text or "")
	text = re.sub(r"©\s*\S+", " ", text)
	text = re.sub(r"(?i)версия для печати\.?", " ", text)
	text = re.sub(r"\s+", " ", text).strip()
	return clip(text, snippet_chars)


def parse_card(card: Tag, today: date, tz: ZoneInfo) -> dict | None:
	name = card.select_one("div.publication-name a[href]")
	if name is None:
		return None
	href = str(name.get("href") or "")
	url = abs_url(href)
	title = name.get_text(" ", strip=True)
	desc = card.select_one("p.desc-article")
	date_text = span_after_icon(desc, "fa-calendar")
	author = span_after_icon(desc, "fa-user") or "Не указан"
	preview = card.select_one("p.public-preview-text-wrap")
	snippet = preview.get_text(" ", strip=True) if preview else ""
	published = parse_catalog_datetime(date_text, today, tz)
	return {
		"title": title,
		"url": url,
		"author": author,
		"date_text": date_text,
		"published": published,
		"snippet": snippet,
		"blob": card_blob(card),
	}


def soup_from_bytes(data: bytes, content_type: str) -> BeautifulSoup:
	return BeautifulSoup(decode_html(data, content_type), "lxml")


def fetch_catalog_page(url: str) -> tuple[BeautifulSoup, str]:
	try:
		status, data, content_type = http_get_html(url)
	except HTTPError as exc:
		raise InfostartContractError(f"infostart: HTTP {exc.code} {url}") from exc
	except URLError as exc:
		raise InfostartContractError(f"infostart: request failed {url}: {exc}") from exc
	if status != 200:
		raise InfostartContractError(f"infostart: HTTP {status} {url}")
	html = decode_html(data, content_type)
	return BeautifulSoup(html, "lxml"), html


def assert_catalog_contract(url: str, html: str, cards: list[Tag]) -> None:
	if "publication-item" not in html and not cards:
		raise InfostartContractError(
			f"infostart: HTML_CONTRACT_BROKEN reason=no_catalog_marker url={url} html_len={len(html)}"
		)
	if not cards:
		raise InfostartContractError(
			f"infostart: HTML_CONTRACT_BROKEN reason=zero_cards url={url} html_len={len(html)}"
		)


def collect_catalog(
	base_url: str,
	start: date,
	end: date,
	tz: ZoneInfo,
	today: date,
) -> tuple[list[dict], bool]:
	"""Return cards with start <= date <= end; stop after pages older than start."""
	collected: list[dict] = []
	prev_urls: list[str] | None = None
	prev_oldest: date | None = None
	saw_older = False
	broken_fields = 0
	parsed_ok = 0
	url = base_url

	for page in range(1, MAX_PAGES + 1):
		soup, html = fetch_catalog_page(url)
		cards = soup.select("div.publication-item")
		assert_catalog_contract(url, html, cards)
		page_urls: list[str] = []
		page_dates: list[date] = []
		kept_here = 0
		for card in cards:
			raw = parse_card(card, today, tz)
			if raw is None or not raw.get("url") or not raw.get("title"):
				broken_fields += 1
				continue
			parsed_ok += 1
			page_urls.append(raw["url"])
			day = raw["published"].date() if raw["published"] else None
			if day is None:
				broken_fields += 1
				continue
			page_dates.append(day)
			if start <= day <= end:
				collected.append(raw)
				kept_here += 1
			elif day < start:
				saw_older = True
		if parsed_ok + broken_fields and broken_fields / max(parsed_ok + broken_fields, 1) > FIELD_FAIL_RATIO:
			raise InfostartContractError(
				f"infostart: HTML_CONTRACT_BROKEN reason=fields_missing parsed={parsed_ok} broken={broken_fields} url={url}"
			)
		if prev_urls is not None and page_urls[:3] and page_urls[:3] == prev_urls[:3]:
			logger.warning(
				"infostart: pagination returned the same URLs as previous page, stop url=%s",
				url,
			)
			break
		newest = max(page_dates) if page_dates else None
		oldest = min(page_dates) if page_dates else None
		if prev_oldest is not None and newest is not None and prev_oldest > newest:
			gap_from = newest + timedelta(days=1)
			gap_to = prev_oldest - timedelta(days=1)
			if gap_from <= end and gap_to >= start:
				logger.warning(
					"infostart: catalog date gap %s .. %s on %s",
					gap_from.isoformat(),
					gap_to.isoformat(),
					url,
				)
		prev_urls = page_urls
		prev_oldest = oldest
		logger.info("infostart: %s page %s cards=%s kept=%s", url, page, len(cards), kept_here)
		if saw_older:
			break
		next_url = next_catalog_url(soup, url)
		if not next_url:
			break
		url = next_url
		if page < MAX_PAGES:
			time.sleep(PAGE_PAUSE_SEC)
	else:
		logger.warning("infostart: hit max_pages=%s on %s", MAX_PAGES, base_url)

	return collected, saw_older


def rss_author_and_snippet(entry: dict, snippet_chars: int) -> tuple[str, str]:
	raw_html = ""
	if entry.get("content"):
		raw_html = entry["content"][0].get("value") or ""
	if not raw_html:
		raw_html = entry.get("summary") or entry.get("description") or ""
	author = ""
	m = COPYRIGHT_RE.search(raw_html)
	if m:
		author = strip_html(m.group(1))
	return author or "Не указан", clean_infostart_snippet(raw_html, snippet_chars)


def collect_rss_articles(rss_url: str, start: date, end: date, tz: ZoneInfo, snippet_chars: int) -> list[dict]:
	try:
		req = Request(rss_url, headers={"User-Agent": USER_AGENT, "Accept": "application/rss+xml,*/*"})
		with urlopen(req, timeout=30) as resp:  # noqa: S310
			xml_bytes = resp.read()
	except (HTTPError, URLError) as exc:
		logger.warning("infostart: RSS fetch failed %s: %s", rss_url, exc)
		return []
	parsed = feedparser.parse(xml_bytes)
	items: list[dict] = []
	for entry in parsed.entries:
		url = abs_url(entry.get("link") or "")
		if not ARTICLE_RE.match(url):
			continue
		published = parse_datetime(entry.get("published") or entry.get("updated"))
		day = local_date(published, tz)
		if day is None or day < start or day > end:
			continue
		author, snippet = rss_author_and_snippet(entry, snippet_chars)
		items.append(
			{
				"title": strip_html(entry.get("title") or "") or "Без названия",
				"url": url,
				"author": author,
				"published": published,
				"snippet": snippet,
			}
		)
	logger.info("infostart: RSS articles %s..%s: %s", start.isoformat(), end.isoformat(), len(items))
	return items


def to_raw_item(row: dict, source: dict, snippet_chars: int) -> dict | None:
	url = row.get("url") or ""
	author = strip_html(row.get("author") or "") or "Не указан"
	if is_editorial_author(author):
		return None
	if not accept_url(url, row.get("blob") or ""):
		return None
	published = row.get("published")
	snippet = row.get("snippet") or ""
	if not snippet:
		snippet = row.get("title") or ""
	return {
		"title": strip_html(row.get("title") or "") or "Без названия",
		"url": url,
		"author": author,
		"published_at": published.isoformat() if isinstance(published, datetime) else None,
		"snippet": clean_infostart_snippet(snippet, snippet_chars),
		**source_meta(source),
	}


def _item_day(item: dict) -> date | None:
	raw = item.get("published_at")
	if not raw:
		return None
	try:
		return datetime.fromisoformat(str(raw).replace("Z", "+00:00")).date()
	except ValueError:
		return None


def collect_infostart_range(
	source: dict,
	start: date,
	end: date,
	tz: ZoneInfo,
	snippet_chars: int,
) -> dict[date, list[dict]]:
	today = datetime.now(tz).date()
	html_rows: list[dict] = []
	contract_error: InfostartContractError | None = None
	for catalog in CATALOGS:
		try:
			rows, _older = collect_catalog(catalog, start, end, tz, today)
			html_rows.extend(rows)
		except InfostartContractError as exc:
			logger.error("%s", exc)
			contract_error = exc

	by_url: dict[str, dict] = {}
	for row in html_rows:
		item = to_raw_item(row, source, snippet_chars)
		if item:
			by_url[item["url"]] = item

	rss_url = source.get("url") or "https://infostart.ru/public/rss/"
	rss_rows = collect_rss_articles(rss_url, start, end, tz, snippet_chars)
	for row in rss_rows:
		url = row["url"]
		if url in by_url:
			if not by_url[url].get("snippet") and row.get("snippet"):
				by_url[url]["snippet"] = row["snippet"]
			continue
		logger.warning("infostart: RSS article missing from catalogs url=%s", url)
		item = to_raw_item({**row, "blob": ""}, source, snippet_chars)
		if item:
			by_url[url] = item

	buckets: dict[date, list[dict]] = {}
	for item in by_url.values():
		day = _item_day(item)
		if day is None or day < start or day > end:
			continue
		buckets.setdefault(day, []).append(item)
	for day, group in buckets.items():
		group.sort(key=lambda it: it.get("published_at") or "", reverse=True)
		logger.info("infostart: %s items for %s", len(group), day.isoformat())
	if not buckets and contract_error is not None:
		raise contract_error
	if not buckets:
		logger.info(
			"infostart: 0 items after filter for %s..%s",
			start.isoformat(),
			end.isoformat(),
		)
	return buckets


def collect_infostart_source(source: dict, target: date, tz: ZoneInfo, snippet_chars: int) -> list[dict]:
	return collect_infostart_range(source, target, target, tz, snippet_chars).get(target, [])


def infostart_source_from_yaml() -> dict:
	for src in load_sources(include_disabled=True):
		if src.get("fetch") == "infostart":
			return src
	raise SystemExit("Infostart source (fetch: infostart) is missing from sources.yaml")


def main() -> int:
	logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
	parser = argparse.ArgumentParser(description="Collect Infostart items for a date")
	parser.add_argument("--date", help="YYYY-MM-DD (overrides config)")
	parser.add_argument(
		"--write-day",
		action="store_true",
		help="Merge into data/days/YYYY-MM-DD.json without replacing other sources",
	)
	args = parser.parse_args()
	config = load_config()
	tz = ZoneInfo(config.get("timezone") or "Europe/Moscow")
	day = resolve_date(config, args.date)
	snippet_chars = int(config.get("snippet_chars") or 600)
	max_items = int(config.get("max_items") or 40)
	source = infostart_source_from_yaml()
	try:
		items = collect_infostart_source(source, day, tz, snippet_chars)
	except InfostartContractError as exc:
		logger.error("%s", exc)
		return 1
	items = items[:max_items]
	for item in items:
		item["title"] = clean_snippet(item.get("title") or "Без названия")
		item["summary"] = clean_snippet(item.get("snippet") or item.get("title") or "")
	TMP.mkdir(parents=True, exist_ok=True)
	out = TMP / f"raw-infostart-{day.isoformat()}.json"
	out.write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")
	logger.info("Wrote %s raw Infostart items to %s", len(items), out)
	if args.write_day:
		from write_day import merge_into_day

		if not items:
			logger.info("No Infostart items for %s — day file not changed", day.isoformat())
			return 0
		merge_into_day(day, items, replace_source_name=source.get("name") or "Infostart")
	elif not items:
		return 0
	return 0


if __name__ == "__main__":
	sys.path.insert(0, str(Path(__file__).resolve().parent))
	try:
		raise SystemExit(main())
	except InfostartContractError as exc:
		logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
		logger.error("%s", exc)
		raise SystemExit(1)
	except Exception as exc:  # noqa: BLE001
		logging.exception("%s", exc)
		raise SystemExit(1)
