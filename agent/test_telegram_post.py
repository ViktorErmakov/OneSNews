from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from telegram_post import (
	build_messages,
	html_escape,
	load_posted,
	pack_tagged,
	ru_materials,
	save_posted,
)


def sample_day() -> dict:
	return {
		"date": "2026-11-15",
		"title": "Дайджест за 15 ноября 2026",
		"items": [
			{
				"title": "A < B & C",
				"url": "https://infostart.ru/a",
				"source_name": "Infostart",
				"source_type": "site",
			},
			{
				"title": "Второй материал",
				"url": "https://infostart.ru/b",
				"source_name": "Infostart",
				"source_type": "site",
			},
			{
				"title": "Заметка",
				"url": "https://t.me/example/1",
				"source_name": "Хатка Бобра",
				"source_type": "telegram",
			},
			{
				"title": "Без дома",
				"url": "https://example.com/plain",
				"source_name": "Черновик",
				"source_type": "site",
			},
		],
	}


HOMES = {"Infostart": "https://infostart.ru/", "Хатка Бобра": "https://t.me/evilbeaverHouse"}


class TelegramFormatTests(unittest.TestCase):
	def test_materials_plural(self) -> None:
		self.assertEqual(ru_materials(1), "1 материал")
		self.assertEqual(ru_materials(2), "2 материала")
		self.assertEqual(ru_materials(5), "5 материалов")
		self.assertEqual(ru_materials(11), "11 материалов")
		self.assertEqual(ru_materials(21), "21 материал")
		self.assertEqual(ru_materials(22), "22 материала")

	def test_summary_counts_homes_and_day_link(self) -> None:
		messages = build_messages(sample_day(), HOMES)
		summary = messages[0]["text"]
		self.assertIn("Дайджест за 15 ноября 2026", summary)
		self.assertIn("4 материала", summary)
		self.assertIn('<a href="https://infostart.ru/">Infostart</a> — 2', summary)
		self.assertIn('<a href="https://t.me/evilbeaverHouse">Хатка Бобра</a> — 1', summary)
		self.assertIn("Черновик — 1", summary)
		self.assertNotIn('href="https://example.com/plain"', summary)
		self.assertIn("https://enterprisehub.dev/?date=2026-11-15", summary)
		self.assertEqual(messages[0]["preview_url"], "https://enterprisehub.dev/?date=2026-11-15")
		self.assertLess(summary.index("Сайты"), summary.index("Telegram"))
		self.assertLess(summary.index("Infostart"), summary.index("Черновик"))

	def test_list_groups_titles_and_escapes(self) -> None:
		messages = build_messages(sample_day(), HOMES)
		listing = "\n".join(message["text"] for message in messages[1:])
		self.assertIn("<b>Сайты</b>", listing)
		self.assertIn("<b>Telegram</b>", listing)
		self.assertIn('<a href="https://infostart.ru/a">A &lt; B &amp; C</a> — Infostart', listing)
		self.assertNotIn("A < B", listing)
		self.assertIn("Заметка", listing)
		self.assertTrue(all(message["preview_url"] is None for message in messages[1:]))
		self.assertEqual(html_escape("A < B & C"), "A &lt; B &amp; C")

	def test_long_list_is_split_under_limit(self) -> None:
		items = []
		for index in range(30):
			items.append(
				{
					"title": f"Заголовок {index:02d} " + ("слово " * 12),
					"url": f"https://infostart.ru/long/{index}/{'x' * 80}",
					"source_name": "Infostart",
					"source_type": "site",
				}
			)
		day = {"date": "2026-11-11", "title": "Дайджест за 11 ноября 2026", "items": items}
		messages = build_messages(day, {"Infostart": "https://infostart.ru/"}, limit=3500)
		self.assertGreater(len(messages), 2)
		for message in messages:
			self.assertLessEqual(len(message["text"]), 3500)
		joined = "\n".join(message["text"] for message in messages)
		for index in range(30):
			self.assertIn(f"Заголовок {index:02d}", joined)

	def test_header_is_not_left_alone(self) -> None:
		lines = [
			("item", "x" * 20),
			("header", "HEAD"),
			("item", "y" * 20),
		]
		chunks = pack_tagged(lines, limit=30)
		self.assertTrue(all(not chunk.endswith("HEAD") for chunk in chunks))
		self.assertIn("HEAD\n" + ("y" * 20), "\n".join(chunks))

	def test_posted_dates_roundtrip(self) -> None:
		with tempfile.TemporaryDirectory() as tmp:
			path = Path(tmp) / "telegram_posted.json"
			self.assertEqual(load_posted(path), set())
			save_posted({"2026-11-15", "2026-11-11"}, path)
			self.assertEqual(load_posted(path), {"2026-11-11", "2026-11-15"})


if __name__ == "__main__":
	unittest.main()
