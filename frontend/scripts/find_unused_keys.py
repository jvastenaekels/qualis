import json
import os
import glob
import re

def get_keys(d, prefix=''):
    keys = set()
    for k, v in d.items():
        if isinstance(v, dict):
            keys.update(get_keys(v, prefix + k + '.'))
        else:
            keys.add(prefix + k)
    return keys

def find_unused_keys():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    locales_dir = os.path.join(base_dir, '../src/locales')
    src_dir = os.path.join(base_dir, '../src')

    with open(os.path.join(locales_dir, 'en.json'), 'r') as f:
        data = json.load(f)

    all_keys = get_keys(data)
    used_keys = set()

    # Read all source files
    source_files = []
    for root, dirs, files in os.walk(src_dir):
        for file in files:
            if file.endswith(('.ts', '.tsx', '.js', '.jsx')):
                source_files.append(os.path.join(root, file))

    file_contents = []
    for sf in source_files:
        with open(sf, 'r') as f:
            file_contents.append(f.read())

    # Check usage
    # We check if the full key string appears unquoted or quoted
    # But often keys are passed as string literals.
    # We'll just look for the literal key string in the file content.
    # We will also try to be smart about dynamic keys:
    # If a key is "common.status.draft.title", we might search for "draft.title" if checking dynamic usage is hard,
    # but let's stick to exact full key first.

    potentially_unused = []

    for key in all_keys:
        found = False
        for content in file_contents:
            if key in content:
                found = True
                break

        # Heuristic for dynamic keys:
        # If key is "common.status.draft.title", maybe code uses `t('common.status.' + status + '.title')`
        # This is hard to detect perfectly.
        # But we can look if the *leaf* key "draft.title" or just "title" appears? No, too broad.
        # Let's check for sub-parts if not found.

        if not found:
            # Check for partial dynamic usage?
            # E.g. `t('errors.' + code)` where code might be '404'.
            # If key is 'errors.404', check if 'errors.' exists.
            # This is risky.
            potentially_unused.append(key)

    print("Potentially unused keys:")
    for k in sorted(potentially_unused):
        print(f"  {k}")

if __name__ == '__main__':
    find_unused_keys()
