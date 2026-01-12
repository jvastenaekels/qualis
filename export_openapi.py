#!/usr/bin/env python3
import json
import sys
import os

# Add backend to path
ROOT_DIR = os.getcwd()
if os.path.basename(ROOT_DIR) == 'backend':
    ROOT_DIR = os.path.dirname(ROOT_DIR)

sys.path.append(os.path.join(ROOT_DIR, 'backend'))
os.chdir(ROOT_DIR)

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
    with open('openapi.json', 'w') as f:
        json.dump(schema, f, indent=2)
        f.write('\n')

    # Write to frontend openapi.json
    with open('frontend/openapi.json', 'w') as f:
        json.dump(schema, f, indent=2)
        f.write('\n')

    print("OpenAPI schema exported successfully to openapi.json and frontend/openapi.json")

if __name__ == "__main__":
    main()
