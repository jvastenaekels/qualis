# Open-Q - Open-source platform for conducting Q-methodology research
# Copyright (C) 2025 Julien Vastenekels
# Licensed under the GNU Affero General Public License v3.0 or later.

"""Database seeding script."""

import asyncio
import json
import os
import sys

# Add backend directory to path so 'from app' works regardless of CWD
script_dir = os.path.dirname(os.path.abspath(__file__))  # .../backend/
if script_dir not in sys.path:
    sys.path.insert(0, script_dir)  # noqa: E402

from app.utils.script_utils import APIClient  # noqa: E402


async def seed_study(json_path: str):
    """Seed the database with study data from a JSON file via Admin API."""
    if not os.path.exists(json_path):
        print(f"Error: File {json_path} not found.")
        return

    with open(json_path, encoding="utf-8") as f:
        data = json.load(f)

    api = APIClient()
    try:
        await api.login()

        # 1. Transform data
        data = api.transform_study_data(data)
        slug = data["slug"]

        # 2. Check if study already exists
        response = await api.client.get(f"/api/admin/studies/{slug}")
        if response.status_code == 200:
            print(f"Study '{slug}' already exists. Skipping.")
            return

        # 3. Create Study
        print(f"Creating study '{slug}'...")
        response = await api.client.post("/api/admin/studies/", json=data)

        if response.status_code == 201:
            print(f"Successfully seeded study: {slug}")
        else:
            print(f"Failed to seed study: {response.text}")
            sys.exit(1)

    finally:
        await api.close()


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python seed.py <path_to_study_json>")
        sys.exit(1)

    asyncio.run(seed_study(sys.argv[1]))
