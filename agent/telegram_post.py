#!/usr/bin/env python3
"""Post a day's digest to the Telegram channel. Not called from agent/run.py."""

from __future__ import annotations

import argparse
import json
import logging
import os
import time
import urllib.error
import urllib.request
from datetime import date
from pathlib import Path

from common import DAYS, SOURCES_JSON, russian_day_title

SITE_ORIGIN = "https://enterprisehub.dev"
MESSAGE_LIMIT = 3500
STATE_PATH = Path(__file__).resolve().parent / "state" / "telegram_posted.json"
SECTION_ORDER = ("site", "telegram", "video", "other")
SECTION_LABELS = {
	"site": "Сайты",
	"telegram": "Telegram",
	"video": "Видеохостинги",
	"other": "Другое",
}


def ru_materials(count: int) -> str:
	n = abs(count) % 100
	n10 = n % 10
	if 11 <= n <= 14:
		word = "материалов"
	elif n10 == 1:
		word = "материал"
	elif 2 <= n10 <= 4:
		word = "материала"
	else:
		word = "материалов"
	return f"{count} {word}"


def html_escape(text: str) -> str:
	return (
		(text or "")
		.replace("&", "&amp;")
		.replace("<", "&lt;")
		.replace(">", "&gt;")
	)


def safe_href(url: str | None) -> str | None:
	value = (url or "").strip()
	if value.startswith("https://") or value.startswith("http://"):
		return value
	return None


def href_attr(url: str) -> str:
	return html_escape(url).replace('"', "&quot;")


def load_homes(path: Path = SOURCES_JSON) -> dict[str, str]:
	if not path.exists():
		return {}
	data = json.loads(path.read_text(encoding="utf-8"))
	homes: dict[str, str] = {}
	for source in data.get("sources") or []:
		if not isinstance(source, dict):
			continue
		name = str(source.get("name") or "").strip()
		home = safe_href(str(source.get("home") or ""))
		if name and home:
			homes[name] = home
	return homes


def load_posted(path: Path = STATE_PATH) -> set[str]:
	if not path.exists():
		return set()
	data = json.loads(path.read_text(encoding="utf-8"))
	return {str(item) for item in (data.get("dates") or [])}


def save_posted(dates: set[str], path: Path = STATE_PATH) -> None:
	path.parent.mkdir(parents=True, exist_ok=True)
	payload = {"dates": sorted(dates)}
	path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _section(item: dict) -> str:
	code = str(item.get("source_type") or "other").strip() or "other"
	if code not in SECTION_LABELS:
		return "other"
	return code


def _source_name(item: dict) -> str:
	return str(item.get("source_name") or "").strip() or "Источник"


def grouped_sources(items: list[dict], homes: dict[str, str]) -> list[tuple[str, list[tuple[str, int, str | None]]]]:
	counts: dict[tuple[str, str], int] = {}
	for item in items:
		key = (_section(item), _source_name(item))
		counts[key] = counts.get(key, 0) + 1
	groups: list[tuple[str, list[tuple[str, int, str | None]]]] = []
	for section in SECTION_ORDER:
		rows = [
			(name, count, homes.get(name))
			for (sec, name), count in counts.items()
			if sec == section
		]
		rows.sort(key=lambda row: (-row[1], row[0].casefold()))
		if rows:
			groups.append((section, rows))
	return groups


def summary_lines(day: dict, homes: dict[str, str]) -> list[str]:
	items = list(day.get("items") or [])
	title = str(day.get("title") or "").strip()
	if not title:
		title = russian_day_title(date.fromisoformat(str(day["date"])))
	lines = [f"<b>{html_escape(title)}</b>", ru_materials(len(items)), ""]
	for section, rows in grouped_sources(items, homes):
		lines.append(f"<b>{SECTION_LABELS[section]}</b>")
		for name, count, home in rows:
			label = html_escape(name)
			if home:
				lines.append(f'<a href="{href_attr(home)}">{label}</a> — {count}')
			else:
				lines.append(f"{label} — {count}")
		lines.append("")
	day_url = f"{SITE_ORIGIN}/?date={day['date']}"
	lines.append("Читать день на сайте")
	lines.append(day_url)
	return lines


def list_lines(day: dict, homes: dict[str, str]) -> list[tuple[str, str]]:
	items = list(day.get("items") or [])
	buckets: dict[tuple[str, str], list[dict]] = {}
	for item in items:
		buckets.setdefault((_section(item), _source_name(item)), []).append(item)
	lines: list[tuple[str, str]] = []
	for index, (section, rows) in enumerate(grouped_sources(items, homes)):
		if index:
			lines.append(("text", ""))
		lines.append(("header", f"<b>{SECTION_LABELS[section]}</b>"))
		for name, _count, _home in rows:
			for item in buckets.get((section, name), []):
				title = html_escape(str(item.get("title") or "Без названия").replace("\n", " ").strip() or "Без названия")
				href = safe_href(str(item.get("url") or ""))
				source = html_escape(name)
				if href:
					body = f'<a href="{href_attr(href)}">{title}</a>'
				else:
					body = title
				lines.append(("item", f"• {body} — {source}"))
	return lines


def pack_tagged(lines: list[tuple[str, str]], limit: int = MESSAGE_LIMIT) -> list[str]:
	messages: list[str] = []
	buf: list[tuple[str, str]] = []

	def text_of(rows: list[tuple[str, str]]) -> str:
		return "\n".join(row[1] for row in rows).strip("\n")

	def flush() -> None:
		nonlocal buf
		if not buf:
			return
		text = text_of(buf)
		if text:
			messages.append(text)
		buf = []

	for kind, text in lines:
		if not buf and text == "":
			continue
		if not buf:
			buf.append((kind, text))
			continue
		if len(text_of(buf)) + 1 + len(text) <= limit:
			buf.append((kind, text))
			continue
		carry: tuple[str, str] | None = None
		if buf[-1][0] == "header":
			carry = buf.pop()
		flush()
		if carry:
			buf.append(carry)
			if len(text_of(buf)) + 1 + len(text) <= limit:
				buf.append((kind, text))
			else:
				flush()
				buf.append((kind, text))
		else:
			buf.append((kind, text))
	flush()
	return messages


def build_messages(day: dict, homes: dict[str, str], limit: int = MESSAGE_LIMIT) -> list[dict]:
	items = list(day.get("items") or [])
	if not items:
		return []
	day_url = f"{SITE_ORIGIN}/?date={day['date']}"
	summary = pack_tagged([("text", line) for line in summary_lines(day, homes)], limit)
	messages = [
		{"text": text, "preview_url": day_url if day_url in text else None}
		for text in summary
	]
	for text in pack_tagged(list_lines(day, homes), limit):
		messages.append({"text": text, "preview_url": None})
	return messages


def send_message(token: str, chat_id: str, text: str, preview_url: str | None) -> None:
	body = {
		"chat_id": chat_id,
		"text": text,
		"parse_mode": "HTML",
		"link_preview_options": (
			{"is_disabled": False, "url": preview_url}
			if preview_url
			else {"is_disabled": True}
		),
	}
	endpoint = f"https://api.telegram.org/bot{token}/sendMessage"
	data = json.dumps(body).encode("utf-8")
	request = urllib.request.Request(
		endpoint,
		data=data,
		headers={"Content-Type": "application/json"},
	)
	for attempt in (1, 2):
		try:
			with urllib.request.urlopen(request, timeout=30) as response:
				payload = json.loads(response.read().decode("utf-8"))
		except urllib.error.HTTPError as exc:
			raw = exc.read().decode("utf-8", errors="replace")
			if exc.code == 429 and attempt == 1:
				retry_after = 1
				try:
					retry_after = int(json.loads(raw).get("parameters", {}).get("retry_after") or 1)
				except (ValueError, TypeError, json.JSONDecodeError):
					retry_after = 1
				time.sleep(max(1, retry_after))
				continue
			raise SystemExit(f"Telegram API {exc.code}: {raw[:500]}") from None
		except urllib.error.URLError as exc:
			raise SystemExit(f"Telegram request failed: {exc.reason}") from None
		if not payload.get("ok"):
			raise SystemExit("Telegram API returned ok=false")
		return
	raise SystemExit("Telegram API 429")


def parse_dates(values: list[str]) -> list[date]:
	found: list[date] = []
	for value in values:
		text = value.strip()
		if not text:
			continue
		try:
			found.append(date.fromisoformat(text))
		except ValueError:
			raise SystemExit(f"Bad date: {text}") from None
	return sorted(set(found))


def post_dates(dates: list[date], *, dry_run: bool) -> int:
	if not dates:
		logging.info("No dates to post")
		return 0
	token = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
	chat_id = os.environ.get("TELEGRAM_CHAT_ID", "").strip()
	if not dry_run and (not token or not chat_id):
		logging.warning(
			"Telegram is not configured (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID), skip"
		)
		return 0
	homes = load_homes()
	posted = load_posted()
	for day in dates:
		iso = day.isoformat()
		if iso in posted:
			logging.info("Already posted %s", iso)
			continue
		path = DAYS / f"{iso}.json"
		if not path.exists():
			logging.error("No day file for %s", iso)
			return 1
		payload = json.loads(path.read_text(encoding="utf-8"))
		messages = build_messages(payload, homes)
		if not messages:
			logging.info("No items for %s", iso)
			continue
		if dry_run:
			for index, message in enumerate(messages, start=1):
				print(f"--- {iso} #{index} ---")
				print(message["text"])
			continue
		for message in messages:
			send_message(token, chat_id, message["text"], message.get("preview_url"))
			time.sleep(0.4)
		posted.add(iso)
		save_posted(posted)
		logging.info("Posted %s (%s messages)", iso, len(messages))
	return 0


def build_parser() -> argparse.ArgumentParser:
	parser = argparse.ArgumentParser(description="Post OneS News digests to Telegram")
	parser.add_argument("--date", action="append", default=[], help="YYYY-MM-DD, repeatable")
	parser.add_argument("--dry-run", action="store_true", help="Print messages, do not send")
	return parser


def main(argv: list[str] | None = None) -> int:
	logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
	args = build_parser().parse_args(argv)
	return post_dates(parse_dates(args.date), dry_run=args.dry_run)


if __name__ == "__main__":
	raise SystemExit(main())
