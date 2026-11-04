from __future__ import annotations

import unittest
from pathlib import Path

from collect_1ci_kb import (
	OnesCiKbContractError,
	next_quarter,
	parse_digest_html,
	parse_quarter,
)

FIXTURES = Path(__file__).resolve().parent / "fixtures"


class QuarterHelpersTests(unittest.TestCase):
	def test_next_quarter_rolls_year(self) -> None:
		self.assertEqual(next_quarter("Q3_2026"), "Q4_2026")
		self.assertEqual(next_quarter("Q4_2026"), "Q1_2027")

	def test_parse_quarter(self) -> None:
		self.assertEqual(parse_quarter("Q2_2026"), (2, 2026))
		self.assertIsNone(parse_quarter("bad"))


class DigestParseTests(unittest.TestCase):
	@classmethod
	def setUpClass(cls) -> None:
		cls.html = (FIXTURES / "1ci-kb-digest.html").read_text(encoding="utf-8")

	def test_title_and_first_paragraph_only(self) -> None:
		row = parse_digest_html(
			self.html,
			"https://kb.1ci.com/1C_Drive/Whats_New_in_Documentation/Q3_2026/?language=en",
		)
		self.assertEqual(row["title"], "1C:Drive Q3 2026 Digest")
		self.assertEqual(row["quarter"], "Q3_2026")
		self.assertTrue(row["snippet"].startswith("The 1C:Drive Product Team is excited"))
		self.assertIn("developers worldwide", row["snippet"])
		self.assertNotIn("Managing additional reports", row["snippet"])
		self.assertNotIn("Incorrect values", row["snippet"])

	def test_broken_html_raises(self) -> None:
		with self.assertRaises(OnesCiKbContractError):
			parse_digest_html("<html><body><p>no digest</p></body></html>", "https://example.com/")


if __name__ == "__main__":
	unittest.main()
