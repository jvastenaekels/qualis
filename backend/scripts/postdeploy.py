"""Post-deployment orchestration script."""

import os
import subprocess
import sys


def run_task(script_path, description, args=None):
    """Execute a task script."""
    print(f"\n[PostDeploy] Starting: {description} ({script_path})")
    if not os.path.exists(script_path):
        print(f"[PostDeploy] Error: Script not found at {script_path}")
        sys.exit(1)

    try:
        # Pass current environment variables + point to internal API
        # this allows scripts to run correctly during Scalingo release phase
        env = os.environ.copy()
        env["API_BASE_URL"] = "http://internal"

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

    # Change to backend directory so scripts find their modules
    os.chdir(backend_dir)

    # 1. Initialize Database (Idempotent: Creates tables and initial admin if missing)
    run_task("init_db.py", "Infrastructure Initialization")

    # 2. Ensure Database Schema (Legacy/Manual Migrations)
    run_task("scripts/ensure_schema.py", "Schema Verification (Legacy)")
    run_task("scripts/migrate_001_add_ui_labels.py", "Migration 001: UI Labels")

    # 3. Sync Study Configuration (Idempotent: Create or Update)
    if os.path.exists("data/example-study.json"):
        run_task(
            "seed.py",
            "Study Configuration Sync",
            ["data/example-study.json"],
        )
    else:
        print("[PostDeploy] Skipping Study Tasks: data/example-study.json not found.")

    print("\n--- All Tasks Completed Successfully ---")


if __name__ == "__main__":
    main()
