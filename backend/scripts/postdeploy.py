
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
    
    # Determine base directory (backend/) relative to this script
    script_dir = os.path.dirname(os.path.abspath(__file__)) # .../backend/scripts
    backend_dir = os.path.dirname(script_dir) # .../backend
    
    print(f"Working Directory: {os.getcwd()}")
    print(f"Backend Directory: {backend_dir}")
    
    # Change to backend directory so scripts find their modules
    os.chdir(backend_dir)
    
    # 1. Ensure Database Schema (Migrations)
    run_task("scripts/ensure_schema.py", "Schema Verification")
    
    # 2. Update Study Configuration (Data)
    if os.path.exists("data/example-study.json"):
        run_task("update_study.py", "Study Data Update")
    else:
        print("[PostDeploy] Skipping Update: data/example-study.json not found.")

    print("\n--- All Tasks Completed Successfully ---")

if __name__ == "__main__":
    main()
