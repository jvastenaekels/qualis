# Open-Q Project Memory

## Project Structure
- FastAPI backend (`backend/`) + React/Vite frontend (`frontend/`)
- SQLAlchemy async with PostgreSQL, Alembic migrations
- Pydantic schemas with `from_attributes=True` for ORM serialization
- Orval for auto-generating TypeScript API client from OpenAPI spec

## Key Patterns
- **lazy="raise"** is the recommended strategy for back-references and relationships only accessed via explicit `selectinload()` in queries
- **lazy="selectin"** kept only on relationships accessed by Pydantic `from_attributes=True` serialization (Study.translations, Study.statements, etc.)
- When changing relationship loading strategy, check Pydantic schema nesting (e.g. `StudyRead.workspace: WorkspaceRead` cascades into `Workspace.members`)
- `WorkspaceBrief` (no members) is used in `StudyRead.workspace` to avoid cascade
- `WorkspaceRead` (with members) is used only in workspace-specific endpoints with explicit `selectinload`

## CI Pipeline (`make ci`)
- Order: lint → check → test → build
- `check` includes: mypy, bandit, radon, deptry, vulture, pip-audit, schema validation, `check_relationships.py`, `check-api` (regenerates + git diff), frontend type-check, i18n-check
- `check-api` regenerates API types and verifies they match committed versions — must regenerate when schemas change
- `check_relationships.py` validates all SQLAlchemy relationships use async-safe strategies (selectin, raise, joined, subquery, noload)
- After schema changes: run `make generate-api` then include generated files in commit

## Frontend Test Notes
- PostSortPage.test.tsx, useSubmitStudy.test.ts, AudioRecorder.test.tsx have pre-existing failures (mock/DOM API issues)
- These are not backend-related

## Gotchas
- `ruff format` must pass before CI continues (run after editing Python files)
- `db.refresh()` doesn't support `selectinload` options — re-query instead
- When using `selectinload` with tuple queries (select(A, B)), use `.unique()` on results
