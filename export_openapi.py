#!/usr/bin/env python3
import json
import sys
import os

# Add backend to path
ROOT_DIR = os.getcwd()
if os.path.basename(ROOT_DIR) == 'backend':
    ROOT_DIR = os.path.dirname(ROOT_DIR)

backend_dir = os.path.join(ROOT_DIR, 'backend')
sys.path.append(backend_dir)
os.chdir(backend_dir)

from app.main import app
from fastapi.openapi.utils import get_openapi

def main():
    schema = get_openapi(
        title=app.title,
        version=app.version,
        openapi_version=app.openapi_version,
        description=app.description,
        routes=app.routes,
    )

    # Write to root openapi.json
    with open(os.path.join(ROOT_DIR, 'openapi.json'), 'w') as f:
        json.dump(schema, f, indent=2)
        f.write('\n')

    # Write to frontend openapi.json
    frontend_path = os.path.join(ROOT_DIR, 'frontend', 'openapi.json')
    with open(frontend_path, 'w') as f:
        json.dump(schema, f, indent=2)
        f.write('\n')

    print(f"OpenAPI schema exported successfully to {os.path.join(ROOT_DIR, 'openapi.json')} and {frontend_path}")

if __name__ == "__main__":
    main()
