import json
import os
import sys

def get_keys(d, prefix=''):
    keys = set()
    for k, v in d.items():
        if isinstance(v, dict):
            keys.update(get_keys(v, prefix + k + '.'))
        else:
            keys.add(prefix + k)
    return keys

def check_i18n():
    locales_dir = os.path.join(os.path.dirname(__file__), '../src/locales')
    master_file = os.path.join(locales_dir, 'en.json')
    
    if not os.path.exists(master_file):
        print(f"Error: Master file {master_file} not found.")
        sys.exit(1)
        
    with open(master_file, 'r', encoding='utf-8') as f:
        master_data = json.load(f)
        
    master_keys = get_keys(master_data)
    
    locale_files = [f for f in os.listdir(locales_dir) if f.endswith('.json') and f != 'en.json']
    
    overall_success = True
    
    for filename in locale_files:
        filepath = os.path.join(locales_dir, filename)
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
            
        keys = get_keys(data)
        
        missing = master_keys - keys
        extra = keys - master_keys
        
        print(f"Checking {filename}...")
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
