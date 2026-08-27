"""Verify that each non-en locale has the same key set as en, per namespace.

Each locale ships two files: participant.json and admin.json. Per-namespace
parity policy:
  - participant: strict — mismatches fail CI (exit 1).
  - admin:       best-effort — mismatches warn, CI still passes (exit 0).
                 A missing admin.json file is acceptable; i18next falls back
                 to en/admin.json at runtime via fallbackLng.
"""
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "i18n"))

from i18n_utils import get_keys
from namespace_partition import NAMESPACES

# Per-namespace parity policy.
#   strict=True   : mismatched keys → CI error (exit 1).
#   strict=False  : mismatched keys → warning, CI passes.
#   required=True : target file must exist for every declared language.
NAMESPACE_POLICY: dict[str, dict[str, bool]] = {
    "participant": {"required": True, "strict": True},
    "admin":       {"required": False, "strict": False},
}


def load(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def check_namespace(locales_dir, namespace, languages):
    policy = NAMESPACE_POLICY[namespace]
    master_file = os.path.join(locales_dir, "en", f"{namespace}.json")
    if not os.path.exists(master_file):
        print(f"❌ Missing master file: {master_file}")
        return False

    master_keys = get_keys(load(master_file))
    ok = True

    for lang in languages:
        target_file = os.path.join(locales_dir, lang, f"{namespace}.json")
        if not os.path.exists(target_file):
            if policy["required"]:
                print(f"❌ {lang}/{namespace}.json missing (required)")
                ok = False
            else:
                print(f"⚠️  {lang}/{namespace}.json missing (best-effort, EN fallback)")
            continue

        target_keys = get_keys(load(target_file))
        missing = master_keys - target_keys
        extra = target_keys - master_keys

        if not missing and not extra:
            print(f"  ✓ {lang}/{namespace}.json in sync")
        else:
            severity = "❌" if policy["strict"] else "⚠️ "
            if missing:
                print(f"  {severity} {lang}/{namespace}.json missing keys: {sorted(missing)}")
            if extra:
                print(f"  {severity} {lang}/{namespace}.json extra keys: {sorted(extra)}")
            if policy["strict"]:
                ok = False
    return ok


def check_i18n(locales_dir: str | None = None) -> int:
    if locales_dir is None:
        locales_dir = os.path.join(os.path.dirname(__file__), "../public/locales")
    languages = sorted(
        d
        for d in os.listdir(locales_dir)
        if os.path.isdir(os.path.join(locales_dir, d)) and d != "en"
    )

    overall = True
    for namespace in NAMESPACES:
        print(f"\nChecking namespace: {namespace}")
        if not check_namespace(locales_dir, namespace, languages):
            overall = False

    if not overall:
        print("\nFAIL: at least one locale is out of sync.")
        return 1
    print("\nAll localization files are in sync with en!")
    return 0


if __name__ == "__main__":
    arg_dir = sys.argv[1] if len(sys.argv) > 1 else None
    sys.exit(check_i18n(arg_dir))
