from __future__ import annotations

import json
import logging
import re
import time
from datetime import date, datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from xml.etree import ElementTree as ET
from zoneinfo import ZoneInfo

from bs4 import BeautifulSoup

from common import TMP, clip, load_config, load_sources, resolve_date, strip_html

logger = logging.getLogger(__name__)

USER_AGENT = "OneSNewsCollector/1.0 (+https://enterprisehub.dev)"
ATOM = "{http://www.w3.org/2005/Atom}"
DC = "{http://purl.org/dc/elements/1.1/}"
CONTENT = "{http://purl.org/rss/1.0/modules/content/}"
MEDIA = "{http://search.yahoo.com/mrss/}"
YT = "{http://www.youtube.com/xml/schemas/2015}"
YOUTUBE_FEED = "https://www.youtube.com/feeds/videos.xml?channel_id={channel_id}"
SCHEME_TYPO_RE = re.compile(r"(?i)^h+ttps://")
YOUTUBE_HANDLE_RE = re.compile(r"(?i)(?:www\.)?youtube\.com/@([^/?#]+)")
YOUTUBE_CHANNEL_PATH_RE = re.compile(r"(?i)(?:www\.)?youtube\.com/channel/(UC[A-Za-z0-9_-]{22,})")
YOUTUBE_FEED_ID_RE = re.compile(r"(?i)[?&]channel_id=(UC[A-Za-z0-9_-]{22,})")
YOUTUBE_EXTERNAL_ID_RE = re.compile(r'"externalId":"(UC[A-Za-z0-9_-]{22,})"')
TG_TITLE_LIMIT = 100
TG_MAX_PAGES = 30
TG_PAGE_PAUSE_SEC = 0.4
TG_SKIP_TEXT = frozenset(
	{
		"please open telegram to view this post",
		"this media is not supported in your browser",
		"view in telegram",
	}
)
HASHTAG_RE = re.compile(r"#([^\s#]+)", re.UNICODE)
VERSION_RE = re.compile(r"\b\d+\.\d+(?:\.\d+)*\b")
ABBREV_RE = re.compile(r"(?i)\b(?:т\.е|т\.д|т\.п|т\.к|т\.н)\.")
URL_RE = re.compile(r"https?://\S+")


def http_get(url: str, timeout: int = 30) -> bytes:
	req = Request(url, headers={"User-Agent": USER_AGENT, "Accept": "*/*"})
	with urlopen(req, timeout=timeout) as resp:  # noqa: S310
		return resp.read()


def parse_datetime(value: str | None) -> datetime | None:
	if not value:
		return None
	value = value.strip()
	try:
		dt = parsedate_to_datetime(value)
		if dt.tzinfo is None:
			dt = dt.replace(tzinfo=timezone.utc)
		return dt
	except Exception:  # noqa: BLE001
		pass
	try:
		dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
		if dt.tzinfo is None:
			dt = dt.replace(tzinfo=timezone.utc)
		return dt
	except Exception:  # noqa: BLE001
		return None


def local_date(dt: datetime | None, tz: ZoneInfo) -> date | None:
	if dt is None:
		return None
	return dt.astimezone(tz).date()


def local_name(el) -> str:
	return el.tag.split("}", 1)[-1] if "}" in el.tag else el.tag


def unique_labels(raw_labels: list[str] | None = None) -> list[str]:
	seen: set[str] = set()
	out: list[str] = []
	for value in raw_labels or []:
		label = re.sub(r"\s+", " ", str(value).strip())
		if not label:
			continue
		key = label.casefold()
		if key in seen:
			continue
		seen.add(key)
		out.append(label)
	return out


def source_meta(source: dict, raw_labels: list[str] | None = None) -> dict:
	return {
		"source_name": source.get("name") or "",
		"source_type": source["source_type"],
		"topics": unique_labels(raw_labels),
		"language": source.get("language") or "ru",
		"summarize": bool(source.get("summarize", True)),
	}


def read_categories(parent) -> list[str]:
	labels: list[str] = []
	for child in list(parent):
		if local_name(child) != "category":
			continue
		text = "".join(child.itertext()).strip()
		term = (child.attrib.get("term") or "").strip()
		label = text or term
		if label:
			labels.append(label)
	return labels


def collect_rss(source: dict, target: date, tz: ZoneInfo, snippet_chars: int) -> list[dict]:
	return collect_rss_range(source, target, target, tz, snippet_chars).get(target, [])


def collect_rss_range(
	source: dict,
	start: date,
	end: date,
	tz: ZoneInfo,
	snippet_chars: int,
) -> dict[date, list[dict]]:
	xml_bytes = http_get(source["url"])
	root = ET.fromstring(xml_bytes)
	buckets: dict[date, list[dict]] = {}

	def add_item(
		title: str,
		url: str,
		author: str,
		published: datetime | None,
		snippet: str,
		meta_source: dict,
		categories: list[str] | None = None,
	) -> None:
		day = local_date(published, tz)
		if day is None or day < start or day > end:
			return
		buckets.setdefault(day, []).append(
			{
				"title": title or "Без названия",
				"url": url,
				"author": strip_html(author) or "Не указан",
				"published_at": published.isoformat() if published else None,
				"snippet": clip(strip_html(snippet), snippet_chars),
				**source_meta(meta_source, categories),
			}
		)

	rss_items = root.findall("./channel/item")
	if rss_items:
		for item in rss_items:
			title = (item.findtext("title") or "").strip()
			link = (item.findtext("link") or "").strip()
			guid = (item.findtext("guid") or "").strip()
			author = (
				item.findtext("author")
				or item.findtext(f"{DC}creator")
				or source.get("name")
				or "Не указан"
			)
			desc = item.findtext(f"{CONTENT}encoded") or item.findtext("description") or ""
			published = parse_datetime(
				item.findtext("pubDate") or item.findtext("published") or item.findtext("updated")
			)
			add_item(title, link or guid, author, published, desc, source, read_categories(item))
		return buckets

	for entry in root.findall(f"{ATOM}entry") or root.findall("entry"):
		title = ""
		link = ""
		author = source.get("name") or "Не указан"
		summary = ""
		published = None
		for child in list(entry):
			tag = local_name(child)
			if tag == "title":
				title = (child.text or "").strip()
			elif tag == "link":
				href = child.attrib.get("href") or (child.text or "").strip()
				if child.attrib.get("rel") in (None, "", "alternate") or not link:
					link = href
			elif tag in ("summary", "content"):
				summary = "".join(child.itertext())
			elif tag == "author":
				name_el = None
				for sub in child:
					if local_name(sub) == "name":
						name_el = sub
						break
				author = ((name_el.text if name_el is not None else child.text) or author).strip()
			elif tag in ("published", "updated") and published is None:
				published = parse_datetime(child.text)
		add_item(
			title,
			link,
			author,
			published,
			summary,
			{**source, "name": source.get("name") or "Atom"},
			read_categories(entry),
		)
	return buckets


def normalize_http_scheme(url: str) -> str:
	return SCHEME_TYPO_RE.sub("https://", (url or "").strip(), count=1)


def youtube_feed_url_for_channel(channel_id: str) -> str:
	return YOUTUBE_FEED.format(channel_id=channel_id)


def channel_id_from_channel_page(html: str) -> str:
	match = YOUTUBE_EXTERNAL_ID_RE.search(html or "")
	if match:
		return match.group(1)
	match = YOUTUBE_CHANNEL_PATH_RE.search(html or "")
	if match:
		return match.group(1)
	raise ValueError("YouTube channel page has no channel id")


def resolve_youtube_feed_url(url: str, fetch_bytes=None) -> str:
	url = normalize_http_scheme(url)
	if not url:
		raise ValueError("YouTube source url is empty")
	if "feeds/videos.xml" in url.lower():
		feed_id = YOUTUBE_FEED_ID_RE.search(url)
		if feed_id:
			return youtube_feed_url_for_channel(feed_id.group(1))
		return url
	channel_path = YOUTUBE_CHANNEL_PATH_RE.search(url)
	if channel_path:
		return youtube_feed_url_for_channel(channel_path.group(1))
	handle_match = YOUTUBE_HANDLE_RE.search(url)
	if not handle_match:
		raise ValueError(f"Cannot resolve YouTube feed from {url}")
	handle = handle_match.group(1).lstrip("@")
	getter = fetch_bytes or http_get
	html = getter(f"https://www.youtube.com/@{handle}").decode("utf-8", errors="ignore")
	return youtube_feed_url_for_channel(channel_id_from_channel_page(html))


def youtube_entry_is_short(entry) -> bool:
	for child in list(entry):
		if local_name(child) != "link":
			continue
		href = (child.attrib.get("href") or child.text or "").strip()
		rel = child.attrib.get("rel")
		if "/shorts/" not in href.lower():
			continue
		if rel in (None, "", "alternate"):
			return True
	return False


def youtube_entry_fields(entry) -> tuple[str, str, str, datetime | None, str]:
	title = ""
	link = ""
	author = ""
	published = None
	video_id = (entry.findtext(f"{YT}videoId") or "").strip()
	description = entry.findtext(f"{MEDIA}group/{MEDIA}description") or ""
	for child in list(entry):
		tag = local_name(child)
		if tag == "title":
			title = (child.text or "").strip()
		elif tag == "link":
			href = child.attrib.get("href") or (child.text or "").strip()
			if child.attrib.get("rel") in (None, "", "alternate") or not link:
				link = href
		elif tag == "author":
			name_el = None
			for sub in child:
				if local_name(sub) == "name":
					name_el = sub
					break
			author = ((name_el.text if name_el is not None else child.text) or author).strip()
		elif tag in ("published", "updated") and published is None:
			published = parse_datetime(child.text)
		elif tag == "videoId" and not video_id:
			video_id = (child.text or "").strip()
		elif tag == "group" and not description:
			for sub in child:
				if local_name(sub) == "description":
					description = "".join(sub.itertext())
					break
	watch_url = f"https://www.youtube.com/watch?v={video_id}" if video_id else link
	return title, watch_url, author, published, description


def parse_youtube_atom(
	xml_bytes: bytes,
	source: dict,
	start: date,
	end: date,
	tz: ZoneInfo,
	snippet_chars: int,
) -> dict[date, list[dict]]:
	root = ET.fromstring(xml_bytes)
	buckets: dict[date, list[dict]] = {}
	for entry in root.findall(f"{ATOM}entry") or root.findall("entry"):
		if youtube_entry_is_short(entry):
			continue
		title, url, author, published, description = youtube_entry_fields(entry)
		if not url:
			continue
		day = local_date(published, tz)
		if day is None or day < start or day > end:
			continue
		buckets.setdefault(day, []).append(
			{
				"title": title or "Без названия",
				"url": url,
				"author": strip_html(author) or source.get("name") or "Не указан",
				"published_at": published.isoformat() if published else None,
				"snippet": clip(strip_html(description), snippet_chars),
				**source_meta(source, []),
			}
		)
	return buckets


def collect_youtube_rss_range(
	source: dict,
	start: date,
	end: date,
	tz: ZoneInfo,
	snippet_chars: int,
) -> dict[date, list[dict]]:
	feed_url = resolve_youtube_feed_url(source.get("url") or "")
	return parse_youtube_atom(http_get(feed_url), source, start, end, tz, snippet_chars)


def collect_youtube_rss(source: dict, target: date, tz: ZoneInfo, snippet_chars: int) -> list[dict]:
	return collect_youtube_rss_range(source, target, target, tz, snippet_chars).get(target, [])


def telegram_s_url(url: str) -> str:
	url = url.strip().rstrip("/")
	if "/s/" in url:
		return url
	m = re.search(r"t\.me/([^/?#]+)", url)
	if m:
		return f"https://t.me/s/{m.group(1).lstrip('@')}"
	return url


def telegram_page_url(base: str, before: str | None) -> str:
	if not before:
		return base
	sep = "&" if "?" in base else "?"
	return f"{base}{sep}before={before}"


def telegram_username(url: str) -> str:
	m = re.search(r"t\.me/s/([^/?#]+)", telegram_s_url(url))
	return m.group(1) if m else ""


def clip_at_word(text: str, limit: int) -> str:
	text = (text or "").strip()
	if len(text) <= limit:
		return text
	cut = text[:limit].rsplit(" ", 1)[0].rstrip(".,;:—–-")
	if len(cut) < max(20, limit // 2):
		cut = text[: max(0, limit - 1)].rstrip()
	return cut + "…"


def first_sentence(text: str) -> str | None:
	compact = re.sub(r"\s+", " ", text or "").strip()
	if not compact:
		return None
	stashed: list[str] = []

	def stash(match: re.Match) -> str:
		stashed.append(match.group(0))
		return f"\x00{len(stashed) - 1}\x00"

	protected = URL_RE.sub(stash, compact)
	protected = VERSION_RE.sub(stash, protected)
	protected = ABBREV_RE.sub(stash, protected)
	match = re.search(r"[.!?…]{1,3}(?=\s|$)", protected)
	if not match:
		return None
	chunk = protected[: match.end()]
	for i, value in enumerate(stashed):
		chunk = chunk.replace(f"\x00{i}\x00", value)
	return chunk.strip()


def telegram_title(plain: str, limit: int = TG_TITLE_LIMIT) -> str:
	lines = [line.strip() for line in (plain or "").splitlines() if line.strip()]
	if not lines:
		return "Сообщение"
	if len(lines[0]) <= limit:
		return lines[0]
	sentence = first_sentence(plain)
	if sentence and len(sentence) <= limit:
		return sentence
	return clip_at_word(re.sub(r"\s+", " ", plain).strip(), limit)


def telegram_plain_text(text_el) -> str:
	if text_el is None:
		return ""
	clone = BeautifulSoup(str(text_el), "lxml")
	node = clone.find(True)
	if node is None:
		return ""
	for br in node.find_all("br"):
		br.replace_with("\n")
	lines = [re.sub(r"[ \t]+", " ", line).strip() for line in node.get_text().splitlines()]
	return "\n".join(line for line in lines if line)


def telegram_hashtags(text: str) -> list[str]:
	labels: list[str] = []
	for raw in HASHTAG_RE.findall(text or ""):
		label = raw.rstrip(".,;:!?)»\"'")
		if label:
			labels.append(label)
	return unique_labels(labels)


def telegram_message_ids(wraps) -> list[int]:
	ids: list[int] = []
	for wrap in wraps:
		post = wrap.get("data-post") or ""
		part = post.rsplit("/", 1)[-1]
		if part.isdigit():
			ids.append(int(part))
	return ids


def parse_telegram_page(html: str) -> tuple[list, str | None]:
	soup = BeautifulSoup(html, "lxml")
	wraps = soup.select("div.tgme_widget_message[data-post]")
	more = soup.select_one("a.js-messages_more[data-before]")
	before = (more.get("data-before") or "").strip() if more else ""
	if not before:
		ids = telegram_message_ids(wraps)
		before = str(min(ids)) if ids else ""
	return wraps, before or None


def collect_telegram_web_range(
	source: dict,
	start: date,
	end: date,
	tz: ZoneInfo,
	snippet_chars: int,
) -> dict[date, list[dict]]:
	base = telegram_s_url(source["url"])
	channel = telegram_username(source["url"])
	author = source.get("name") or (f"Telegram: {channel}" if channel else "Telegram")
	source_for_meta = {**source, "name": author}
	buckets: dict[date, list[dict]] = {}
	seen_urls: set[str] = set()
	before: str | None = None
	name = source.get("name") or base

	for page in range(TG_MAX_PAGES):
		if page:
			time.sleep(TG_PAGE_PAUSE_SEC)
		page_url = telegram_page_url(base, before)
		html = http_get(page_url).decode("utf-8", errors="ignore")
		wraps, next_before = parse_telegram_page(html)
		if page == 0 and not wraps:
			logger.warning("Telegram preview empty for %s (%s)", name, page_url)
			return {}

		oldest_on_page: date | None = None
		for wrap in wraps:
			if wrap.select_one(".tgme_widget_message_forwarded_from"):
				continue
			data_post = (wrap.get("data-post") or "").strip()
			if not data_post:
				continue
			url = f"https://t.me/{data_post}"
			if url in seen_urls:
				continue
			seen_urls.add(url)
			time_el = wrap.select_one("time[datetime]")
			published = parse_datetime(time_el.get("datetime") if time_el else None)
			day = local_date(published, tz)
			if day is not None and (oldest_on_page is None or day < oldest_on_page):
				oldest_on_page = day
			if day is None or day < start or day > end:
				continue
			text_el = wrap.select_one(".js-message_text")
			plain = telegram_plain_text(text_el)
			body = re.sub(r"\s+", " ", plain).strip()
			if not body or body.casefold() in TG_SKIP_TEXT:
				continue
			title = telegram_title(plain)
			snippet = "" if body == title else clip(body, snippet_chars)
			buckets.setdefault(day, []).append(
				{
					"title": title,
					"url": url,
					"author": author,
					"published_at": published.isoformat() if published else None,
					"snippet": snippet,
					**source_meta(source_for_meta, telegram_hashtags(body)),
				}
			)

		if oldest_on_page is not None and oldest_on_page < start:
			break
		if not next_before or next_before == before:
			break
		before = next_before
	else:
		logger.warning("Telegram hit max_pages=%s on %s", TG_MAX_PAGES, name)

	return buckets


def collect_telegram_web(source: dict, target: date, tz: ZoneInfo, snippet_chars: int) -> list[dict]:
	return collect_telegram_web_range(source, target, target, tz, snippet_chars).get(target, [])


def collect_source(source: dict, target: date, tz: ZoneInfo, snippet_chars: int) -> list[dict]:
	fetch = source.get("fetch") or "rss"
	if fetch == "rss":
		return collect_rss(source, target, tz, snippet_chars)
	if fetch == "youtube_rss":
		return collect_youtube_rss(source, target, tz, snippet_chars)
	if fetch == "telegram_web":
		return collect_telegram_web(source, target, tz, snippet_chars)
	if fetch == "infostart":
		from collect_infostart import collect_infostart_source

		return collect_infostart_source(source, target, tz, snippet_chars)
	if fetch == "1c_dn":
		from collect_1cdn import collect_1cdn_source

		return collect_1cdn_source(source, target, tz, snippet_chars)
	raise ValueError(f"Unknown fetch type: {fetch}")


def log_source_failure(name: str, exc: BaseException) -> None:
	from collect_1cdn import OnesDnContractError
	from collect_infostart import InfostartContractError

	if isinstance(exc, (InfostartContractError, OnesDnContractError)):
		logger.error("Skip %s: %s", name, exc)
		return
	logger.exception("Failed %s", name)


def collect(target: date | None = None, cli_date: str | None = None) -> tuple[date, list[dict]]:
	config = load_config()
	tz = ZoneInfo(config.get("timezone") or "Europe/Moscow")
	day = target or resolve_date(config, cli_date)
	snippet_chars = int(config.get("snippet_chars") or 600)
	max_items = int(config.get("max_items") or 40)
	collected: list[dict] = []

	for source in load_sources():
		name = source.get("name") or source.get("url")
		try:
			batch = collect_source(source, day, tz, snippet_chars)
			batch = batch[:max_items]
			logger.info("Collected %s items from %s", len(batch), name)
			collected.extend(batch)
		except (HTTPError, URLError, ET.ParseError, ValueError) as exc:
			logger.warning("Skip %s: %s", name, exc)
		except Exception as exc:  # noqa: BLE001
			log_source_failure(name, exc)
	TMP.mkdir(parents=True, exist_ok=True)
	out = TMP / f"raw-{day.isoformat()}.json"
	out.write_text(json.dumps(collected, ensure_ascii=False, indent=2), encoding="utf-8")
	logger.info("Wrote %s raw items to %s", len(collected), out)
	return day, collected


def collect_range(start: date, end: date) -> dict[date, list[dict]]:
	if end < start:
		raise ValueError("end date must be on or after start date")
	config = load_config()
	tz = ZoneInfo(config.get("timezone") or "Europe/Moscow")
	snippet_chars = int(config.get("snippet_chars") or 600)
	max_items = int(config.get("max_items") or 40)
	by_day: dict[date, list[dict]] = {}

	for source in load_sources():
		name = source.get("name") or source.get("url")
		fetch = source.get("fetch") or "rss"
		try:
			if fetch == "infostart":
				from collect_infostart import collect_infostart_range

				buckets = collect_infostart_range(source, start, end, tz, snippet_chars)
			elif fetch == "1c_dn":
				from collect_1cdn import collect_1cdn_range

				buckets = collect_1cdn_range(source, start, end, tz, snippet_chars)
			elif fetch == "rss":
				buckets = collect_rss_range(source, start, end, tz, snippet_chars)
			elif fetch == "youtube_rss":
				buckets = collect_youtube_rss_range(source, start, end, tz, snippet_chars)
			elif fetch == "telegram_web":
				buckets = collect_telegram_web_range(source, start, end, tz, snippet_chars)
			else:
				logger.warning("Skip %s: unknown fetch type %s", name, fetch)
				continue
			for day, batch in buckets.items():
				capped = batch[:max_items]
				logger.info("Collected %s items from %s for %s", len(capped), name, day.isoformat())
				by_day.setdefault(day, []).extend(capped)
		except (HTTPError, URLError, ET.ParseError, ValueError) as exc:
			logger.warning("Skip %s: %s", name, exc)
		except Exception as exc:  # noqa: BLE001
			log_source_failure(name, exc)

	TMP.mkdir(parents=True, exist_ok=True)
	payload = {day.isoformat(): items for day, items in sorted(by_day.items())}
	out = TMP / f"raw-{start.isoformat()}_{end.isoformat()}.json"
	out.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
	logger.info("Wrote range raw items to %s (%s days)", out, len(by_day))
	return by_day


if __name__ == "__main__":
	import argparse
	import sys

	logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
	sys.path.insert(0, str(Path(__file__).resolve().parent))
	parser = argparse.ArgumentParser(description="Collect raw items for a date")
	parser.add_argument("--date", help="YYYY-MM-DD (overrides config)")
	args = parser.parse_args()
	day, items = collect(cli_date=args.date)
	if not items:
		raise SystemExit(f"No items for {day.isoformat()}")
