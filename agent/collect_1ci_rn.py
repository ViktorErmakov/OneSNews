from __future__ import annotations

import json
import logging
import re
import sys
import time
from datetime import date, datetime
from pathlib import Path
from urllib.error import HTTPError, URLError
from zoneinfo import ZoneInfo

from bs4 import BeautifulSoup

AGENT = Path(__file__).resolve().parent
if str(AGENT) not in sys.path:
	sys.path.insert(0, str(AGENT))

from common import TMP, clip, load_config, load_sources, resolve_date, strip_html
from collect import http_get, source_meta

logger = logging.getLogger(__name__)

BASE = "https://kb.1ci.com/1C_Drive/Release_Notes/1C_Drive"
STATE_PATH = AGENT / "state" / "1ci_drive_release_notes.json"
VERSION_RE = re.compile(r"^(\d+)\.(\d+)\.(\d+)\.(\d+)$")
LINE_RE = re.compile(r"^(\d+)\.(\d+)\.X$")
SECTION_RE = re.compile(r"^(Features|Improvements|Bug\s+fixes)\s*$", re.I)
HELP_SHELL_RE = re.compile(r"how can we help you today", re.I)
MAX_PROBE = 12
MAX_BUILD_MISS = 3
MAX_NEXT_LINE_BUILDS = 3
PAGE_PAUSE_SEC = 0.4


class OnesCiRnContractError(Exception):
	"""Release notes HTML no longer matches the expected contract."""


def parse_version(value: str) -> tuple[int, int, int, int] | None:
	m = VERSION_RE.match((value or "").strip())
	if not m:
		return None
	return int(m.group(1)), int(m.group(2)), int(m.group(3)), int(m.group(4))


def format_version(parts: tuple[int, int, int, int]) -> str:
	return ".".join(str(p) for p in parts)


def version_sort_key(value: str) -> tuple[int, int, int, int]:
	parsed = parse_version(value)
	if parsed is None:
		raise ValueError(f"Invalid version: {value!r}")
	return parsed


def line_from_version(version: str) -> str:
	parts = parse_version(version)
	if parts is None:
		raise ValueError(f"Invalid version: {version!r}")
	return f"{parts[0]}.{parts[1]}.X"


def next_line(line: str) -> str:
	m = LINE_RE.match((line or "").strip())
	if not m:
		raise ValueError(f"Invalid line: {line!r}")
	major, minor = int(m.group(1)), int(m.group(2))
	return f"{major}.{minor + 1}.X"


def version_slug(version: str) -> str:
	parts = parse_version(version)
	if parts is None:
		raise ValueError(f"Invalid version: {version!r}")
	return "_".join(str(p) for p in parts)


def release_url(version: str) -> str:
	line = line_from_version(version)
	return f"{BASE}/{line}/{version_slug(version)}/"


def candidate_versions_after(last_version: str) -> list[str]:
	parts = parse_version(last_version)
	if parts is None:
		raise ValueError(f"Invalid version: {last_version!r}")
	major, minor, patch, build = parts
	out: list[str] = []
	for step in range(1, MAX_BUILD_MISS + 1):
		out.append(format_version((major, minor, patch, build + step)))
	out.append(format_version((major, minor, patch + 1, 1)))
	# Keep unique order
	seen: set[str] = set()
	ordered: list[str] = []
	for value in out:
		if value in seen:
			continue
		seen.add(value)
		ordered.append(value)
	return ordered[:MAX_PROBE]


def next_line_seed_versions(line: str) -> list[str]:
	m = LINE_RE.match((line or "").strip())
	if not m:
		raise ValueError(f"Invalid line: {line!r}")
	major, minor = int(m.group(1)), int(m.group(2))
	return [format_version((major, minor, 1, build)) for build in range(1, MAX_NEXT_LINE_BUILDS + 1)]


def load_state() -> dict:
	if not STATE_PATH.exists():
		return {"last_version": "1.6.8.6", "line": "1.6.X"}
	try:
		data = json.loads(STATE_PATH.read_text(encoding="utf-8"))
	except (OSError, json.JSONDecodeError) as exc:
		raise OnesCiRnContractError(f"1ci-rn: bad state file {STATE_PATH}: {exc}") from exc
	if not isinstance(data, dict):
		raise OnesCiRnContractError(f"1ci-rn: state must be an object: {STATE_PATH}")
	version = str(data.get("last_version") or "").strip()
	line = str(data.get("line") or "").strip() or (line_from_version(version) if parse_version(version) else "")
	if parse_version(version) is None:
		raise OnesCiRnContractError(f"1ci-rn: invalid last_version in state: {version!r}")
	if LINE_RE.match(line) is None:
		raise OnesCiRnContractError(f"1ci-rn: invalid line in state: {line!r}")
	return {"last_version": version, "line": line}


def save_state(version: str, line: str | None = None) -> None:
	if parse_version(version) is None:
		raise ValueError(f"Invalid version: {version!r}")
	resolved_line = line or line_from_version(version)
	if LINE_RE.match(resolved_line) is None:
		raise ValueError(f"Invalid line: {resolved_line!r}")
	STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
	payload = {"last_version": version, "line": resolved_line}
	STATE_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
	logger.info("1ci-rn: saved last_version=%s line=%s", version, resolved_line)


def commit_cursor_from_items(items: list[dict]) -> None:
	versions: list[str] = []
	lines: dict[str, str] = {}
	for item in items:
		version = str(item.get("release_version") or "").strip()
		if parse_version(version) is None:
			continue
		versions.append(version)
		line = str(item.get("release_line") or "").strip() or line_from_version(version)
		lines[version] = line
	if not versions:
		return
	newest = max(versions, key=version_sort_key)
	current = load_state()["last_version"]
	if version_sort_key(newest) > version_sort_key(current):
		save_state(newest, lines.get(newest))


def fetch_html(url: str) -> str | None:
	try:
		data = http_get(url)
	except HTTPError as exc:
		if exc.code == 404:
			return None
		raise OnesCiRnContractError(f"1ci-rn: HTTP {exc.code} {url}") from exc
	except URLError as exc:
		raise OnesCiRnContractError(f"1ci-rn: request failed {url}: {exc}") from exc
	return data.decode("utf-8", errors="replace")


def looks_like_help_shell(html: str) -> bool:
	return bool(HELP_SHELL_RE.search(html or ""))


def page_has_release_markers(soup: BeautifulSoup) -> bool:
	for tag in soup.find_all(["h1", "h2", "h3"]):
		text = tag.get_text(" ", strip=True)
		if SECTION_RE.match(text or ""):
			return True
	return False


def first_feature_paragraph(soup: BeautifulSoup) -> str:
	features = None
	for tag in soup.find_all(["h1", "h2", "h3"]):
		if re.match(r"^Features\s*$", tag.get_text(" ", strip=True) or "", re.I):
			features = tag
			break
	# XWiki RN pages often use h2 for feature name and h5/p for the body.
	if features is not None:
		for sib in features.next_siblings:
			name = getattr(sib, "name", None)
			if name in {"h1"} or (name in {"h2", "h3"} and SECTION_RE.match(sib.get_text(" ", strip=True) or "")):
				break
			if name in {"h2", "h3", "h4"}:
				title = sib.get_text(" ", strip=True)
				body = ""
				for child in sib.next_siblings:
					cname = getattr(child, "name", None)
					if cname in {"h1", "h2", "h3", "h4"}:
						break
					if cname in {"p", "div", "h5", "h6", "li"}:
						body = child.get_text(" ", strip=True)
						if len(body) >= 40:
							break
						body = ""
				if title and body:
					return f"{title} {body}".strip()
				if body:
					return body
	root = features.parent if features is not None else soup
	for tag in root.find_all(["p", "div", "h5", "h6"]):
		text = tag.get_text(" ", strip=True)
		if len(text) >= 40 and not SECTION_RE.match(text):
			return text
	return ""


def parse_release_html(html: str, url: str, version: str) -> dict:
	if looks_like_help_shell(html) and "Features" not in html:
		raise OnesCiRnContractError(
			f"1ci-rn: HTML_CONTRACT_BROKEN reason=help_shell url={url} html_len={len(html)}"
		)
	soup = BeautifulSoup(html, "lxml")
	if not page_has_release_markers(soup):
		raise OnesCiRnContractError(
			f"1ci-rn: HTML_CONTRACT_BROKEN reason=no_release_markers url={url} html_len={len(html)}"
		)
	snippet = first_feature_paragraph(soup)
	if not snippet:
		raise OnesCiRnContractError(
			f"1ci-rn: HTML_CONTRACT_BROKEN reason=no_feature_paragraph url={url} html_len={len(html)}"
		)
	return {
		"title": f"1C:Drive {version}",
		"snippet": snippet,
		"url": url.split("#", 1)[0],
		"version": version,
		"line": line_from_version(version),
	}


def try_fetch_release(version: str, *, pause: bool) -> dict | None:
	url = release_url(version)
	if pause:
		time.sleep(PAGE_PAUSE_SEC)
	html = fetch_html(url)
	if html is None:
		logger.info("1ci-rn: no page yet for %s", version)
		return None
	try:
		row = parse_release_html(html, url, version)
	except OnesCiRnContractError as exc:
		logger.info("1ci-rn: %s not ready yet (%s)", version, exc)
		return None
	logger.info("1ci-rn: found %s", version)
	return row


def probe_new_releases(last_version: str, line: str) -> list[dict]:
	found: list[dict] = []
	# 1) Same product line: consecutive builds / next patch
	for index, version in enumerate(candidate_versions_after(last_version)):
		row = try_fetch_release(version, pause=index > 0 or bool(found))
		if row is None:
			# Stop contiguous probe on first miss after at least one hit,
			# otherwise keep scanning the candidate list (build gaps).
			if found:
				break
			continue
		found.append(row)

	# 2) Next major.minor line (e.g. 1.7.X)
	nxt = next_line(line)
	for index, version in enumerate(next_line_seed_versions(nxt)):
		# Skip if already older/equal than something we found? Still probe next line.
		if parse_version(version) and version_sort_key(version) <= version_sort_key(last_version):
			continue
		if any(r.get("version") == version for r in found):
			continue
		row = try_fetch_release(version, pause=True)
		if row is None:
			if index == 0:
				logger.info("1ci-rn: next line %s not ready", nxt)
			break
		found.append(row)
	return found


def to_raw_item(row: dict, source: dict, target: date, tz: ZoneInfo, snippet_chars: int) -> dict:
	published = datetime(target.year, target.month, target.day, tzinfo=tz)
	author = (source.get("name") or "1C:Drive Release Notes").strip()
	return {
		"title": row.get("title") or "Untitled",
		"url": row.get("url") or "",
		"author": author,
		"published_at": published.isoformat(),
		"snippet": clip(strip_html(row.get("snippet") or ""), snippet_chars),
		"release_version": row.get("version") or "",
		"release_line": row.get("line") or "",
		**source_meta(source, []),
	}


def collect_1ci_rn_source(source: dict, target: date, tz: ZoneInfo, snippet_chars: int) -> list[dict]:
	state = load_state()
	rows = probe_new_releases(state["last_version"], state["line"])
	items = [to_raw_item(row, source, target, tz, snippet_chars) for row in rows]
	if not items:
		logger.info(
			"1ci-rn: 0 new releases after %s for %s",
			state["last_version"],
			target.isoformat(),
		)
	else:
		logger.info("1ci-rn: %s new release(s) for %s", len(items), target.isoformat())
	return items


def collect_1ci_rn_range(
	source: dict,
	start: date,
	end: date,
	tz: ZoneInfo,
	snippet_chars: int,
) -> dict[date, list[dict]]:
	items = collect_1ci_rn_source(source, end, tz, snippet_chars)
	if not items:
		return {}
	return {end: items}


def ones_ci_rn_source_from_yaml() -> dict:
	for src in load_sources(include_disabled=True):
		if src.get("fetch") == "1ci_kb_rn":
			return src
	raise SystemExit("1C:Drive Release Notes source (fetch: 1ci_kb_rn) is missing from sources.yaml")


def main() -> int:
	import argparse

	logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
	parser = argparse.ArgumentParser(description="Collect 1Ci KB Drive release notes")
	parser.add_argument("--date", help="YYYY-MM-DD (overrides config)")
	parser.add_argument(
		"--write-day",
		action="store_true",
		help="Merge into data/days and advance cursor",
	)
	args = parser.parse_args()
	config = load_config()
	tz = ZoneInfo(config.get("timezone") or "Europe/Moscow")
	snippet_chars = int(config.get("snippet_chars") or 600)
	max_items = int(config.get("max_items") or 40)
	source = ones_ci_rn_source_from_yaml()
	day = resolve_date(config, args.date)
	try:
		items = collect_1ci_rn_source(source, day, tz, snippet_chars)[:max_items]
	except OnesCiRnContractError as exc:
		logger.error("%s", exc)
		return 1
	TMP.mkdir(parents=True, exist_ok=True)
	out = TMP / f"raw-1ci-rn-{day.isoformat()}.json"
	out.write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")
	logger.info("Wrote %s raw 1ci-rn items to %s", len(items), out)
	if args.write_day and items:
		from run import apply_direct_summary
		from write_day import merge_sources_into_day, write_sources_catalog

		write_sources_catalog()
		capped = [apply_direct_summary(item) for item in items]
		merge_sources_into_day(day, capped, replace_names={source.get("name")})
		commit_cursor_from_items(capped)
	return 0


if __name__ == "__main__":
	raise SystemExit(main())
