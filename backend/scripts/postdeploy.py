#!/usr/bin/env python3
"""Post-deployment orchestration script."""

import os
import subprocess
import sys


def run_task(script_path, description, args=None):
    """Execute a task script."""
    print(f"\n[PostDeploy] Starting: {description} ({script_path})")
    if not os.path.exists(script_path):
        print(f"[PostDeploy] Error: Script not found at {os.getcwd()}/{script_path}")
        sys.exit(1)

    try:
        # Pass current environment variables + point to internal API
        env = os.environ.copy()
        env["API_BASE_URL"] = "http://internal"
        # Ensure imports works by adding CWD to PYTHONPATH
        env["PYTHONPATH"] = os.getcwd()

        cmd = [sys.executable, script_path]
        if args:
            cmd.extend(args)

        subprocess.run(cmd, check=True, env=env)
        print(f"[PostDeploy] Success: {description}")
    except subprocess.CalledProcessError as e:
        print(f"[PostDeploy] Failed: {description}")
        sys.exit(e.returncode)


def main():
    """Execute the post-deployment sequence."""
    print("--- Open-Q Post-Deployment Sequence ---")

    # Determine base directory (backend/) relative to this script
    script_dir = os.path.dirname(os.path.abspath(__file__))  # .../backend/scripts
    backend_dir = os.path.dirname(script_dir)  # .../backend

    print(f"[PostDeploy] Script Dir: {script_dir}")
    print(f"[PostDeploy] Backend Dir: {backend_dir}")

    # Change to backend directory so scripts find their modules
    os.chdir(backend_dir)
    print(f"[PostDeploy] CWD set to: {os.getcwd()}")

    # 0. Safety Check
    db_url = os.getenv("DATABASE_URL", "")
    if not db_url or "postgresql" not in db_url.lower():
        print(
            "[PostDeploy] CRITICAL: DATABASE_URL is missing or does not use PostgreSQL."
        )
        print("[PostDeploy] Open-Q now strictly requires a PostgreSQL database.")
        sys.exit(1)

    # 1. Run Migrations (Safe to run first now)
    run_task("scripts/migrate.py", "Database Schema Migration")

    # 2. Initialize Database (Create missing tables)
    run_task("init_db.py", "Infrastructure Initialization")

    # 3. Sync Study Configuration (User Managed)
    # Automatic seeding is disabled to respect researcher-controlled environments.
    # To seed a study manually: python seed.py data/your-study.json

    print("\n--- All Tasks Completed Successfully ---")


if __name__ == "__main__":
    main()
