"""Alembic wrapper for database migrations.

This script replaces the legacy manual migration logic with Alembic.
It ensures that the database is upgraded to the latest version.
"""

import os
import subprocess
import sys


def run_alembic_upgrade():
    """Run alembic upgrade head."""
    print("--- Running Database Migrations (Alembic) ---")

    # Ensure backend directory is in path
    backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    os.chdir(backend_dir)

    try:
        # We use 'uv run' if possible, or just 'alembic'
        # In many environments, 'alembic' should be in the path
        cmd = ["alembic", "upgrade", "head"]

        # If uv is present and we're in a uv-managed environment
        if os.path.exists("uv.lock"):
            cmd = ["uv", "run", "alembic", "upgrade", "head"]

        print(f"Executing: {' '.join(cmd)}")
        subprocess.run(cmd, check=True)
        print("✓ Database migrations completed successfully.")
    except subprocess.CalledProcessError as e:
        print(f"✗ Database migration failed with exit code {e.returncode}")
        sys.exit(e.returncode)
    except Exception as e:
        print(f"✗ An error occurred: {e}")
        sys.exit(1)


if __name__ == "__main__":
    run_alembic_upgrade()
