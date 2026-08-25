from __future__ import annotations

import unittest
from datetime import date
from pathlib import Path
from zoneinfo import ZoneInfo

from collect import (
	channel_id_from_channel_page,
	parse_youtube_atom,
	resolve_youtube_feed_url,
)
from run import apply_direct_summary

FIXTURE = Path(__file__).resolve().parent / "fixtures" / "youtube-atom.xml"
TZ = ZoneInfo("Europe/Moscow")
SOURCE = {
	"name": "Желтый клуб",
	"source_type": "video",
	"language": "ru",
	"summarize": False,
}


class YoutubeUrlTests(unittest.TestCase):
	def test_normalizes_scheme_and_channel_path(self) -> None:
		url = resolve_youtube_feed_url(
			"hhttps://www.youtube.com/channel/UCO1Vs4ZvpxC7Cke2BIFFDuA"
		)
		self.assertEqual(
			url,
			"https://www.youtube.com/feeds/videos.xml?channel_id=UCO1Vs4ZvpxC7Cke2BIFFDuA",
		)

	def test_keeps_feed_url(self) -> None:
		feed = "https://www.youtube.com/feeds/videos.xml?channel_id=UCO1Vs4ZvpxC7Cke2BIFFDuA"
		self.assertEqual(resolve_youtube_feed_url(feed), feed)

	def test_resolves_handle_from_channel_page(self) -> None:
		html = (
			'<link rel="canonical" href="https://www.youtube.com/channel/UCO1Vs4ZvpxC7Cke2BIFFDuA">'
			'"externalId":"UCO1Vs4ZvpxC7Cke2BIFFDuA"'
		)

		def fetch_bytes(url: str) -> bytes:
			self.assertEqual(url, "https://www.youtube.com/@yellow_club")
			return html.encode("utf-8")

		url = resolve_youtube_feed_url(
			"https://www.youtube.com/@yellow_club",
			fetch_bytes=fetch_bytes,
		)
		self.assertEqual(
			url,
			"https://www.youtube.com/feeds/videos.xml?channel_id=UCO1Vs4ZvpxC7Cke2BIFFDuA",
		)

	def test_channel_id_prefers_external_id(self) -> None:
		html = '"externalId":"UCO1Vs4ZvpxC7Cke2BIFFDuA"'
		self.assertEqual(channel_id_from_channel_page(html), "UCO1Vs4ZvpxC7Cke2BIFFDuA")


class YoutubeAtomTests(unittest.TestCase):
	@classmethod
	def setUpClass(cls) -> None:
		cls.xml = FIXTURE.read_bytes()

	def test_watch_in_day_skips_shorts_and_other_days(self) -> None:
		buckets = parse_youtube_atom(
			self.xml, SOURCE, date(2026, 8, 14), date(2026, 8, 14), TZ, 600
		)
		items = buckets.get(date(2026, 8, 14), [])
		urls = [item["url"] for item in items]
		self.assertEqual(
			urls,
			[
				"https://www.youtube.com/watch?v=5pLfIoJfW40",
				"https://www.youtube.com/watch?v=nodesc00001",
			],
		)
		self.assertTrue(items[0]["snippet"].endswith("…"))
		self.assertLessEqual(len(items[0]["snippet"]), 600)
		self.assertEqual(items[1]["snippet"], "")
		self.assertEqual(items[0]["source_type"], "video")
		self.assertEqual(items[0]["source_name"], "Желтый клуб")

	def test_shorts_not_collected_on_their_day(self) -> None:
		buckets = parse_youtube_atom(
			self.xml, SOURCE, date(2026, 8, 24), date(2026, 8, 24), TZ, 600
		)
		self.assertEqual(buckets, {})

	def test_older_watch_stays_on_its_day(self) -> None:
		buckets = parse_youtube_atom(
			self.xml, SOURCE, date(2026, 7, 23), date(2026, 7, 23), TZ, 600
		)
		items = buckets[date(2026, 7, 23)]
		self.assertEqual(len(items), 1)
		self.assertEqual(items[0]["url"], "https://www.youtube.com/watch?v=FjL9sBgfGo8")
		self.assertEqual(items[0]["snippet"], "Предзапись на курс по Архитектуре.")


class DirectSummaryTests(unittest.TestCase):
	def test_video_empty_snippet_does_not_copy_title(self) -> None:
		item = apply_direct_summary(
			{
				"title": "Выпуск без описания",
				"snippet": "",
				"source_type": "video",
			}
		)
		self.assertEqual(item["summary"], "")
		self.assertEqual(item["title"], "Выпуск без описания")


if __name__ == "__main__":
	unittest.main()
