import os
import re
import sys

def scan_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # Regex to find text between tags that doesn't look like code
    # Captures: >  Current Text  <
    # Excludes: >{variable}<, > < (whitespace)
    text_between_tags = re.compile(r'>\s*([^<{]+?)\s*<')

    # Regex to find specific attributes that often contain text
    # e.g. label="Something", placeholder="Type here"
    text_attributes = re.compile(r'\b(label|placeholder|title|alt|description|tooltip)=["\']([^"\']{2,})["\']')

    issues = []

    # 1. Check text content between tags
    for match in text_between_tags.finditer(content):
        text = match.group(1).strip()
        # Filter out common non-text things
        if not text:
            continue
        if text.startswith('{') and text.endswith('}'):
            continue
        if re.match(r'^[0-9]+$', text): # Just numbers
            continue
        if len(text) < 2: # Single chars
            continue

        lineno = content.count('\n', 0, match.start()) + 1
        issues.append((lineno, f"Text content: '{text}'"))

    # 2. Check attributes
    for match in text_attributes.finditer(content):
        attr = match.group(1)
        text = match.group(2)
        if text.startswith('{'): continue

        lineno = content.count('\n', 0, match.start()) + 1
        issues.append((lineno, f"Attribute {attr}: '{text}'"))

    return issues

def main():
    base_dir = os.path.join(os.path.dirname(__file__), '../src')
    target_dirs = [
        os.path.join(base_dir, 'pages/admin'),
        os.path.join(base_dir, 'components/admin'),
        os.path.join(base_dir, 'layouts'),
    ]

    total_issues = 0

    for target_dir in target_dirs:
        if not os.path.exists(target_dir):
            continue

        for root, _, files in os.walk(target_dir):
            for file in files:
                if file.endswith(('.tsx', '.ts')) and not file.endswith('.test.tsx'):
                    filepath = os.path.join(root, file)
                    issues = scan_file(filepath)

                    if issues:
                        print(f"\n📄 {os.path.relpath(filepath, base_dir)}:")
                        for line, msg in issues:
                            print(f"  Line {line}: {msg}")
                        total_issues += len(issues)

    if total_issues > 0:
        print(f"\n⚠️  Found {total_issues} potential hardcoded strings.")
        sys.exit(1)
    else:
        print("\n✅ No obvious hardcoded strings found in admin directories.")

if __name__ == '__main__':
    main()
