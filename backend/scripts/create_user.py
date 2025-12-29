#!/usr/bin/env python3
"""CLI script to create a new administrative/researcher user."""

import asyncio
import getpass
import os
import sys

# Add backend directory to path so 'from app' works regardless of CWD
script_dir = os.path.dirname(os.path.abspath(__file__))  # .../backend/scripts
backend_dir = os.path.dirname(script_dir)  # .../backend
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)  # noqa: E402

from app.utils.script_utils import APIClient


async def create_user_cli():
    """Interactive CLI to create a user via Admin API."""
    print("--- Open-Q User Creation (API Mode) ---")

    api = APIClient()
    try:
        # We need to login as an existing admin to create another user
        print("Authenticating as an existing Admin/Superuser...")
        admin_email = input("Admin Email: ").strip()
        admin_password = getpass.getpass("Admin Password: ")

        await api.login(email=admin_email, password=admin_password)

        print("\nNow enter details for the NEW user:")
        new_email = input("New User Email: ").strip()
        if not new_email:
            print("Error: Email is required.")
            return

        new_password = getpass.getpass("New User Password: ")
        confirm_password = getpass.getpass("Confirm Password: ")

        if new_password != confirm_password:
            print("Error: Passwords do not match.")
            return

        is_superuser_input = input("Is Superuser? (y/N): ").strip().lower()
        is_superuser = is_superuser_input == "y"

        # Create user via API
        response = await api.client.post(
            "/api/admin/users/",
            json={
                "email": new_email,
                "password": new_password,
                "is_superuser": is_superuser,
                "is_active": True,
            },
        )

        if response.status_code == 201:
            print(f"Successfully created user: {new_email} (Superuser: {is_superuser})")
        else:
            print(f"Failed to create user: {response.text}")

    finally:
        await api.close()


if __name__ == "__main__":
    try:
        asyncio.run(create_user_cli())
    except KeyboardInterrupt:
        print("\nAborted.")
        sys.exit(0)
