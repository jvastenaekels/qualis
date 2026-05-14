"""Verify interpolation parity between en/{namespace}.json and every other locale, per namespace.

For each key whose en value contains {{placeholders}}, the set of placeholders
in the target locale must equal the en set. Missing, renamed, or extra
placeholders are reported as errors.

Missing keys (target lacks a key present in en) are not reported here —
scripts/check_i18n.py owns that check.

Usage:
    python3 frontend/scripts/i18n/check_interpolations.py            # all non-en locales, all namespaces
    python3 frontend/scripts/i18n/check_interpolations.py es it      # specific locales, all namespaces
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


# Per-namespace parity policy. Mirrors check_i18n.py.
NAMESPACE_POLICY: dict[str, dict[str, bool]] = {
    "participant": {"required": True, "strict": True},
    "admin":       {"required": False, "strict": False},
}


def main() -> int:
    from namespace_partition import NAMESPACES

    locales_dir = Path(__file__).resolve().parent.parent.parent / "public" / "locales"

    if len(sys.argv) > 1:
        targets = sys.argv[1:]
    else:
        targets = sorted(
            d.name
            for d in locales_dir.iterdir()
            if d.is_dir() and d.name != "en"
        )

    overall_ok = True
    for namespace in NAMESPACES:
        policy = NAMESPACE_POLICY[namespace]
        en_path = locales_dir / "en" / f"{namespace}.json"
        if not en_path.exists():
            print(f"❌ Missing master file: {en_path}")
            overall_ok = False
            continue
        with open(en_path, encoding="utf-8") as f:
            en_data = json.load(f)

        print(f"\nChecking namespace: {namespace}")
        for code in targets:
            target_path = locales_dir / code / f"{namespace}.json"
            if not target_path.exists():
                if policy["required"]:
                    print(f"❌ {code}/{namespace}.json not found (required)")
                    overall_ok = False
                else:
                    print(f"⚠️  {code}/{namespace}.json not found (best-effort, EN fallback)")
                continue
            with open(target_path, encoding="utf-8") as f:
                target_data = json.load(f)
            errors = check_locale(en_data, target_data)
            if errors:
                severity = "❌" if policy["strict"] else "⚠️ "
                if policy["strict"]:
                    overall_ok = False
                print(f"{severity} {code}/{namespace}.json: {len(errors)} interpolation mismatch(es)")
                for e in errors:
                    print(f"   {e['key']}: expected {e['expected']}, got {e['found']}")
            else:
                print(f"✓ {code}/{namespace}.json: interpolations OK")
    return 0 if overall_ok else 1


if __name__ == "__main__":
    sys.exit(main())
