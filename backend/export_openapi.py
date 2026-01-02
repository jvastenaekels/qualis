import json
import sys
from pathlib import Path

# Add backend dir to sys.path
sys.path.append(str(Path(__file__).parent))

from app.main import app

def export_openapi():
    openapi_data = app.openapi()
    print(json.dumps(openapi_data, indent=2))

if __name__ == "__main__":
    export_openapi()
