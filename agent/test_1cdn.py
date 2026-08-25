from __future__ import annotations

import unittest
from pathlib import Path

from collect_1cdn import (
	OnesDnContractError,
	article_snippet,
	next_listing_url,
	parse_listing_html,
)
from bs4 import BeautifulSoup

FIXTURES = Path(__file__).resolve().parent / "fixtures"


class OnesDnListingTests(unittest.TestCase):
	@classmethod
	def setUpClass(cls) -> None:
		cls.html = (FIXTURES / "ones-dn-blog.html").read_text(encoding="utf-8")

	def test_parses_title_author_date_and_skips_reading_time(self) -> None:
		rows = parse_listing_html(self.html, "https://1c-dn.com/blog/")
		self.assertEqual(
			[(row["title"], row["author"], row["day"].isoformat(), row["url"]) for row in rows],
			[
				(
					"Object Versioning",
					"Alexander Biryukov",
					"2026-08-09",
					"https://1c-dn.com/blog/ssl-object-versioning/",
				),
				(
					"Connecting Distributed Data Sources",
					"Alexander Biryukov",
					"2026-06-02",
					"https://1c-dn.com/blog/connecting-distributed-data-sources/",
				),
			],
		)

	def test_next_page_url(self) -> None:
		soup = BeautifulSoup(self.html, "lxml")
		self.assertEqual(
			next_listing_url(soup, "https://1c-dn.com/blog/"),
			"https://1c-dn.com/blog/?PAGEN_1=2",
		)

	def test_broken_listing_raises(self) -> None:
		with self.assertRaises(OnesDnContractError):
			parse_listing_html("<html><body>no posts</body></html>", "https://1c-dn.com/blog/")


class OnesDnArticleTests(unittest.TestCase):
	def test_skips_disclaimer_and_reads_topic(self) -> None:
		html = (FIXTURES / "ones-dn-article.html").read_text(encoding="utf-8")
		snippet, topics = article_snippet(html, 600)
		self.assertEqual(topics, ["How-to technical articles"])
		self.assertTrue(snippet.startswith("Let's dive straight in"))
		self.assertIn("sales managers", snippet)
		self.assertNotIn("Disclaimer", snippet)


if __name__ == "__main__":
	unittest.main()
