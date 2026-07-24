# syntax=docker/dockerfile:1.7
FROM python:3.13-slim

WORKDIR /app

# UV_COMPILE_BYTECODE bakes the .pyc files for every dependency at build time,
# so the first request doesn't pay for compiling them. UV_LINK_MODE=copy is
# required because the uv cache lives on a BuildKit cache mount (a different
# filesystem), where hardlinking would fail and emit a warning on every build.
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_CACHE_DIR=/cache/uv \
    PYTHONUNBUFFERED=1

# Runtime dependency for python-magic used by audio upload validation.
RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive \
        apt-get install -y --no-install-recommends libmagic1 \
    && rm -rf /var/lib/apt/lists/*

# Install uv. The version is pinned deliberately: with `:latest` this layer —
# and therefore every layer below it, including the dependency sync — is
# invalidated whenever upstream publishes a release, turning an unrelated
# rebuild into a full dependency re-download.
COPY --from=ghcr.io/astral-sh/uv:0.11.32 /uv /usr/local/bin/uv

# F-02-006 — drop root before anything writes to /app, so no later layer has to
# `chown -R` the tree. A recursive chown after COPY duplicates every file it
# touches (the venv included) into a new layer, inflating both build time and
# image size. Fixed UID/GID so the BuildKit cache mount below can be owned by
# this user.
RUN groupadd --system --gid 1001 app \
    && useradd --system --uid 1001 --gid app --home /app --shell /usr/sbin/nologin app \
    && chown app:app /app \
    && mkdir -p /cache/uv \
    && chown -R app:app /cache
USER app

# Install dependencies. The cache mount keeps uv's download/build cache across
# builds, so a lockfile change re-resolves without re-downloading the world.
COPY --chown=app:app pyproject.toml uv.lock ./
RUN --mount=type=cache,target=/cache/uv,uid=1001,gid=1001 \
    uv sync --frozen --no-dev

# Copy application code
COPY --chown=app:app . .

# Pre-compile the application package too (UV_COMPILE_BYTECODE only covers the
# venv), keeping first-request latency off the critical path.
RUN .venv/bin/python -m compileall -q app

# Run migrations and seed, then start the server.
# Call the baked virtualenv directly instead of `uv run`: a bare `uv run`
# re-syncs the FULL dev environment (ruff/mypy/deptry/…) on first container
# start, because the image was built with --no-dev. That cold-start download
# took ~2-3 minutes. The venv from `uv sync --frozen --no-dev` already has every
# runtime dependency, so `.venv/bin/...` starts in seconds.
CMD ["sh", "-c", ".venv/bin/python init_db.py && .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000"]

EXPOSE 8000
