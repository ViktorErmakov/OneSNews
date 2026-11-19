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
SECTION_ORDER = ("site", "telegram", "video", "other")
SECTION_LABELS = {
	"site": "Сайты",
	"telegram": "Telegram",
	"video": "Видеохостинги",
	"other": "Другое",
}
SECTION_EMOJI = {
	"site": "🌐",
	"telegram": "💬",
	"video": "▶️",
	"other": "📌",
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
	lines = [
		f"📰 <b>{html_escape(title)}</b>",
		f"<i>{ru_materials(len(items))}</i>",
		"",
	]
	for section, rows in grouped_sources(items, homes):
		emoji = SECTION_EMOJI[section]
		lines.append(f"{emoji} <b>{SECTION_LABELS[section]}</b>")
		for name, count, home in rows:
			label = html_escape(name)
			if home:
				lines.append(f'<a href="{href_attr(home)}">{label}</a> · {count}')
			else:
				lines.append(f"{label} · {count}")
		lines.append("")
	day_url = f"{SITE_ORIGIN}/?date={day['date']}"
	lines.append(f"<blockquote>Читать день на сайте\n{day_url}</blockquote>")
	return lines


def source_header(section: str, name: str, home: str | None, count: int, *, continuation: bool) -> str:
	emoji = SECTION_EMOJI[section]
	label = html_escape(name)
	if home:
		title = f'{emoji} <b><a href="{href_attr(home)}">{label}</a></b>'
	else:
		title = f"{emoji} <b>{label}</b>"
	subtitle = "<i>продолжение</i>" if continuation else f"<i>{ru_materials(count)}</i>"
	return f"{title}\n{subtitle}"


def item_line(item: dict) -> str:
	title = html_escape(
		str(item.get("title") or "Без названия").replace("\n", " ").strip() or "Без названия"
	)
	href = safe_href(str(item.get("url") or ""))
	if href:
		body = f'<a href="{href_attr(href)}">{title}</a>'
	else:
		body = title
	return f"• {body}"


def source_item_lines(items: list[dict]) -> list[tuple[str, str]]:
	lines: list[tuple[str, str]] = []
	for index, item in enumerate(items):
		text = item_line(item)
		if index:
			text = "\n" + text
		lines.append(("item", text))
	return lines


def pack_source(section: str, name: str, home: str | None, count: int, items: list[dict], limit: int) -> list[str]:
	header = source_header(section, name, home, count, continuation=False)
	continued = source_header(section, name, home, count, continuation=True)
	reserve = max(len(header), len(continued)) + 2
	body_limit = max(1, limit - reserve)
	bodies = pack_tagged(source_item_lines(items), body_limit)
	messages: list[str] = []
	for index, body in enumerate(bodies):
		head = header if index == 0 else continued
		messages.append(f"{head}\n\n{body}" if body else head)
	return messages


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
	buckets: dict[tuple[str, str], list[dict]] = {}
	for item in items:
		buckets.setdefault((_section(item), _source_name(item)), []).append(item)
	for section, rows in grouped_sources(items, homes):
		for name, count, home in rows:
			for text in pack_source(section, name, home, count, buckets.get((section, name), []), limit):
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
	for day in dates:
		iso = day.isoformat()
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
