# Libre-Q

Open-source platform for conducting Q-methodology research. Monorepo with a FastAPI backend and React frontend.

## Tech Stack

- **Backend:** Python 3.13, FastAPI, SQLAlchemy (async), PostgreSQL, Alembic, Pydantic
- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS, Radix UI, dnd-kit, react-hook-form, Zustand, react-i18next
- **Tooling:** uv (Python), npm (Node 24), Biome (lint/format), Ruff (Python lint/format), Vitest, Playwright

## Project Structure

```
backend/        # FastAPI app
  app/          # Application code (models, schemas, services, routers)
  tests/        # Unit + integration tests (pytest)
frontend/       # React SPA
  src/           # Components, pages, hooks, store, api
  public/locales/  # i18n translation files (en, fr, fi)
```

## Key Commands (from project root)

```bash
make install          # Install all dependencies
make ci               # Full local CI: lint + check + test + build (run before pushing)
make lint             # Linting only (backend + frontend)
make check            # Type checking, security, dead code, API sync, i18n
make test             # Unit tests (backend + frontend)
make e2e              # End-to-end tests (Playwright)
make generate-api     # Regenerate frontend API client from OpenAPI spec
make migrate          # Run database migrations
make migration-new    # Create a new Alembic migration
```

## Python environment rules
- This project uses a virtual environment strictly located in the `.venv` directory.
- Never use the global system Python.
- To execute code or install dependencies, always use explicit paths pointing to the virtual environment (for example: `.venv/bin/python` or `.venv/bin/pip`).

## Coding Standards

### General
- No `any` in TypeScript — use `unknown` or specific types. Use `// biome-ignore` only when truly necessary.
- No non-null assertions (`!`) — handle null values explicitly.
- Run `npm run lint:fix` (frontend) or `uv run ruff format` (backend) to auto-fix formatting.

### Internationalization
- All user-facing strings must use `useTranslation()` / `t()` with a key and English fallback: `t('key', 'Fallback')`
- Three locales: `en`, `fr`, `fi` — keep all translation files in sync
- Run `npm run i18n-check` to verify key parity

### Testing
- Backend: pytest with async fixtures. Mocks must include all methods used by the code under test.
- Frontend: Vitest with `renderWithStore` helper. Use `waitFor` for async state assertions.
- Use `make ci` as the quality gate — never push if it fails.

### Database Migrations (Alembic)
- Generate: `make migration-new` (auto-generates from model changes)
- **Always review generated migrations** — auto-generation against a blank or out-of-sync DB will include unrelated tables. The migration must only contain the intended schema change.
- Migrations run automatically on deploy via `Procfile` release phase (`python scripts/migrate.py`)
- Migration chain (15 migrations as of 2026-04-25, head `c94f0b41532e`):
  `initial_schema` → `rename_randomize_statements_to_randomize_statement_order`
  → `remove_consent_buttons` → `add_pre_instruction`
  → `add_is_test_run_to_participants` → `add_audio_recordings_table`
  → `add_display_order_to_statements`
  → `add_last_step_reached_to_participants` → `fix_last_step_reached_backfill`
  → `add_draft_responses_to_participants` → `add_resume_code_to_participants`
  → `add_concourse_tables` → `add_concourse_traceability_columns`
  → `add_item_versions_and_comments` → `rename_workspace_to_project`
  → `add_analysis_runs_table`
- Run `alembic history` (in `backend/`) for the canonical chain — this list will drift if not updated when new migrations are added.
- PostgreSQL DDL is transactional: a failed migration rolls back entirely, leaving `alembic_version` unchanged

### API Changes
- After modifying backend schemas/routes, run `make generate-api` to regenerate the frontend client
- Run `make check-api` to verify the generated client is committed and up to date
