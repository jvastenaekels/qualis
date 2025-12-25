
import subprocess
import sys
import os

def run_task(script_path, description):
    print(f"\n[PostDeploy] Starting: {description} ({script_path})")
    if not os.path.exists(script_path):
        print(f"[PostDeploy] Error: Script not found at {script_path}")
        # We don't exit, we try next? Or strict? 
        # Strict is better for consistency.
        sys.exit(1)
        
    try:
        # Pass current environment variables
        subprocess.run([sys.executable, script_path], check=True, env=os.environ)
        print(f"[PostDeploy] Success: {description}")
    except subprocess.CalledProcessError as e:
        print(f"[PostDeploy] Failed: {description}")
        sys.exit(e.returncode)

def main():
    print("--- Open-Q Post-Deployment Sequence ---")
    current_dir = os.getcwd()
    print(f"Working Directory: {current_dir}")
    
    # 1. Ensure Database Schema (Migrations)
    # Location: scripts/ensure_schema.py (relative to backend/)
    run_task("scripts/ensure_schema.py", "Schema Verification")
    
    # 2. Update Study Configuration (Data)
    # Location: update_study.py (relative to backend/)
    # Only run if example-study.json exists (it should)
    if os.path.exists("data/example-study.json"):
        run_task("update_study.py", "Study Data Update")
    else:
        print("[PostDeploy] Skipping Update: data/example-study.json not found.")

    print("\n--- All Tasks Completed Successfully ---")

if __name__ == "__main__":
    main()
