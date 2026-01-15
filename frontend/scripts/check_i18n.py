import json
import os
import sys

from i18n_utils import get_keys

def check_i18n():
    locales_dir = os.path.join(os.path.dirname(__file__), '../public/locales')
    master_file = os.path.join(locales_dir, 'en/translation.json')

    if not os.path.exists(master_file):
        print(f"Error: Master file {master_file} not found.")
        sys.exit(1)

    with open(master_file, 'r', encoding='utf-8') as f:
        master_data = json.load(f)

    master_keys = get_keys(master_data)

    # In public/locales, each language has its own directory
    languages = [d for d in os.listdir(locales_dir) if os.path.isdir(os.path.join(locales_dir, d)) and d != 'en']

    overall_success = True

    for lang in languages:
        filepath = os.path.join(locales_dir, lang, 'translation.json')
        if not os.path.exists(filepath):
            print(f"⚠️  Missing translation.json for language: {lang}")
            overall_success = False
            continue

        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)

        keys = get_keys(data)

        missing = master_keys - keys
        extra = keys - master_keys

        print(f"Checking {lang}...")
        if not missing and not extra:
            print("  ✓ Perfect sync.")
        else:
            overall_success = False
            if missing:
                print(f"  ❌ Missing keys: {sorted(list(missing))}")
            if extra:
                print(f"  ⚠️  Extra keys (not in en.json): {sorted(list(extra))}")
        print("-" * 20)

    if not overall_success:
        sys.exit(1)
    else:
        print("All localization files are in sync with en.json!")

if __name__ == '__main__':
    check_i18n()
