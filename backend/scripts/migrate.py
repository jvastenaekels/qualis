"""Alembic wrapper for database migrations.

This script replaces the legacy manual migration logic with Alembic.
It ensures that the database is upgraded to the latest version.
"""

import os
import sys


def run_alembic_upgrade():
    """Run alembic upgrade head."""
    print("--- Running Database Migrations (Alembic) ---")

    try:
        from alembic.config import Config
        from alembic import command

        # Ensure backend directory is in path and CWD (for alembic.ini)
        backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        os.chdir(backend_dir)

        alembic_cfg = Config("alembic.ini")
        command.upgrade(alembic_cfg, "head")

        print("✓ Database migrations completed successfully.")
    except Exception as e:
        print(f"✗ An error occurred: {e}")
        sys.exit(1)


if __name__ == "__main__":
    run_alembic_upgrade()
