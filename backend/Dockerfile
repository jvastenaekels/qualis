FROM python:3.13-slim

WORKDIR /app

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

# Install dependencies
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

# Copy application code
COPY . .

# Run migrations and seed, then start the server
CMD ["sh", "-c", "uv run python init_db.py && uv run uvicorn app.main:app --host 0.0.0.0 --port 8000"]

EXPOSE 8000
