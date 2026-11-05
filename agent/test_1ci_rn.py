from __future__ import annotations

import unittest
from pathlib import Path

from collect_1ci_rn import (
	OnesCiRnContractError,
	candidate_versions_after,
	line_from_version,
	next_line,
	parse_release_html,
	parse_version,
	release_url,
	version_slug,
)

FIXTURES = Path(__file__).resolve().parent / "fixtures"


class VersionHelpersTests(unittest.TestCase):
	def test_parse_and_slug(self) -> None:
		self.assertEqual(parse_version("1.6.8.7"), (1, 6, 8, 7))
		self.assertEqual(version_slug("1.6.8.7"), "1_6_8_7")
		self.assertEqual(line_from_version("1.6.8.7"), "1.6.X")
		self.assertEqual(next_line("1.6.X"), "1.7.X")

	def test_release_url(self) -> None:
		self.assertEqual(
			release_url("1.6.8.7"),
			"https://kb.1ci.com/1C_Drive/Release_Notes/1C_Drive/1.6.X/1_6_8_7/",
		)

	def test_candidate_versions_after(self) -> None:
		cands = candidate_versions_after("1.6.8.6")
		self.assertEqual(cands[0], "1.6.8.7")
		self.assertIn("1.6.9.1", cands)


class ReleaseParseTests(unittest.TestCase):
	@classmethod
	def setUpClass(cls) -> None:
		cls.html = (FIXTURES / "1ci-rn-version.html").read_text(encoding="utf-8")

	def test_title_and_first_feature_only(self) -> None:
		row = parse_release_html(
			self.html,
			"https://kb.1ci.com/1C_Drive/Release_Notes/1C_Drive/1.6.X/1_6_8_7/",
			"1.6.8.7",
		)
		self.assertEqual(row["title"], "1C:Drive 1.6.8.7")
		self.assertEqual(row["version"], "1.6.8.7")
		self.assertEqual(row["line"], "1.6.X")
		self.assertTrue(row["snippet"].startswith("Prepaid expenses."))
		self.assertIn("prepaid expenses functionality", row["snippet"])
		self.assertNotIn("Product tolerance", row["snippet"])
		self.assertNotIn("21776", row["snippet"])

	def test_broken_html_raises(self) -> None:
		with self.assertRaises(OnesCiRnContractError):
			parse_release_html(
				"<html><body><p>how can we help you today</p></body></html>",
				"https://example.com/",
				"1.6.8.8",
			)


if __name__ == "__main__":
	unittest.main()
