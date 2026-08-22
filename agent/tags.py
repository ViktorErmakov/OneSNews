from __future__ import annotations

import re

STOPWORDS = frozenset({"1с", "1c", "habr", "хабр"})
_WS = re.compile(r"\s+")


def normalize_label(value: str) -> str:
	text = _WS.sub(" ", (value or "").strip())
	return text.replace("ё", "е").replace("Ё", "Е").casefold()


def is_stopword(value: str) -> bool:
	return normalize_label(value) in STOPWORDS


def source_tags(source: dict, raw_labels: list[str] | None = None) -> list[str]:
	"""Native labels with prefix, or the source name when the feed has no taxonomy."""
	prefix = str(source.get("tag_prefix") or "").strip()
	name = str(source.get("name") or "").strip() or "Источник"
	if not prefix:
		return [name]
	seen: set[str] = set()
	out: list[str] = []
	for raw in raw_labels or []:
		label = _WS.sub(" ", str(raw).strip())
		if not label or is_stopword(label):
			continue
		tag = f"{prefix}: {label}"
		key = tag.casefold()
		if key in seen:
			continue
		seen.add(key)
		out.append(tag)
	return out or [prefix]
