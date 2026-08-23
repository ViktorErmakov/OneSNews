from __future__ import annotations

import json
import logging
import re
from datetime import date
from pathlib import Path

from common import DAYS, INDEX, ROOT, SOURCES_JSON, load_sources, russian_day_title, slug_id

DAY_FILE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}\.json$")

logger = logging.getLogger(__name__)


SKIP_TOPIC_LABELS = frozenset(
	{"development", "analytics", "management", "releases", "devops", "community"}
)


def day_topics(raw: dict) -> list[str]:
	source_key = str(raw.get("source_name") or "").strip().casefold()
	raw_topics = raw.get("topics")
	if not isinstance(raw_topics, list) or not raw_topics:
		raw_topics = raw.get("tags") if isinstance(raw.get("tags"), list) else []
	out: list[str] = []
	seen: set[str] = set()
	for value in raw_topics:
		label = str(value).strip()
		if label.lower().startswith("habr:"):
			label = label.split(":", 1)[1].strip()
		if not label:
			continue
		key = label.casefold()
		if key == source_key or key in SKIP_TOPIC_LABELS or key in seen:
			continue
		seen.add(key)
		out.append(label)
	return out


def to_day_item(raw: dict, item_id: str) -> dict:
	return {
		"id": item_id,
		"title": raw.get("title") or "Без названия",
		"summary": raw.get("summary") or raw.get("snippet") or "",
		"url": raw.get("url") or "",
		"author": raw.get("author") or "Не указан",
		"source_name": raw.get("source_name") or "",
		"source_type": raw.get("source_type") or "other",
		"topics": day_topics(raw),
		"language": raw.get("language") or "ru",
	}


def write_day(day: date, items: list[dict]) -> Path:
	DAYS.mkdir(parents=True, exist_ok=True)
	payload_items = [to_day_item(item, slug_id(day, i + 1)) for i, item in enumerate(items)]
	day_doc = {
		"date": day.isoformat(),
		"title": russian_day_title(day),
		"items": payload_items,
	}
	path = DAYS / f"{day.isoformat()}.json"
	path.write_text(json.dumps(day_doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
	write_index()
	logger.info("Wrote %s (%s items)", path.relative_to(ROOT), len(payload_items))
	return path


def merge_sources_into_day(
	day: date,
	items: list[dict],
	*,
	replace_names: set[str] | None = None,
) -> Path | None:
	incoming_names = replace_names if replace_names is not None else {
		item.get("source_name") for item in items if item.get("source_name")
	}
	path = DAYS / f"{day.isoformat()}.json"
	kept: list[dict] = []
	if path.exists():
		loaded = json.loads(path.read_text(encoding="utf-8"))
		for item in loaded.get("items") or []:
			if not isinstance(item, dict):
				continue
			if item.get("source_name") in incoming_names:
				continue
			kept.append(item)
	combined = kept + [to_day_item(item, "") for item in items]
	if not combined:
		return None
	return write_day(day, combined)


def dates_from_day_files() -> list[str]:
	DAYS.mkdir(parents=True, exist_ok=True)
	dates = [path.stem for path in DAYS.glob("*.json") if DAY_FILE_RE.match(path.name)]
	dates.sort(reverse=True)
	return dates


def write_sources_catalog() -> Path:
	catalog: list[dict] = []
	for src in load_sources():
		home = str(src.get("home") or "").strip()
		name = src.get("name") or src.get("url") or ""
		if not home:
			logger.warning("Skip catalog source %s: no home URL", name)
			continue
		catalog.append(
			{
				"name": src.get("name") or "",
				"home": home,
				"source_type": src.get("source_type") or "other",
				"language": src.get("language") or "ru",
			}
		)
	SOURCES_JSON.parent.mkdir(parents=True, exist_ok=True)
	payload = {"sources": catalog}
	SOURCES_JSON.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
	logger.info("Wrote %s (%s sources)", SOURCES_JSON.relative_to(ROOT), len(catalog))
	return SOURCES_JSON


def write_index() -> None:
	index = {"site": "OneS News", "dates": []}
	if INDEX.exists():
		loaded = json.loads(INDEX.read_text(encoding="utf-8"))
		if isinstance(loaded, dict):
			index = loaded
	index["site"] = index.get("site") or "OneS News"
	index["dates"] = dates_from_day_files()
	INDEX.parent.mkdir(parents=True, exist_ok=True)
	INDEX.write_text(json.dumps(index, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
