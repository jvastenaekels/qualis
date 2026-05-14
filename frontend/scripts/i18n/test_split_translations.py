"""Tests for the locale file splitter."""
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent))

from split_translations import partition_locale, split_locale_file  # noqa: E402


class TestPartitionLocale:
    def test_splits_known_top_level_keys(self):
        data = {
            "common": {"next": "Next"},
            "welcome": {"start": "Start"},
            "admin": {"dashboard": {"title": "Dashboard"}},
            "auth": {"login": {"email_label": "Email"}},
        }
        participant, admin = partition_locale(data)
        assert participant == {
            "common": {"next": "Next"},
            "welcome": {"start": "Start"},
        }
        assert admin == {
            "admin": {"dashboard": {"title": "Dashboard"}},
            "auth": {"login": {"email_label": "Email"}},
        }

    def test_empty_input_returns_empty_outputs(self):
        participant, admin = partition_locale({})
        assert participant == {}
        assert admin == {}

    def test_only_participant_keys(self):
        data = {"common": {"yes": "Yes"}, "post": {"submit": "Submit"}}
        participant, admin = partition_locale(data)
        assert participant == data
        assert admin == {}

    def test_only_admin_keys(self):
        data = {"admin": {"hub": {"title": "Hub"}}}
        participant, admin = partition_locale(data)
        assert participant == {}
        assert admin == data

    def test_unknown_top_level_key_raises(self):
        data = {"common": {}, "rogue": {"x": "y"}}
        with pytest.raises(ValueError, match="rogue"):
            partition_locale(data)

    def test_preserves_nested_structure(self):
        data = {
            "admin": {
                "studies": {
                    "list": {"empty": "No studies"},
                    "n_one": "{{count}} study",
                    "n_other": "{{count}} studies",
                }
            }
        }
        _, admin = partition_locale(data)
        assert admin == data


class TestSplitLocaleFile:
    def test_writes_both_files_and_deletes_source(self, tmp_path):
        src = tmp_path / "translation.json"
        src.write_text(
            json.dumps(
                {
                    "common": {"yes": "Yes"},
                    "admin": {"hub": {"title": "Hub"}},
                }
            ),
            encoding="utf-8",
        )

        split_locale_file(src, delete_source=True)

        participant_path = tmp_path / "participant.json"
        admin_path = tmp_path / "admin.json"
        assert participant_path.exists()
        assert admin_path.exists()
        assert not src.exists()

        assert json.loads(participant_path.read_text()) == {"common": {"yes": "Yes"}}
        assert json.loads(admin_path.read_text()) == {"admin": {"hub": {"title": "Hub"}}}

    def test_keeps_source_when_delete_source_false(self, tmp_path):
        src = tmp_path / "translation.json"
        src.write_text(json.dumps({"common": {"yes": "Yes"}}), encoding="utf-8")
        split_locale_file(src, delete_source=False)
        assert src.exists()
        assert (tmp_path / "participant.json").exists()

    def test_idempotent_when_run_twice(self, tmp_path):
        src = tmp_path / "translation.json"
        src.write_text(
            json.dumps(
                {"common": {"yes": "Yes"}, "admin": {"hub": {"title": "Hub"}}}
            ),
            encoding="utf-8",
        )
        split_locale_file(src, delete_source=False)
        # Second run: should overwrite cleanly, not append/duplicate.
        split_locale_file(src, delete_source=False)
        assert json.loads((tmp_path / "participant.json").read_text()) == {
            "common": {"yes": "Yes"}
        }
        assert json.loads((tmp_path / "admin.json").read_text()) == {
            "admin": {"hub": {"title": "Hub"}}
        }
