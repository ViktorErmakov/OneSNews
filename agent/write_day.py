from __future__ import annotations

import json
import logging
import re
from datetime import date
from pathlib import Path

from common import DAYS, INDEX, ROOT, russian_day_title, slug_id

DAY_FILE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}\.json$")

logger = logging.getLogger(__name__)


def to_day_item(raw: dict, item_id: str) -> dict:
	return {
		"id": item_id,
		"title": raw.get("title") or "Без названия",
		"summary": raw.get("summary") or raw.get("snippet") or "",
		"url": raw.get("url") or "",
		"author": raw.get("author") or "Не указан",
		"source_name": raw.get("source_name") or "",
		"source_type": raw.get("source_type") or "other",
		"direction": raw.get("direction") or "community",
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


def dates_from_day_files() -> list[str]:
	DAYS.mkdir(parents=True, exist_ok=True)
	dates = [path.stem for path in DAYS.glob("*.json") if DAY_FILE_RE.match(path.name)]
	dates.sort(reverse=True)
	return dates


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
