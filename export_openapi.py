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


def _normalize_binary_media_types(node):
    """Rewrite JSON-Schema-2020-12-style `contentMediaType` back to OpenAPI 3.0
    `format: binary` for compatibility with codegen tools (orval) that do not
    yet recognize the newer spec form.

    FastAPI 0.136 + Pydantic 2.13 emits `{"type": "string", "contentMediaType":
    "application/octet-stream"}` for UploadFile fields. Older orval treats this
    as a plain string, regressing the generated client (Blob -> string). The
    rewrite here keeps the wire-level spec semantically equivalent while
    preserving the client's Blob typing.
    """
    if isinstance(node, dict):
        if (
            node.get("type") == "string"
            and node.get("contentMediaType") == "application/octet-stream"
            and "format" not in node
        ):
            node.pop("contentMediaType", None)
            node["format"] = "binary"
        for value in node.values():
            _normalize_binary_media_types(value)
    elif isinstance(node, list):
        for item in node:
            _normalize_binary_media_types(item)


def main():
    schema = get_openapi(
        title=app.title,
        version=app.version,
        openapi_version=app.openapi_version,
        description=app.description,
        routes=app.routes,
    )

    _normalize_binary_media_types(schema)

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
