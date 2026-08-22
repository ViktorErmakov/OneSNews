from __future__ import annotations

import html
import os
import re
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import yaml

ROOT = Path(__file__).resolve().parents[1]
AGENT = Path(__file__).resolve().parent
TMP = AGENT / "tmp"
DAYS = ROOT / "data" / "days"
INDEX = ROOT / "data" / "index.json"
SOURCES = ROOT / "sources.yaml"
SOURCES_JSON = ROOT / "data" / "sources.json"
CONFIG = AGENT / "config.yaml"
PROMPT = AGENT / "prompts" / "summarize.md"

SECTION_TO_TYPE = {
	"site": "site",
	"telegram": "telegram",
	"video": "video",
}

MONTHS_RU = {
	1: "января",
	2: "февраля",
	3: "марта",
	4: "апреля",
	5: "мая",
	6: "июня",
	7: "июля",
	8: "августа",
	9: "сентября",
	10: "октября",
	11: "ноября",
	12: "декабря",
}


def load_dotenv(path: Path | None = None) -> None:
	env_path = path or (AGENT / ".env")
	if not env_path.exists():
		return
	for line in env_path.read_text(encoding="utf-8").splitlines():
		line = line.strip()
		if not line or line.startswith("#") or "=" not in line:
			continue
		key, value = line.split("=", 1)
		os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def load_config() -> dict:
	data = yaml.safe_load(CONFIG.read_text(encoding="utf-8")) or {}
	if not isinstance(data, dict):
		raise ValueError("agent/config.yaml must be a mapping")
	return data


def load_sources(*, include_disabled: bool = False) -> list[dict]:
	raw = yaml.safe_load(SOURCES.read_text(encoding="utf-8")) or {}
	if not isinstance(raw, dict):
		raise ValueError("sources.yaml must be a mapping of sections")
	items: list[dict] = []
	for section, source_type in SECTION_TO_TYPE.items():
		for src in raw.get(section) or []:
			if not isinstance(src, dict):
				continue
			if not include_disabled and not src.get("enabled", True):
				continue
			entry = dict(src)
			entry["source_type"] = source_type
			entry["fetch"] = (entry.get("fetch") or "rss").strip()
			entry["summarize"] = bool(entry.get("summarize", True))
			items.append(entry)
	return items


def resolve_date(config: dict, cli_date: str | None = None) -> date:
	tz = ZoneInfo(config.get("timezone") or "Europe/Moscow")
	if cli_date:
		return date.fromisoformat(cli_date)
	mode = (config.get("date_mode") or "yesterday").strip()
	if mode == "explicit":
		value = config.get("explicit_date")
		if not value:
			raise ValueError("explicit_date is required when date_mode is explicit")
		return date.fromisoformat(str(value))
	today = datetime.now(tz).date()
	if mode == "today":
		return today
	return today - timedelta(days=1)


def russian_day_title(day: date) -> str:
	return f"Дайджест за {day.day} {MONTHS_RU[day.month]} {day.year}"


def slug_id(day: date, index: int) -> str:
	return f"{day.isoformat()}-{index:03d}"


def strip_html(text: str) -> str:
	text = re.sub(r"(?is)<script.*?>.*?</script>", " ", text)
	text = re.sub(r"(?is)<style.*?>.*?</style>", " ", text)
	text = re.sub(r"(?s)<[^>]+>", " ", text)
	text = html.unescape(text)
	return re.sub(r"\s+", " ", text).strip()


def clean_snippet(text: str) -> str:
	text = html.unescape(text or "").strip()
	text = re.sub(r"(?i)\s*читать далее\.?\s*$", "", text).strip()
	return text


def clip(text: str, limit: int) -> str:
	text = (text or "").strip()
	if len(text) <= limit:
		return text
	return text[: max(0, limit - 1)].rstrip() + "…"
