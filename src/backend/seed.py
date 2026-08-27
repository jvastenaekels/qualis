"""Seed the database with study content from a JSON file."""

import asyncio
import os
import sys

# Add the parent directory to sys.path to allow imports from app
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.append(current_dir)

from app.utils.script_utils import sync_study_from_file  # noqa: E402

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python seed.py <path_to_study_json> [--activate]")
        sys.exit(1)

    json_file = sys.argv[1]
    activate = "--activate" in sys.argv[2:]
    print(f"DEBUG: Starting seeding from {json_file} (activate={activate})")
    asyncio.run(sync_study_from_file(json_file, activate=activate))
    print("DEBUG: Seeding completed successfully")
