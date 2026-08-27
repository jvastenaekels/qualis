# Qualis backend

The backend is the FastAPI application, persistence layer, analysis engine, and
administrative/participant API for Qualis.

## Start here

- [Development workflow](../docs/contributing/development.md) — prerequisites,
  database setup, migrations, bootstrap, and local servers.
- [Backend guidelines](../docs/contributing/backend-guidelines.md) — package
  boundaries, service/repository responsibilities, typing, and error handling.
- [Testing guide](../docs/contributing/testing.md#backend-tests-pytest) — test
  structure and commands.
- [API reference](../docs/reference/api.md) — endpoints, authentication, payloads,
  errors, and rate limits.
- [Architecture explanation](../docs/explanation/architecture.md) — system context,
  state, permissions, and lifecycle rationale.

## Common commands

Run these from `src/backend/`:

```bash
uv sync --frozen
uv run uvicorn app.main:app --reload
uv run pytest tests
```

The interactive OpenAPI documentation is available from a running development
server at `http://localhost:8000/docs`.
