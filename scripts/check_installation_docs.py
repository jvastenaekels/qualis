#!/usr/bin/env python3
"""Check that installation docs and package metadata stay coherent."""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def _read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def check_frontend_lock_version() -> list[str]:
    package = json.loads(_read("frontend/package.json"))
    lock = json.loads(_read("frontend/package-lock.json"))
    errors: list[str] = []

    package_version = package["version"]
    lock_version = lock["version"]
    root_lock_version = lock["packages"][""]["version"]

    if lock_version != package_version:
        errors.append(
            f"frontend/package-lock.json version {lock_version!r} does not match "
            f"frontend/package.json {package_version!r}"
        )
    if root_lock_version != package_version:
        errors.append(
            f"frontend/package-lock.json packages[''].version {root_lock_version!r} "
            f"does not match frontend/package.json {package_version!r}"
        )

    return errors


def check_readme_demo_path() -> list[str]:
    readme = _read("README.md")
    required = [
        "make demo-up",
        "make demo-seed",
        "make demo-smoke",
        "http://localhost:3000",
        "hemp-bioeconomy-futures",
        "admin@example.com",
        "admin123",
    ]
    return [f"README.md is missing {token!r}" for token in required if token not in readme]


def check_local_seed_order() -> list[str]:
    readme = _read("README.md")
    backend_index = readme.find("make run-backend")
    seed_index = readme.find("uv run python seed.py data/example-study.json")

    if backend_index == -1:
        return ["README.md is missing make run-backend in the local setup path"]
    if seed_index == -1:
        return ["README.md is missing the example seed command"]
    if seed_index < backend_index:
        return ["README.md documents seed.py before backend startup; seed.py requires the API"]
    return []


def check_no_raw_database_url_logging() -> list[str]:
    source = _read("backend/app/main.py")
    errors: list[str] = []
    if "settings.DATABASE_URL" in source:
        errors.append("backend/app/main.py still references settings.DATABASE_URL directly")
    if "DATABASE_URL is" in source:
        errors.append("backend/app/main.py still contains the raw DATABASE_URL log message")
    return errors


def main() -> int:
    errors = [
        *check_frontend_lock_version(),
        *check_readme_demo_path(),
        *check_local_seed_order(),
        *check_no_raw_database_url_logging(),
    ]
    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        return 1

    print("Installation docs are coherent.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
