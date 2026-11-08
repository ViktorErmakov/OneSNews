from __future__ import annotations

import unittest

from bs4 import BeautifulSoup

from collect_infostart import next_catalog_url, readable_text, to_raw_item


TOOLS = "https://infostart.ru/1c/tools/"
PAGE_TWO = "https://infostart.ru/1c/tools/?PAGEN_1=2"


def soup_of(*hrefs: str) -> BeautifulSoup:
	links = "".join(f'<a href="{href}">page</a>' for href in hrefs)
	return BeautifulSoup(f"<html><body>{links}</body></html>", "lxml")


class NextCatalogUrlTests(unittest.TestCase):
	def test_prefers_same_catalog_over_object_view(self) -> None:
		soup = soup_of(
			"/1c/tools/?OBJECT_VIEW=25730&sort=active_from&PAGEN_1=2",
			"/1c/tools/?PAGEN_1=2",
		)
		self.assertEqual(next_catalog_url(soup, TOOLS), PAGE_TWO)

	def test_restores_catalog_when_pager_changes_filter(self) -> None:
		soup = soup_of("/1c/tools/?OBJECT_VIEW=25730&sort=active_from&PAGEN_1=2")
		self.assertEqual(next_catalog_url(soup, TOOLS), PAGE_TWO)

	def test_keeps_query_already_on_the_page(self) -> None:
		soup = soup_of("/1c/tools/?PAGEN_1=2")
		self.assertEqual(
			next_catalog_url(soup, "https://infostart.ru/1c/tools/?sort=active_from"),
			"https://infostart.ru/1c/tools/?sort=active_from&PAGEN_1=2",
		)

	def test_stops_when_catalog_has_no_pager(self) -> None:
		soup = soup_of("/1c/tools/2837773/")
		self.assertIsNone(next_catalog_url(soup, TOOLS))


def mojibake(text: str) -> str:
	return text.encode("utf-8").decode("cp1251")


SOURCE = {"name": "Infostart", "source_type": "site", "language": "ru"}
REPORT = "https://infostart.ru/1c/reports/2837200/"


class ReadableTextTests(unittest.TestCase):
	def test_repairs_utf8_read_as_cp1251(self) -> None:
		self.assertEqual(readable_text(mojibake("Прибыль после распределения")), "Прибыль после распределения")

	def test_repairs_nbsp_inside_mojibake(self) -> None:
		self.assertEqual(readable_text(mojibake("Решения всех задач")), "Решения всех задач")

	def test_leaves_normal_russian_alone(self) -> None:
		self.assertEqual(readable_text("Счёт-фактура для БГУ"), "Счёт-фактура для БГУ")

	def test_drops_card_when_text_stays_unreadable(self) -> None:
		title = mojibake("Прибыль") + "\u4e00"
		item = to_raw_item(
			{"title": title, "url": REPORT, "author": "prime9", "snippet": "нормальное описание", "blob": ""},
			SOURCE,
			600,
		)
		self.assertIsNone(item)

	def test_keeps_repaired_title(self) -> None:
		item = to_raw_item(
			{
				"title": mojibake("Прибыль после распределения"),
				"url": REPORT,
				"author": "ho_ope",
				"snippet": mojibake("Результат сохраняется в Excel."),
				"blob": "",
			},
			SOURCE,
			600,
		)
		self.assertIsNotNone(item)
		assert item is not None
		self.assertEqual(item["title"], "Прибыль после распределения")
		self.assertEqual(item["snippet"], "Результат сохраняется в Excel.")


if __name__ == "__main__":
	unittest.main()
