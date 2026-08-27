import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'i18n'))

from i18n_utils import get_keys
from namespace_partition import NAMESPACES


def find_unused_keys():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    locales_dir = os.path.join(base_dir, '../public/locales')
    src_dir = os.path.join(base_dir, '../src')

    all_keys = set()
    for namespace in NAMESPACES:
        master_path = os.path.join(locales_dir, 'en', f'{namespace}.json')
        if not os.path.exists(master_path):
            print(f"Error: Master file {master_path} not found.")
            return
        with open(master_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        all_keys |= get_keys(data)

    # Read all source files
    source_files = []
    for root, _dirs, files in os.walk(src_dir):
        for file in files:
            if file.endswith(('.ts', '.tsx', '.js', '.jsx')):
                source_files.append(os.path.join(root, file))

    file_contents = []
    for sf in source_files:
        with open(sf, 'r', encoding='utf-8') as f:
            file_contents.append(f.read())

    # Check usage
    potentially_unused = []
    for key in all_keys:
        found = False
        for content in file_contents:
            if key in content:
                found = True
                break
        if not found:
            potentially_unused.append(key)

    print("Potentially unused keys:")
    for k in sorted(potentially_unused):
        print(f"  {k}")


if __name__ == '__main__':
    find_unused_keys()
