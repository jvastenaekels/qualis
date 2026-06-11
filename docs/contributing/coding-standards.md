# Qualis Coding Standards

Cross-cutting rules that apply to every contribution. Backend- and frontend-specific patterns live in [`backend-guidelines.md`](backend-guidelines.md) and [`frontend-guidelines.md`](frontend-guidelines.md). For the documentation taxonomy (Diátaxis quadrants), see [`../README.md`](../README.md).

## 1. Type-driven, contract-first

Define the shape of data before writing logic.

- **Pydantic schemas** (backend) and **TypeScript types** (frontend) are not afterthoughts; they pin the contract.
- The frontend never hand-writes API calls. The OpenAPI schema generated from the backend is the single source of truth, and the frontend consumes the regenerated client (`make generate-api`).
- Most backend modules are under `mypy --strict` (see the strict-modules list in [`CLAUDE.md`](../../CLAUDE.md)). New utilities should opt in.
- TypeScript: no `any`. Use `unknown` and narrow, or write the right type.

## 2. Test-first

Write a failing test before the implementation. The test fixes the intent and the "definition of done" before any code is generated.

- **Frontend**: Vitest for hooks and pure logic; testing-library for component interactions. Test behaviour, not implementation details.
- **Backend**: pytest with `conftest.py` fixtures. Each database test gets a freshly recreated schema (the `db` fixture drops and recreates the `public` schema around every test), so tests are isolated from one another even though committed data is not rolled back.
- **E2E**: Playwright for critical happy paths only — execution is slow.

See [`testing.md`](testing.md) for the test stack and conventions.

## 3. No magic

- No `__getattr__` / `__setattr__` / dynamic class generation in Python.
- No `as` casts in TypeScript except at clearly-marked external boundaries.
- No implicit cross-module state. Imports are explicit; dependencies are passed in.
- Logic lives in `services/` (backend) and in colocated `use…` hooks (frontend), not in routers or page components.

## 4. Quality gate

`make ci` is the gate. Run it locally before pushing.

| Layer | Tool |
| ----- | ---- |
| Lint | Ruff (backend), Biome (frontend) |
| Types | mypy (backend), tsc (frontend) |
| Security / dead code | bandit, deptry, vulture (backend) |
| Unit tests | pytest, Vitest |
| Build | Frontend production build |

`make ci-fast` (~30–90 s) is the inner-loop equivalent. `make ci-fast` is a fast SUBSET of `make ci` — it skips bandit, radon, vulture, pip-audit, deptry, schema/relationship/API/i18n checks, the build, integration tests, and E2E. A green `ci-fast` does NOT guarantee a green CI; run the full `make ci` before pushing.

## 5. Q-methodology invariants

A handful of domain rules must hold in every change that touches the participant flow or the analytical pipeline. Background and rationale: [`../explanation/q-methodology.md`](../explanation/q-methodology.md).

- **Forced distribution.** A submitted Q-sort must fill every grid slot with exactly one card. Never accept a partial sort.
- **Stage order.** Consent → Presort → Rough Sort → Fine Sort → Postsort → Submission. Never let a participant skip a stage.
- **Statement immutability after activation.** Once a study is Active, do not add or remove statements; that would invalidate cross-participant comparison.

## 6. Style

- US English in code, comments, commit messages, and docs.
- Sentence case in log messages and error descriptions.
- Mobile-first CSS: design for touch, then desktop breakpoints.
- A code change that affects user-visible behaviour or developer-visible API must be accompanied by a doc update in the right Diataxis quadrant.

## 7. Conventional checklist before opening a PR

- `make ci` passes.
- New user-facing strings use `t('key', 'Fallback')` and exist in every locale's `participant.json` or `admin.json` (depending on which namespace the key lives in). `npm run i18n-check` passes.
- Backend route or schema changes are followed by `make generate-api`; the regenerated client is committed.
- New database columns ship with a reviewed Alembic migration (`make migration-new`).
- New tests cover the behaviour. Non-trivial code without a test is a blocker.
