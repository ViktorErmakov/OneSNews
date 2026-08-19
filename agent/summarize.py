from __future__ import annotations

import json
import logging
import os
import re
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from common import PROMPT, load_config

logger = logging.getLogger(__name__)


def _extract_json_array(text: str) -> list:
	text = text.strip()
	fenced = re.search(r"```(?:json)?\s*(\[.*?\])\s*```", text, flags=re.DOTALL)
	if fenced:
		text = fenced.group(1)
	else:
		start = text.find("[")
		end = text.rfind("]")
		if start >= 0 and end > start:
			text = text[start : end + 1]
	data = json.loads(text)
	if not isinstance(data, list):
		raise ValueError("LLM output is not a JSON array")
	return data


def gemini_summarize(items: list[dict], model: str) -> list[dict]:
	api_key = os.environ.get("GEMINI_API_KEY", "").strip()
	if not api_key:
		raise RuntimeError("GEMINI_API_KEY is not set (agent/.env or environment)")

	payload_items = [
		{
			"id": item["id"],
			"title": item.get("title") or "",
			"url": item.get("url") or "",
			"author": item.get("author") or "",
			"language": item.get("language") or "ru",
			"snippet": item.get("snippet") or "",
		}
		for item in items
	]
	system = PROMPT.read_text(encoding="utf-8")
	user = json.dumps(payload_items, ensure_ascii=False)
	body = {
		"system_instruction": {"parts": [{"text": system}]},
		"contents": [{"role": "user", "parts": [{"text": user}]}],
		"generationConfig": {
			"temperature": 0.3,
			"responseMimeType": "application/json",
		},
	}
	url = (
		"https://generativelanguage.googleapis.com/v1beta/models/"
		f"{model}:generateContent?key={api_key}"
	)
	req = Request(
		url,
		data=json.dumps(body).encode("utf-8"),
		headers={"Content-Type": "application/json"},
		method="POST",
	)
	try:
		with urlopen(req, timeout=120) as resp:  # noqa: S310
			raw = json.loads(resp.read().decode("utf-8"))
	except HTTPError as exc:
		detail = exc.read().decode("utf-8", errors="ignore")
		raise RuntimeError(f"Gemini HTTP {exc.code}: {detail[:500]}") from exc
	except URLError as exc:
		raise RuntimeError(f"Gemini request failed: {exc}") from exc

	text = (
		raw.get("candidates", [{}])[0]
		.get("content", {})
		.get("parts", [{}])[0]
		.get("text", "")
	)
	summaries = _extract_json_array(text)
	by_id = {}
	for row in summaries:
		if isinstance(row, dict) and row.get("id"):
			by_id[str(row["id"])] = (row.get("summary") or "").strip()

	out = []
	for item in items:
		summary = by_id.get(item["id"]) or item.get("snippet") or item.get("title") or ""
		if not by_id.get(item["id"]):
			logger.warning("No LLM summary for %s, using snippet", item["id"])
		out.append({**item, "summary": summary})
	return out


def summarize(items: list[dict]) -> list[dict]:
	if not items:
		return []
	config = load_config()
	llm = config.get("llm") or {}
	provider = (llm.get("provider") or "gemini").strip()
	model = (llm.get("model") or "gemini-2.0-flash").strip()
	if provider != "gemini":
		raise ValueError(f"Unsupported llm.provider: {provider}")
	return gemini_summarize(items, model)
