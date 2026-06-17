FROM python:3.13-slim

WORKDIR /app

# Runtime dependency for python-magic used by audio upload validation.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libmagic1 \
    && rm -rf /var/lib/apt/lists/*

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

# Install dependencies
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

# Copy application code
COPY . .

# F-02-006 — drop root before CMD. The `app` user owns /app so `uv run`
# can write to .venv and resolve project metadata; the system shell is
# /usr/sbin/nologin to prevent interactive escalation if a future
# attacker reaches `docker exec` privileges.
RUN groupadd --system app \
    && useradd --system --gid app --home /app --shell /usr/sbin/nologin app \
    && chown -R app:app /app
USER app

# Run migrations and seed, then start the server.
# Call the baked virtualenv directly instead of `uv run`: a bare `uv run`
# re-syncs the FULL dev environment (ruff/mypy/deptry/…) on first container
# start, because the image was built with --no-dev. That cold-start download
# took ~2-3 minutes. The venv from `uv sync --frozen --no-dev` already has every
# runtime dependency, so `.venv/bin/...` starts in seconds.
CMD ["sh", "-c", ".venv/bin/python init_db.py && .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000"]

EXPOSE 8000
