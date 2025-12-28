#!/usr/bin/env python3
"""CLI script to create a new administrative/researcher user."""

import asyncio
import getpass
import sys

from sqlalchemy import select

from app.database import SessionLocal
from app.models import User
from app.utils.security import get_password_hash


async def create_user_cli():
    """Interactive CLI to create a user."""
    print("--- Open-Q User Creation ---")
    email = input("Email: ").strip()
    if not email:
        print("Error: Email is required.")
        return

    password = getpass.getpass("Password: ")
    confirm_password = getpass.getpass("Confirm Password: ")

    if password != confirm_password:
        print("Error: Passwords do not match.")
        return

    if len(password) < 8:
        print("Error: Password must be at least 8 characters.")
        return

    async with SessionLocal() as session:
        # Check if user exists
        result = await session.execute(select(User).filter(User.email == email))
        existing_user = result.scalars().first()
        if existing_user:
            print(f"Error: User {email} already exists.")
            return

        is_superuser_input = input("Is Superuser? (y/N): ").strip().lower()
        is_superuser = is_superuser_input == "y"

        # Create user
        new_user = User(
            email=email,
            hashed_password=get_password_hash(password),
            is_active=True,
            is_superuser=is_superuser,
        )
        session.add(new_user)
        await session.commit()
        print(f"Successfully created user: {email} (Superuser: {is_superuser})")


if __name__ == "__main__":
    try:
        asyncio.run(create_user_cli())
    except KeyboardInterrupt:
        print("\nAborted.")
        sys.exit(0)
