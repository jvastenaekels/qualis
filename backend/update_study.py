"""Script to update study configuration from JSON."""

import asyncio
import json
import os
import sys

# Add backend directory to path so 'from app' works regardless of CWD
script_dir = os.path.dirname(os.path.abspath(__file__))  # .../backend/
if script_dir not in sys.path:
    sys.path.insert(0, script_dir)  # noqa: E402

import os
import sys

# Add backend directory to path so 'from app' works regardless of CWD
script_dir = os.path.dirname(os.path.abspath(__file__))  # .../backend/
if script_dir not in sys.path:
    sys.path.insert(0, script_dir)  # noqa: E402

from app.utils.script_utils import APIClient


async def update_study(json_path: str | None = None):
    """Update study data from JSON file via Admin API PATCH."""
    # Detect path relative to this script if not provided
    if json_path is None:
        if len(sys.argv) > 1:
            json_path = sys.argv[1]
        else:
            json_path = os.path.join(script_dir, "data", "example-study.json")

    if not os.path.exists(json_path):
        print(f"Error: {json_path} not found.")
        return

    with open(json_path, encoding="utf-8") as f:
        data = json.load(f)

    api = APIClient()
    try:
        await api.login()

        # 1. Transform data
        data = api.transform_study_data(data)
        slug = data["slug"]

        # 2. Check if study exists
        response = await api.client.get(f"/api/admin/studies/{slug}")
        if response.status_code != 200:
            print(f"Study {slug} not found. Cannot update.")
            return

        print(f"Updating study '{slug}' via API...")

        # 3. PATCH the study
        # The API handles nested updates for translations and statements automatically
        response = await api.client.patch(f"/api/admin/studies/{slug}", json=data)

        if response.status_code == 200:
            print(f"Update complete for study: {slug}")
        else:
            print(f"Failed to update study: {response.text}")
            sys.exit(1)

    finally:
        await api.close()


if __name__ == "__main__":
    # If called with an argument, use that as the JSON path
    path = sys.argv[1] if len(sys.argv) > 1 else None
    asyncio.run(update_study(path))
