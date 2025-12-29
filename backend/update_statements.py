# Open-Q - Open-source platform for conducting Q-methodology research
# Copyright (C) 2025 Julien Vastenekels
# Licensed under the GNU Affero General Public License v3.0 or later.

"""Script to update statement texts with filler data."""

import asyncio
import os
import sys

# Add backend directory to path so 'from app' works regardless of CWD
script_dir = os.path.dirname(os.path.abspath(__file__))  # .../backend/
if script_dir not in sys.path:
    sys.path.insert(0, script_dir)  # noqa: E402

from app.utils.script_utils import APIClient  # noqa: E402


async def update_statements():
    """Update statement texts with filler data via Admin API."""
    print("--- Updating Statement Texts ---")

    # Define Lorem ipsum variations
    LOREM_SHORT = " Lorem ipsum dolor sit amet."
    LOREM_MEDIUM = " Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua."
    LOREM_LONG = " Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur."

    api = APIClient()
    try:
        await api.login()

        # 1. Fetch all studies to find statements (API listing)
        response = await api.client.get("/api/admin/studies/")
        if response.status_code != 200:
            print("Failed to fetch studies.")
            return

        studies = response.json()
        if not studies:
            print("No studies found.")
            return

        for study_data in studies:
            slug = study_data["slug"]
            print(f"Processing study: {slug}")

            # Fetch full study to get statements
            resp_full = await api.client.get(f"/api/admin/studies/{slug}")
            study = resp_full.json()
            statements = study.get("statements", [])

            if not statements:
                continue

            updates = []
            for i, stmt in enumerate(statements):
                # Vary text length based on index
                if i % 4 == 0 or i % 4 == 1:
                    extra = LOREM_SHORT
                elif i % 4 == 2:
                    extra = LOREM_MEDIUM
                else:
                    extra = LOREM_LONG

                # Prepare statement update
                s_update = {
                    "code": stmt["code"],
                    "translations": [
                        {
                            "language_code": "en",
                            "text": f"Statement {stmt['code']}:{extra}",
                        },
                        {
                            "language_code": "fr",
                            "text": f"Énoncé {stmt['code']}:{extra}",
                        },
                        {
                            "language_code": "fi",
                            "text": f"Väittämä {stmt['code']}:{extra}",
                        },
                    ],
                }
                updates.append(s_update)

            # Send Patch
            patch_resp = await api.client.patch(
                f"/api/admin/studies/{slug}", json={"statements": updates}
            )
            if patch_resp.status_code == 200:
                print(f"✓ Updated {len(updates)} statements for {slug}.")
            else:
                print(f"Failed to update {slug}: {patch_resp.text}")

    finally:
        await api.close()
    print("--- Update Complete ---")


if __name__ == "__main__":
    asyncio.run(update_statements())
