"""Split <locale>/translation.json into <locale>/participant.json + <locale>/admin.json.

Idempotent: running again overwrites the targets with fresh content.

Usage:
    python3 frontend/scripts/i18n/split_translations.py              # all locales under public/locales
    python3 frontend/scripts/i18n/split_translations.py en fr        # specific locales
    python3 frontend/scripts/i18n/split_translations.py --keep       # don't delete the source translation.json
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from namespace_partition import PARTITION  # noqa: E402


def partition_locale(data: dict) -> tuple[dict, dict]:
    """Return (participant_data, admin_data) from a translation.json dict.

    Raises ValueError if a top-level key is not in the partition manifest.
    """
    participant: dict = {}
    admin: dict = {}
    for key, value in data.items():
        target = PARTITION.get(key)
        if target is None:
            raise ValueError(
                f"Unknown top-level key {key!r} in translation.json — "
                f"add it to namespace_partition.PARTITION first."
            )
        if target == "participant":
            participant[key] = value
        elif target == "admin":
            admin[key] = value
        else:
            raise ValueError(f"Unknown target namespace {target!r} for key {key!r}.")
    return participant, admin


def split_locale_file(translation_path: Path, *, delete_source: bool) -> None:
    """Split one locale's translation.json. Writes participant.json + admin.json
    in the same directory. Optionally deletes the source.
    """
    with open(translation_path, encoding="utf-8") as f:
        data = json.load(f)
    participant, admin = partition_locale(data)

    participant_path = translation_path.parent / "participant.json"
    admin_path = translation_path.parent / "admin.json"

    with open(participant_path, "w", encoding="utf-8") as f:
        json.dump(participant, f, ensure_ascii=False, indent=4)
        f.write("\n")  # trailing newline to match existing project convention
    with open(admin_path, "w", encoding="utf-8") as f:
        json.dump(admin, f, ensure_ascii=False, indent=4)
        f.write("\n")

    if delete_source:
        translation_path.unlink()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "locales",
        nargs="*",
        help="Locale codes to split (default: all under public/locales).",
    )
    parser.add_argument(
        "--keep",
        action="store_true",
        help="Keep the source translation.json after splitting (default: delete).",
    )
    args = parser.parse_args()

    locales_dir = Path(__file__).resolve().parent.parent.parent / "public" / "locales"
    if not locales_dir.exists():
        print(f"Error: {locales_dir} not found.", file=sys.stderr)
        return 1

    if args.locales:
        targets = args.locales
    else:
        targets = sorted(d.name for d in locales_dir.iterdir() if d.is_dir())

    delete_source = not args.keep
    for code in targets:
        translation_path = locales_dir / code / "translation.json"
        if not translation_path.exists():
            print(f"⚠️  {code}: translation.json not found, skipping")
            continue
        split_locale_file(translation_path, delete_source=delete_source)
        print(f"✓ {code}: split into participant.json + admin.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
