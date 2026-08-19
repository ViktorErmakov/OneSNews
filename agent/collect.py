from __future__ import annotations

import json
import logging
import re
from datetime import date, datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from xml.etree import ElementTree as ET
from zoneinfo import ZoneInfo

from common import TMP, clip, load_config, load_sources, resolve_date, strip_html

logger = logging.getLogger(__name__)

USER_AGENT = "OneSNewsCollector/1.0 (+https://enterprisehub.dev)"
ATOM = "{http://www.w3.org/2005/Atom}"
DC = "{http://purl.org/dc/elements/1.1/}"
CONTENT = "{http://purl.org/rss/1.0/modules/content/}"


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


def source_meta(source: dict) -> dict:
	return {
		"source_name": source.get("name") or "",
		"source_type": source["source_type"],
		"direction": source.get("direction") or "community",
		"language": source.get("language") or "ru",
		"summarize": bool(source.get("summarize", True)),
	}


def collect_rss(source: dict, target: date, tz: ZoneInfo, snippet_chars: int) -> list[dict]:
	xml_bytes = http_get(source["url"])
	root = ET.fromstring(xml_bytes)
	items: list[dict] = []

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
			if local_date(published, tz) != target:
				continue
			items.append(
				{
					"title": title or "Без названия",
					"url": link or guid,
					"author": strip_html(author) or "Не указан",
					"published_at": published.isoformat() if published else None,
					"snippet": clip(strip_html(desc), snippet_chars),
					**source_meta(source),
				}
			)
		return items

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

		if local_date(published, tz) != target:
			continue
		items.append(
			{
				"title": title or "Без названия",
				"url": link,
				"author": strip_html(author) or "Не указан",
				"published_at": published.isoformat() if published else None,
				"snippet": clip(strip_html(summary), snippet_chars),
				**source_meta({**source, "name": source.get("name") or "Atom"}),
			}
		)
	return items


def telegram_s_url(url: str) -> str:
	url = url.strip().rstrip("/")
	if "/s/" in url:
		return url
	m = re.search(r"t\.me/([^/?#]+)", url)
	if m:
		return f"https://t.me/s/{m.group(1).lstrip('@')}"
	return url


def collect_telegram_web(source: dict, target: date, tz: ZoneInfo, snippet_chars: int) -> list[dict]:
	html = http_get(telegram_s_url(source["url"])).decode("utf-8", errors="ignore")
	blocks = re.split(r'(?=<div class="tgme_widget_message[\s"])', html)
	items: list[dict] = []
	username = source.get("name") or "telegram"
	m_user = re.search(r"t\.me/s/([^/?#]+)", telegram_s_url(source["url"]))
	if m_user:
		username = m_user.group(1)

	for block in blocks:
		if "tgme_widget_message" not in block[:80]:
			continue
		post = re.search(r'data-post="([^"]+)"', block)
		time_m = re.search(r'<time[^>]*datetime="([^"]+)"', block)
		text_m = re.search(
			r'class="tgme_widget_message_text[^"]*"[^>]*>(.*?)</div>',
			block,
			flags=re.DOTALL,
		)
		author_m = re.search(
			r'class="tgme_widget_message_author_name"[^>]*>(.*?)</span>',
			block,
			flags=re.DOTALL,
		)
		published = parse_datetime(time_m.group(1) if time_m else None)
		if local_date(published, tz) != target:
			continue
		text = strip_html(text_m.group(1) if text_m else "")
		if not text:
			continue
		title = text.split(".")[0][:120].strip() or "Сообщение"
		url = f"https://t.me/{post.group(1)}" if post else telegram_s_url(source["url"])
		author = strip_html(author_m.group(1) if author_m else "") or source.get("name") or username
		items.append(
			{
				"title": title,
				"url": url,
				"author": author,
				"published_at": published.isoformat() if published else None,
				"snippet": clip(text, snippet_chars),
				**source_meta(
					{**source, "name": source.get("name") or f"Telegram: {username}"}
				),
			}
		)
	return items


def collect_source(source: dict, target: date, tz: ZoneInfo, snippet_chars: int) -> list[dict]:
	fetch = source.get("fetch") or "rss"
	if fetch in {"rss", "youtube_rss"}:
		return collect_rss(source, target, tz, snippet_chars)
	if fetch == "telegram_web":
		return collect_telegram_web(source, target, tz, snippet_chars)
	raise ValueError(f"Unknown fetch type: {fetch}")


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
			logger.info("Collected %s items from %s", len(batch), name)
			collected.extend(batch)
		except (HTTPError, URLError, ET.ParseError, ValueError) as exc:
			logger.warning("Skip %s: %s", name, exc)
		except Exception:  # noqa: BLE001
			logger.exception("Failed %s", name)

	collected = collected[:max_items]
	TMP.mkdir(parents=True, exist_ok=True)
	out = TMP / f"raw-{day.isoformat()}.json"
	out.write_text(json.dumps(collected, ensure_ascii=False, indent=2), encoding="utf-8")
	logger.info("Wrote %s raw items to %s", len(collected), out)
	return day, collected


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
