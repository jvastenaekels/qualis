"""API Client utilities for administrative scripts."""

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
        """Authenticate and store the JWT token."""
        email = email or os.getenv("ADMIN_EMAIL", "admin@example.com")
        password = password or os.getenv("ADMIN_PASSWORD", "admin123")

        response = await self.client.post(
            "/api/token", data={"username": email, "password": password}
        )

        if response.status_code != 200:
            raise Exception(f"Login failed: {response.text}")

        data = response.json()
        self.token = data["access_token"]
        self.client.headers.update({"Authorization": f"Bearer {self.token}"})
        print(f"Logged in as {email}")

    async def close(self):
        """Close the underlying HTTPX client."""
        await self.client.aclose()

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
