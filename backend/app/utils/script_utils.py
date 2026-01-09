"""API Client utilities for administrative scripts."""

import json
import os
from typing import Any

import httpx


class APIClient:
    """Helper to interact with the Open-Q Admin API."""

    def __init__(
        self, base_url: str | None = None, client: httpx.AsyncClient | None = None
    ):
        """Initialize the API client."""
        self.base_url = base_url or os.getenv("API_BASE_URL", "http://localhost:8000")
        self.token = None

        if client:
            self.client = client
        elif self.base_url == "http://internal":
            from httpx import ASGITransport

            from app.main import app

            # For internal dev/test/deploy, we bypass the need for a running server
            self.client = httpx.AsyncClient(
                transport=ASGITransport(app=app),
                base_url="http://internal",
                timeout=60.0,
            )
        else:
            self.client = httpx.AsyncClient(base_url=str(self.base_url), timeout=30.0)

    async def login(self, email: str | None = None, password: str | None = None):
        """Authenticate and store the JWT token. Automatically fetches workspace context."""
        email = email or os.getenv("ADMIN_EMAIL", "admin@example.com")
        password = password or os.getenv("ADMIN_PASSWORD", "admin123")

        print(f"DEBUG: Attempting login for {email}...")
        response = await self.client.post(
            "/api/token", data={"username": email, "password": password}
        )
        print(f"DEBUG: Login response status: {response.status_code}")

        if response.status_code != 200:
            raise Exception(f"Login failed: {response.text}")

        data = response.json()
        self.token = data["access_token"]
        self.client.headers.update({"Authorization": f"Bearer {self.token}"})
        print(f"Logged in as {email}")

        # Fetch workspaces to set X-Workspace-ID header automatically
        print("DEBUG: Fetching workspaces for context...")
        ws_response = await self.client.get("/api/admin/workspaces/")
        if ws_response.status_code == 200:
            workspaces = ws_response.json()
            if workspaces and len(workspaces) > 0:
                # Use the first workspace as default
                first_ws_id = workspaces[0]["id"]
                self.client.headers.update({"X-Workspace-ID": str(first_ws_id)})
                print(f"DEBUG: Set X-Workspace-ID to {first_ws_id}")
            else:
                print("DEBUG: No workspaces found for this user.")
        else:
            print(f"DEBUG: Failed to fetch workspaces: {ws_response.text}")

    async def close(self):
        """Close the underlying HTTPX client."""
        await self.client.aclose()

    async def get_study(self, slug: str) -> dict[str, Any] | None:
        """Fetch study details by slug. Returns None if not found."""
        response = await self.client.get(f"/api/admin/studies/{slug}")
        if response.status_code == 200:
            return response.json()  # type: ignore
        if response.status_code == 404:
            return None
        raise Exception(f"Failed to fetch study {slug}: {response.text}")

    async def create_study(self, data: dict[str, Any]) -> dict[str, Any]:
        """Create a new study."""
        response = await self.client.post("/api/admin/studies/", json=data)
        if response.status_code != 201:
            raise Exception(f"Failed to create study: {response.text}")
        return response.json()  # type: ignore

    async def update_study(self, slug: str, data: dict[str, Any]) -> dict[str, Any]:
        """Update an existing study."""
        response = await self.client.patch(f"/api/admin/studies/{slug}", json=data)
        if response.status_code != 200:
            raise Exception(f"Failed to update study {slug}: {response.text}")
        return response.json()  # type: ignore

    async def set_study_state(self, slug: str, state: str) -> dict[str, Any]:
        """Change the state of a study."""
        response = await self.client.post(
            f"/api/admin/studies/{slug}/state", params={"new_state": state}
        )
        if response.status_code != 200:
            raise Exception(f"Failed to set state for study {slug}: {response.text}")
        return response.json()  # type: ignore

    @staticmethod
    def transform_study_data(data: dict[str, Any]) -> dict[str, Any]:
        """Transform JSON study data to match API StudyCreate/Update schemas."""
        # JSON has translations as a dict, API expects a list
        if "translations" in data and isinstance(data["translations"], dict):
            trans_list = []
            for lang, t_data in data["translations"].items():
                t_data["language_code"] = lang
                trans_list.append(t_data)
            data["translations"] = trans_list

        # JSON has statements as a list with nested translations dict
        if "statements" in data and isinstance(data["statements"], list):
            for stmt in data["statements"]:
                if "translations" in stmt and isinstance(stmt["translations"], dict):
                    st_list = []
                    for lang, text in stmt["translations"].items():
                        st_list.append({"language_code": lang, "text": text})
                    stmt["translations"] = st_list

        return data


async def sync_study_from_file(json_path: str):
    """Idempotent sync of study data from JSON file.

    Handles creation if missing, or update if existing.
    If updating, handles 'Safe Update' by temporarily switching to Draft.
    """
    if not os.path.exists(json_path):
        print(f"Error: File {json_path} not found.")
        return

    with open(json_path, encoding="utf-8") as f:
        raw_data = json.load(f)

    api = APIClient()
    try:
        print("DEBUG: Calling api.login()...")
        await api.login()
        print("DEBUG: api.login() successful")

        # 1. Transform data
        data = api.transform_study_data(raw_data)
        slug = data["slug"]

        # 2. Check if study exists
        print(f"Checking existence of study '{slug}'...")
        existing_study = await api.get_study(slug)

        if not existing_study:
            # CREATE
            print(f"Study '{slug}' not found. Creating...")
            await api.create_study(data)
            print(f"Successfully created study: {slug}")
        else:
            # UPDATE
            print(
                f"Study '{slug}' found (State: {existing_study['state']}). Updating..."
            )

            original_state = existing_study["state"]
            needs_state_restoration = False

            # If active/closed/paused, switch to DRAFT to allow structural updates
            # (Note: API blocks grid_config updates unless in DRAFT)
            if original_state != "draft":
                print("Switching study to 'draft' for safe update...")
                await api.set_study_state(slug, "draft")
                needs_state_restoration = True

            try:
                await api.update_study(slug, data)
                print(f"Successfully updated study: {slug}")
            except Exception as e:
                print(f"Update failed: {e}")
                # We still try to restore state if needed
                raise e
            finally:
                if needs_state_restoration:
                    print(f"Restoring study state to '{original_state}'...")
                    await api.set_study_state(slug, original_state)

    finally:
        await api.close()
