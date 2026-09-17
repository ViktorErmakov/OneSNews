from __future__ import annotations

import unittest

from common import load_sources


class LoadSourcesTests(unittest.TestCase):
	def test_video_sources_take_group_from_yaml_key(self) -> None:
		items = load_sources()
		okolo = next(src for src in items if src.get("name") == "Okolo_1C")
		self.assertEqual(okolo["source_type"], "video")
		self.assertEqual(okolo["group"], "YouTube")
		infostart_yt = next(src for src in items if src.get("name") == "Infostart (youtube)")
		self.assertEqual(infostart_yt["group"], "YouTube")
		habr = next(src for src in items if src.get("name") == "Habr 1C")
		self.assertEqual(habr["source_type"], "site")
		self.assertNotIn("group", habr)
