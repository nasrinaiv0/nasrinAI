import tempfile
import unittest
from pathlib import Path

import pandas as pd

from scripts.openrouter_activity_sync import OUTPUT_COLUMNS, classify_model, sync_csv


class OpenRouterCsvSyncTests(unittest.TestCase):
    def test_catalog_classification_does_not_treat_missing_or_auto_alias_as_unlisted(self):
        catalog = {"openai/gpt-4.1", "google/gemini-test"}
        self.assertEqual(classify_model("openai/gpt-4.1", catalog), ("Catalog", False))
        self.assertEqual(classify_model("provider/private-model", catalog), ("Unlisted", True))
        self.assertEqual(classify_model("", catalog), ("Unknown", False))
        self.assertEqual(classify_model("openrouter/auto", catalog), ("Unknown", False))

    def test_csv_upsert_updates_existing_generation_and_deduplicates(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "openrouter_activity_2026-10-25.csv"
            existing = {column: None for column in OUTPUT_COLUMNS}
            existing.update({
                "generation_id": "gen-example-1",
                "created_at": "2026-10-25T01:00:00Z",
                "model_permaslug": "openai/gpt-4.1",
                "cost_total": 0.1,
            })
            pd.DataFrame([existing, existing]).to_csv(path, index=False)
            updated = {column: None for column in OUTPUT_COLUMNS}
            updated.update({
                "generation_id": "gen-example-1",
                "created_at": "2026-10-25T01:00:00Z",
                "model_permaslug": "provider/new-model",
                "cost_total": 0.2,
            })
            count = sync_csv([updated], path, {"openai/gpt-4.1"})
            result = pd.read_csv(path)
            self.assertEqual(count, 1)
            self.assertEqual(len(result), 1)
            self.assertEqual(result.iloc[0]["cost_total"], 0.2)
            self.assertEqual(result.iloc[0]["model_category"], "Unlisted")
            self.assertTrue(bool(result.iloc[0]["is_unlisted_model"]))


if __name__ == "__main__":
    unittest.main()
