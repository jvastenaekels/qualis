#!/usr/bin/env python3
"""Check for potentially unsafe SQLAlchemy relationship loading strategies.

In an async context, lazy="select" (the default) triggers synchronous I/O
during serialization, leading to Internal Server Errors.
This script mandates lazy="selectin" or other async-safe strategies.
"""

import ast
import sys
from pathlib import Path

# Config
ASYNC_SAFE_STRATEGIES = {"selectin", "joined", "subquery", "noload"}
MANUALLY_EXEMPTED: set[str] = set()


def check_models_file(file_path: Path) -> int:
    """Analyze the models file for relationship issues."""
    with open(file_path, "r") as f:
        tree = ast.parse(f.read())

    errors = []

    for node in ast.walk(tree):
        # Look for class definitions (SQLAlchemy models)
        if isinstance(node, ast.ClassDef):
            class_name = node.name
            for item in node.body:
                # Look for Mapped assignments or relationship variables
                if isinstance(item, (ast.Assign, ast.AnnAssign)):
                    target = (
                        item.targets[0] if isinstance(item, ast.Assign) else item.target
                    )
                    if not isinstance(target, ast.Name):
                        continue

                    attr_name = target.id
                    value = item.value

                    # Check if it's a relationship() call
                    is_rel = False
                    if isinstance(value, ast.Call):
                        func = value.func
                        if isinstance(func, ast.Name) and func.id == "relationship":
                            is_rel = True
                        elif (
                            isinstance(func, ast.Attribute)
                            and func.attr == "relationship"
                        ):
                            is_rel = True

                    if is_rel:
                        # Check "lazy" argument
                        lazy_found = False
                        lazy_value = None

                        if value and hasattr(value, "keywords"):
                            for keyword in value.keywords:
                                if keyword.arg == "lazy":
                                    lazy_found = True
                                    if isinstance(keyword.value, ast.Constant):
                                        lazy_value = keyword.value.value
                                    break

                        if not lazy_found or lazy_value not in ASYNC_SAFE_STRATEGIES:
                            if f"{class_name}.{attr_name}" not in MANUALLY_EXEMPTED:
                                errors.append(
                                    f"Unsafe relationship in {class_name}.{attr_name}: "
                                    f"lazy={repr(lazy_value)} (Expected one of {ASYNC_SAFE_STRATEGIES})"
                                )

    if errors:
        print(f"\n❌ Found {len(errors)} unsafe relationships in {file_path}:")
        for err in errors:
            print(f"  - {err}")
        return 1

    print(f"\n✅ All relationships in {file_path} use async-safe loading strategies.")
    return 0


if __name__ == "__main__":
    models_path = Path("backend/app/models.py")
    if not models_path.exists():
        print(f"Error: {models_path} not found.")
        sys.exit(1)

    sys.exit(check_models_file(models_path))
