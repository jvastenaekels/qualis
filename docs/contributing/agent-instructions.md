# Libre-Q AI Agent Instructions

**Libre-Q** is an open-source Q-Methodology platform built with **Agent-First** principles. This project prioritizes strict typing, explicit contracts, and type-driven development to maximize AI productivity.

## Core Philosophy: Agent-First Development

- **Type-First:** Define Pydantic/TypeScript types and contracts *before* logic.
- **Contract-Driven:** OpenAPI schema is the single source of truth; frontend consumes generated clients.
- **Inverse TDD:** Write failing tests first to define requirements, then implement to pass.
- **No Magic:** Explicit code over implicit/dynamic patterns—LLMs struggle with metaprogramming.

## Architecture Overview

### Backend (Python/FastAPI)
- **Entry:** [backend/app/main.py](../../backend/app/main.py) — FastAPI app with middleware, exception handlers, CORS.
- **Models:** [backend/app/models/](../../backend/app/models/) — SQLAlchemy async models (Projects, Studies, Participants, Submissions); per-subdomain modules re-exported via the package `__init__.py`.
- **Schemas:** [backend/app/schemas/](../../backend/app/schemas/) — Pydantic validation schemas; all HTTP I/O uses these.
- **Services:** [backend/app/services/](../../backend/app/services/) — Business logic layer (study_service, export_service, recruitment_service).
- **Routers:** [backend/app/routers/](../../backend/app/routers/) — HTTP endpoint definitions; delegate to services.
- **Database:** PostgreSQL with Alembic migrations; use `python init_db.py` to reset locally.

**Three-tier architecture:** Routers → Services → Models. Import-linter enforces this.

### Frontend (React/TypeScript)
- **Pages:** [src/pages/](../../frontend/src/pages/) — Public study interface (Landing, Rough Sort, Fine Sort, Post-Sort, Submission).
- **Admin:** [src/components/admin/dashboard/](../../frontend/src/components/admin/dashboard/) — Research dashboard (studies, participants, analytics, exports).
- **Stores:** [src/store/](../../frontend/src/store/) — Zustand atomic stores (useConfigStore, useSessionStore, useResponseStore, useUIStore).
- **Hooks:** [src/hooks/](../../frontend/src/hooks/) — Custom logic extraction (useGridCalculations, useFineSortDrag, useSubmitStudy, etc.).
- **API:** [src/api/generated.ts](../../frontend/src/api/generated.ts) — Auto-generated Orval client; never fetch directly.
- **Styling:** Tailwind utility-first CSS; mobile-first design with `md:` and `lg:` breakpoints.

## Q-Methodology Domain Knowledge

**Critical for validation logic:**
- **Q-Grid:** Forced distribution table following a bell curve (e.g., -3 to +3, 9 slots total).
- **Ipsative Data:** Each card's position is relative to other cards in *that user's* sort.
- **Validation Rule:** A sort is invalid if any grid slot is empty or contains duplicate cards—submission is rejected until perfectly filled.
- **Workflow:** Consent → Preliminary Questions → Rough Sort (3-way bucket) → Fine Sort (grid) → Post-Sort Survey → Submission.

## Key Development Workflows

### 1. Database & Migrations
```bash
# Reset database (drops all tables, reinitializes schema)
make db-reset

# Create new migration after model change
make migration-new
# Then apply migrations automatically on startup, or run:
cd backend && uv run python scripts/migrate.py
```

### 2. Backend Feature Workflow (Architect-Builder Pattern)
1. **Define the Type:** Update [backend/app/schemas/](../../backend/app/schemas/) with Pydantic models (no `Any` types).
2. **Define the Endpoint:** Add router in [backend/app/routers/](../../backend/app/routers/) or [backend/app/routers/admin/](../../backend/app/routers/admin/).
3. **Write the Trap (Failing Test):** [backend/tests/integration/](../../backend/tests/integration/) or [backend/tests/unit/](../../backend/tests/unit/).
4. **Implement Logic:** [backend/app/services/](../../backend/app/services/) using SQLAlchemy models.
5. **Export API:** `make generate-api` to regenerate [frontend/src/api/generated.ts](../../frontend/src/api/generated.ts).

### 3. Frontend Feature Workflow
1. **Check Generated Types:** Inspect [src/api/model/](../../frontend/src/api/model/) for backend types.
2. **Define Component Type:** Explicit props interface in component file.
3. **Write Test:** Vitest unit test (`.test.tsx`) or integration test in [src/integration/](../../frontend/src/integration/).
4. **Implement:** Use generated `use[Query/Mutation]` hooks; never `fetch()` directly.
5. **Mobile-First:** Tailwind mobile first; touch targets ≥44×44px; animations non-blocking.

### 4. API Contract Verification
```bash
# After backend schema changes:
make generate-api

# Verify frontend API is in sync:
make check-api  # Fails if frontend/src/api/generated.ts is out of date
```

### 5. Quality Assurance (CI Pipeline)
```bash
# Run full CI locally before submitting PR:
make ci          # Lint, type-check, unit tests, build (no E2E)
make ci-full     # Includes database reset + Playwright E2E

# Components:
make lint        # ruff (backend), biome (frontend)
make check       # mypy, bandit, radon, deptry, vulture, tsc, i18n-check
make test        # pytest (backend), vitest (frontend)
make e2e         # playwright (study + admin flows)
```

**Golden Rule:** If `make ci` fails locally, it will fail in CI. Do not skip local verification.

## Project Conventions & Patterns

### Typing & Validation
- **Pydantic Models:** All request/response data must validate against schemas; use `model_config = ConfigDict(from_attributes=True)` for ORM to Pydantic conversion.
- **Strict Mode:** TypeScript strict mode enabled; no implicit `any`.
- **Field Defaults:** Use Pydantic `Field()` for constraints (min_length, max_length, description).

### Backend Patterns
- **Sentence Case:** Log messages and error descriptions use sentence case (e.g., "User not found in database", not "USER_NOT_FOUND").
- **Service Layer:** All business logic lives in services; routers only map HTTP request→service call→response.
- **Exception Handling:** Raise HTTPException with specific status codes; [app/middleware/errors.py](../../backend/app/middleware/errors.py) catches and logs all exceptions.
- **Database Sessions:** Use dependency injection (`get_db()` in [app/dependencies.py](../../backend/app/dependencies.py)) for async session management.

### Frontend Patterns
- **State Management:** Zustand atomic stores (not Redux); each store is independent. Avoid cross-store dependencies.
- **Generated API:** All API calls via `useMutation()` or `useQuery()` from [src/api/generated.ts](../../frontend/src/api/generated.ts); generated by `orval`.
- **Component Testing:** Use `testing-library` for user interactions; avoid testing implementation details.
- **Drag-and-Drop:** [dnd-kit](https://docs.dndkit.com/) primitives for sort interactions; custom hooks for physics (useFineSortDrag, useGridCalculations).

### Internationalization (i18n)
- **Supported:** English (en), French (fr), Finnish (fi).
- **Static UI:** i18next labels in [public/locales/](../../frontend/public/locales/).
- **Dynamic Content:** Study titles, instructions, statements fetched from backend; localized per participant.
- **Validation:** `npm run i18n-check` verifies all keys are present in all language files.

## Important Files & References

| File | Purpose |
|------|---------|
| [coding-standards.md](coding-standards.md) | Detailed Agent-First philosophy & rules. **Read this first.** |
| [prompting-strategy.md](prompting-strategy.md) | Templates for agent workflows (architect-builder, mobile-first, etc.). |
| [../explanation/architecture.md](../explanation/architecture.md) | High-level system design and data flows. |
| [openapi.json](../../openapi.json) | Auto-generated API spec; source of truth for frontend. |
| [backend/requirements.txt](../../backend/requirements.txt) | Python dependencies (FastAPI, SQLAlchemy, Pydantic, bcrypt, PyJWT). |
| [frontend/package.json](../../frontend/package.json) | JavaScript dependencies (React 19, Zustand, dnd-kit, Tailwind, Vitest, Playwright). |
| [Makefile](../../Makefile) | All build/test commands. |

## Common Pitfalls to Avoid

1. **Never fetch directly** — Use generated hooks only; Orval regeneration is automatic.
2. **No bare Any types** — Every variable must have explicit type; breaks reasoning.
3. **Avoid __getattr__ magic** — LLMs can't trace dynamic attribute access.
4. **Async SQLAlchemy** — This project uses async SQLAlchemy (`AsyncSession`) for all database interactions.
5. **Test first, not after** — Write failing test before implementation (Inverse TDD).
6. **Don't skip make ci** — Local validation is required before PRs.
7. **Mobile-first CSS** — Design for touch first, then desktop breakpoints.
8. **Preserve grid validity** — Any submission logic must enforce the forced distribution rule.

## Quick Verification

Before marking a task done:
```bash
cd /home/julien/libre-q
make ci              # Fast verification (~2-3 min)
# OR for full validation:
make ci-full         # Includes E2E (~10-15 min)
```

If any check fails, read the error and iterate—the linter/type-checker message is precise.
