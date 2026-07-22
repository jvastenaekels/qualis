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
        "http://localhost:3000/login",
        "bioeconomy-futures",
        "admin@example.com",
        "admin123",
        "Docker with the `docker compose` plugin",
        "GNU Make",
        "Your First Study",
    ]
    return [
        f"README.md is missing {token!r}" for token in required if token not in readme
    ]


def check_local_seed_order() -> list[str]:
    readme = _read("README.md")
    backend_index = readme.find("make run-backend")
    seed_index = readme.find("uv run python seed.py data/example-study.json")

    if backend_index == -1:
        return ["README.md is missing make run-backend in the local setup path"]
    if seed_index == -1:
        return ["README.md is missing the example seed command"]
    if seed_index < backend_index:
        return [
            "README.md documents seed.py before backend startup; seed.py requires the API"
        ]
    return []


def check_local_database_setup() -> list[str]:
    errors: list[str] = []
    for path in ("README.md", "docs/contributing/development.md"):
        source = _read(path)
        if "CREATE DATABASE qualis_dev OWNER qualis_user" not in source:
            errors.append(f"{path} does not make qualis_user the database owner")
        if "GRANT ALL PRIVILEGES ON DATABASE qualis_dev" in source:
            errors.append(
                f"{path} still documents the PostgreSQL 15-incomplete GRANT recipe"
            )
        if "SECRET_KEY=$(" in source or "IP_HASH_SALT=$(" in source:
            errors.append(
                f"{path} puts a non-executable shell expression in dotenv syntax"
            )
    return errors


def check_production_bootstrap_docs() -> list[str]:
    deployment = _read("docs/guides/deployment.md")
    production_compose = _read("docker-compose.production.yml")
    production_env = _read(".env.production.example")
    errors: list[str] = []

    if "DATABASE_URL=$SCALINGO_POSTGRESQL_URL" in deployment:
        errors.append(
            "Scalingo instructions still overwrite its managed DATABASE_URL alias"
        )
    for token in (
        "ADMIN_EMAIL",
        "ADMIN_PASSWORD",
        "docker-compose.production.yml",
        "The root `docker-compose.yml` is deliberately a **local demo**",
    ):
        if token not in deployment:
            errors.append(f"docs/guides/deployment.md is missing {token!r}")

    for token in (
        "ENVIRONMENT: production",
        "${SECRET_KEY:?",
        "${ADMIN_PASSWORD:?",
        "127.0.0.1:${QUALIS_HTTP_PORT:-3000}:80",
    ):
        if token not in production_compose:
            errors.append(f"docker-compose.production.yml is missing {token!r}")
    for unsafe in ("admin123", "docker-dev-secret", "qualis-demo-secret"):
        if unsafe in production_compose:
            errors.append(
                f"docker-compose.production.yml contains demo value {unsafe!r}"
            )

    for key in (
        "QUALIS_DB_PASSWORD",
        "SECRET_KEY",
        "IP_HASH_SALT",
        "ADMIN_EMAIL",
        "ADMIN_PASSWORD",
    ):
        if f"{key}=\n" not in production_env:
            errors.append(f".env.production.example must leave {key} empty")
    return errors


def check_tutorial_ui_labels() -> list[str]:
    tutorial = _read("docs/tutorials/your-first-study.md")
    errors: list[str] = []
    required = [
        "**New project**",
        "**Create study**",
        "**Test run**",
        "**Methodology memo**",
        "final **Interface** tab",
    ]
    errors.extend(
        f"docs/tutorials/your-first-study.md is missing {token!r}"
        for token in required
        if token not in tutorial
    )
    if "**Key:** `overall_thoughts`" in tutorial:
        errors.append("tutorial asks users to edit a field key that the UI generates")
    if "**Preview** button" in tutorial:
        errors.append("tutorial still names the Test run button Preview")
    return errors


def check_no_raw_database_url_logging() -> list[str]:
    source = _read("backend/app/main.py")
    errors: list[str] = []
    if "settings.DATABASE_URL" in source:
        errors.append(
            "backend/app/main.py still references settings.DATABASE_URL directly"
        )
    if "DATABASE_URL is" in source:
        errors.append(
            "backend/app/main.py still contains the raw DATABASE_URL log message"
        )
    return errors


def main() -> int:
    errors = [
        *check_frontend_lock_version(),
        *check_readme_demo_path(),
        *check_local_seed_order(),
        *check_local_database_setup(),
        *check_production_bootstrap_docs(),
        *check_tutorial_ui_labels(),
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
