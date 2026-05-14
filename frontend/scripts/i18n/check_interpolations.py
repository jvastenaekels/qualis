"""Verify interpolation parity between en/translation.json and every other locale.

For each key whose en value contains {{placeholders}}, the set of placeholders
in the target locale must equal the en set. Missing, renamed, or extra
placeholders are reported as errors.

Missing keys (target lacks a key present in en) are not reported here —
scripts/check_i18n.py owns that check.

Usage:
    python3 frontend/scripts/i18n/check_interpolations.py            # all non-en locales
    python3 frontend/scripts/i18n/check_interpolations.py es it      # specific locales
"""
import json
import re
import sys
from pathlib import Path
from typing import Iterator

PLACEHOLDER_RE = re.compile(r"\{\{\s*([^}]+?)\s*\}\}")


def extract_placeholders(value: object) -> frozenset[str]:
    """Return placeholders found in a string value, empty set otherwise."""
    if not isinstance(value, str):
        return frozenset()
    return frozenset(m.group(1).strip() for m in PLACEHOLDER_RE.finditer(value))


def walk(data: object, prefix: str = "") -> Iterator[tuple[str, str]]:
    """Yield (dotted-key-path, string-value) for every leaf string."""
    if isinstance(data, dict):
        for k, v in data.items():
            new_prefix = f"{prefix}.{k}" if prefix else k
            yield from walk(v, new_prefix)
    elif isinstance(data, str):
        yield prefix, data


def check_locale(en_data: dict, target_data: dict) -> list[dict]:
    """Return a list of mismatch dicts: {key, expected, found}."""
    target_map = dict(walk(target_data))
    errors: list[dict] = []
    for key, en_value in walk(en_data):
        en_placeholders = extract_placeholders(en_value)
        if not en_placeholders:
            continue
        if key not in target_map:
            continue
        target_placeholders = extract_placeholders(target_map[key])
        if en_placeholders != target_placeholders:
            errors.append(
                {
                    "key": key,
                    "expected": sorted(en_placeholders),
                    "found": sorted(target_placeholders),
                }
            )
    return errors


def main() -> int:
    locales_dir = Path(__file__).resolve().parent.parent.parent / "public" / "locales"
    en_path = locales_dir / "en" / "translation.json"
    if not en_path.exists():
        print(f"Error: {en_path} not found.", file=sys.stderr)
        return 1
    with open(en_path, encoding="utf-8") as f:
        en_data = json.load(f)

    if len(sys.argv) > 1:
        targets = sys.argv[1:]
    else:
        targets = sorted(
            d.name
            for d in locales_dir.iterdir()
            if d.is_dir() and d.name != "en"
        )

    overall_ok = True
    for code in targets:
        target_path = locales_dir / code / "translation.json"
        if not target_path.exists():
            print(f"⚠️  {code}: translation.json not found")
            overall_ok = False
            continue
        with open(target_path, encoding="utf-8") as f:
            target_data = json.load(f)
        errors = check_locale(en_data, target_data)
        if errors:
            overall_ok = False
            print(f"❌ {code}: {len(errors)} interpolation mismatch(es)")
            for e in errors:
                print(f"   {e['key']}: expected {e['expected']}, got {e['found']}")
        else:
            print(f"✓ {code}: interpolations OK")
    return 0 if overall_ok else 1


if __name__ == "__main__":
    sys.exit(main())
