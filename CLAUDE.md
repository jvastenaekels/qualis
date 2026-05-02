# Qualis

Open-source platform for conducting Q-methodology research. Monorepo with a FastAPI backend and React frontend.

## Tech Stack

- **Backend:** Python 3.13, FastAPI, SQLAlchemy (async), PostgreSQL, Alembic, Pydantic
- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS, Radix UI, dnd-kit, react-hook-form, Zustand, react-i18next
- **Tooling:** uv (Python), npm (Node 24), Biome (lint/format), Ruff (Python lint/format), Vitest, Playwright

## Project Structure

```
backend/        # FastAPI app
  app/          # Application code (models, schemas, services, routers)
    models/     # Per-subdomain package (Phase 5D): base.py, user.py, project.py,
                #   study.py, participant.py, recruitment.py, concourse.py, analysis.py
                #   __init__.py re-exports all names for back-compat
  tests/        # Unit + integration tests (pytest)
frontend/       # React SPA
  src/           # Components, pages, hooks, store, api
  public/locales/  # i18n translation files (en, fr, fi)
```

## Key Commands (from project root)

```bash
make install          # Install all dependencies
make ci-fast          # Tight feedback loop: lint + types + unit tests (~30-90s)
make ci               # Full local CI: lint + check + test + build (run before pushing)
make lint             # Linting only (backend + frontend)
make check            # Type checking, security, dead code, API sync, i18n
make test             # Unit tests (backend + frontend)
make e2e              # End-to-end tests (Playwright)
make generate-api     # Regenerate frontend API client from OpenAPI spec
make migrate          # Run database migrations
make migration-new    # Create a new Alembic migration
```

**Inner-loop discipline:** `make ci-fast` between every change (~38s wall-clock).
`make ci` before push (~3-5min). E2E only when touching admin-flow code.

## Python environment rules
- This project uses a virtual environment strictly located in the `.venv` directory.
- Never use the global system Python.
- To execute code or install dependencies, always use explicit paths pointing to the virtual environment (for example: `.venv/bin/python` or `.venv/bin/pip`).

## Coding Standards

### General
- No `any` in TypeScript — use `unknown` or specific types. Use `// biome-ignore` only when truly necessary.
- No non-null assertions (`!`) — handle null values explicitly.
- Run `npm run lint:fix` (frontend) or `uv run ruff format` (backend) to auto-fix formatting.

### Strict-typed Python modules

The following backend modules are under `mypy --strict` (see `[[tool.mypy.overrides]]` in `backend/pyproject.toml`). When you add a new utility/leaf module, opt into the same bar by adding it to the overrides list:

**Full strict (disallow_any_explicit + disallow_untyped_defs + warn_return_any + strict_equality):**
- `app.utils.security`, `app.utils.audit`, `app.resume_codes`
- `app.exceptions`, `app.limiter`, `app.utils.crypto`, `app.utils.email`, `app.utils.script_utils`
- `app.services.storage_service` — boto3 stubs now ship; AudioUploadMetadata TypedDict eliminates Any
- `app.services.concourse_service` — ORM stub propagation resolved by models.py fix (wave 3b)
- `app.services.recruitment_service` — ORM stub propagation resolved by models.py fix (wave 3b)
- `app.services.analysis_service` — wave 3b: AnalysisRunResult, FactorCharacteristicDict, StatementClassEntry TypedDicts; wave 4: build_sort_matrix now typed SortDataDump|StudyDump → list[SortParticipantRecord], list[StatementDumpRecord]
- `app.services.study_defaults` — wave 3b post-mortem: TranslationDefaults TypedDict replaces dict[str, Any]
- `app.services.study_data_service` — wave 3b post-mortem: StudyDump, SortDataDump, StudyStats TypedDicts
- `app.services.export_service` — wave 3b post-mortem: _AudioMapEntry TypedDict; presort/postsort config helpers keep dict[str, Any] (type: ignore[explicit-any], open-ended schema)
- `app.types.wire`, `app.types` — new package: shared TypedDict wire shapes (Clusters 2-4)
- `app.routers.audio` — wave 4 batch 1: 3 return types added
- `app.routers.admin.recruitment` — wave 4 batch 1: List[T] → list[T], 3 return types
- `app.routers.admin.users` — wave 4 batch 1: cast(PaginatedResponse[UserRead], …) aligns mypy with FastAPI serialisation
- `app.routers.admin.analysis` — wave 4 batch 2: _get_analysis_dump returns SortDataDump; _get_statement_text typed StatementDumpRecord; typing.Any removed entirely
- `app.services.memo_service` — phase 5 memo subsystem

**Strict without disallow_any_explicit** (Pydantic/SQLAlchemy stubs or load-bearing Any at JSON boundaries):
- `app.core.config` — pydantic-settings BaseSettings stubs
- `app.middleware.security`, `app.middleware.errors`, `app.middleware.spa`
- `app.database`, `app.schema_validation`
- All `app.schemas.*` modules (10 modules) — Pydantic v2 BaseModel stubs
- `app.models` (package) — remaining dict[str, Any] columns are load-bearing JSON blobs (presort_config, presort_answers, analysis result) at the ORM/JSON boundary; the override covers all sub-modules (user, project, study, participant, recruitment, concourse, analysis)
- `app.dependencies` — wave 4: Callable[…, Coroutine[Any,Any,T]] factory deps; Coroutine yield/send are always Any
- `app.routers.logs` — wave 4 batch 1: LogEntry.context is dict[str, Any] (open-ended frontend error data)
- `app.routers.admin.lifecycle` — wave 4 batch 1: Pydantic BaseModel classes in router (DataInventory etc.)
- `app.routers.admin.invitations` — wave 4 batch 1: InvitationAccept Pydantic model; get_db import corrected
- `app.routers.test` — wave 4 batch 1: 4 Pydantic model classes; 6 return types added
- `app.routers.admin.studies_participants` — wave 4 batch 3: cast(PaginatedResponse[ParticipantRead]) + None x3
- `app.routers.participants` — wave 4 batch 3: cast(ConsentResponse, …) for the StudyService.record_consent proxy result
- `app.routers.submissions` — wave 4 batch 3: dict[str, Any] x2 for service-derived submission/study payloads
- `app.routers.auth` — wave 4 batch 3: 8 return types; no casts needed (utils/security is fully strict)
- `app.routers.admin.studies` — wave 4 batch 3: list[StaleStatementEntry] from concourse_service TypedDict
- `app.routers.admin.concourses` — wave 4 batch 3: 15 return types (ORM models serialised via response_model)
- `app.routers.admin.exports` — wave 4 batch 3: StreamingResponse x6 + dict[str, Any] x2 for dump endpoints
- `app.routers.admin.projects` — wave 4 batch 3: PaginatedResponse[ProjectWithRole|ProjectMemberRead] casts
- `app.routers.admin.studies_import_export` — wave 4 batch 3: ValidationResult/StudyImportResponse + JSONResponse for export
- `app.services.submission_service` — services round batch 1: 3 dict[str, Any] payloads at JSON boundary
- `app.services.study_service` — services round batch 2: 8 backward-compat *args/**kwargs proxy methods kept as Any → Any (deliberate; narrowing requires duplicating each proxy with the underlying signature)
- `app.routers.admin.memos` — phase 5 memo subsystem
- `app.schemas.memos` — phase 5 memo subsystem (Pydantic BaseModel)
- `app.services.email_token_consume_service` — v0.6.0 auth email flows: single-use JTI denylist (no Any at ORM boundary)
- `app.services.email_otp_service` — v0.6.0 auth email flows: 2FA email OTP issue/verify (no Any)
- `app.middleware.log_scrub` — v0.6.0 auth email flows: regex scrubber + logging.Filter (pure stdlib, no Any)

Total: 65 modules under strict overrides (Phase 3 wave 4 + services round complete); +3 from phase 5 (memo subsystem); +3 from v0.6.0 auth email flows.
Previous milestone: 62 (after phase 5 memo subsystem). Added 3 across v0.6.0 (email_token_consume_service, email_otp_service, log_scrub).
Wave 4 highlights (cumulative): every router under strict; build_sort_matrix cleanup eliminates last dict[str,Any] in analysis pipeline; security.py cast()s removed (bcrypt/jwt stubs now fully typed); analysis router promoted to full strict.
Next bar (out of scope for v0.2): graduate the relaxed-tier StudyService proxies to typed pass-throughs (would require duplicating SubmissionService / StudyDataService signatures); promote remaining schemas/models to full strict by introducing TypedDict wire shapes for the open-ended JSON columns.

Inside a strict module: every function declares its return type, no implicit `Any` propagation, no untyped variables. Use `# type: ignore[explicit-any]` with a one-line rationale when `Any` is genuinely required (e.g. JWT wire payloads, httpx.Response.json() wire data).

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
- Migration chain (19 migrations as of 2026-05-02, head `cb8732294475`):
  `initial_schema` → `rename_randomize_statements_to_randomize_statement_order`
  → `remove_consent_buttons` → `add_pre_instruction`
  → `add_is_test_run_to_participants` → `add_audio_recordings_table`
  → `add_display_order_to_statements`
  → `add_last_step_reached_to_participants` → `fix_last_step_reached_backfill`
  → `add_draft_responses_to_participants` → `add_resume_code_to_participants`
  → `add_concourse_tables` → `add_concourse_traceability_columns`
  → `add_item_versions_and_comments` → `rename_workspace_to_project`
  → `add_analysis_runs_table` → `add_anonymised_at_to_participants`
  → `rename_workspace_indexes_to_project_add_is_discarded_index`
  → `add_auth_email_flows`
- Run `alembic history` (in `backend/`) for the canonical chain — this list will drift if not updated when new migrations are added.
- PostgreSQL DDL is transactional: a failed migration rolls back entirely, leaving `alembic_version` unchanged

### API Changes
- After modifying backend schemas/routes, run `make generate-api` to regenerate the frontend client
- Run `make check-api` to verify the generated client is committed and up to date

### Hook-driven components (Phase 5 item G)

Pages and complex components delegate state-and-effect logic to a hook in
`frontend/src/hooks/<area>/use<Name>.ts`. The component receives the hook's return value
and renders JSX from it.

**Why:** logic becomes unit-testable without rendering; LLM can reason about logic
independently from JSX; the component file stays small and declarative.

**Boundary rules:**
- The hook owns: `useState`, `useEffect`, `useCallback`, `useMemo`, store subscriptions,
  navigation guards, keyboard handlers, event handlers, derived data.
- The component keeps: JSX, `useRef` for DOM elements, framer-motion `MotionValue`s and
  derived transforms (they must be passed to JSX elements), visual-only state
  (`cardDimensions`, `zoomLevel`, animation callbacks).

**All six target pages converted (Phase 5 item G complete):**
- `useFineSort` ← `FineSortPage` (hooks/participant/useFineSort.ts) — wave 1
- `useRoughSort` ← `RoughSortPage` (hooks/participant/useRoughSort.ts) — wave 1
- `useAnalysisPage` ← `AnalysisPage` (hooks/admin/useAnalysisPage.ts) — wave 2, 12 hook tests
- `useStudyDesignPage` ← `StudyDesignPage` (hooks/admin/useStudyDesignPage.ts) — wave 3, 13 hook tests, 42-field API
- `useRecruitmentPage` ← `RecruitmentPage` (hooks/admin/useRecruitmentPage.ts) — wave 4, 18 hook tests
- `useConcourseDetailPage` ← `ConcourseDetailPage` (hooks/admin/useConcourseDetailPage.ts) — wave 5, 20 hook tests, 94-field API

**Test convention:** add `hooks/<area>/use<Name>.test.ts` covering ≥5 pure logic
paths without rendering. The existing page test files remain in place as integration
tests covering hook+JSX glue.

**When you author a new page or refactor an existing one:** if the component body grows
beyond ~100 LOC of non-JSX logic, extract a `use<Name>` hook before adding more logic.

**JSX shell complexity:** when the page is mostly large declarative JSX (multiple
GuidanceCard panels, tabbed UI, modals), the noExcessiveCognitiveComplexity rule
fires on the JSX shell itself. Adding a `// biome-ignore lint/complexity/noExcessiveCognitiveComplexity`
on the page component is the documented exception (precedent: AnalysisPage,
StudyDesignPage, RecruitmentPage, ConcourseDetailPage). Only suppress on the
shell, never inside the hook.

### Admin header policy

Three layers, one role each. The breadcrumb is the single source of truth for
hierarchy; every other piece of header chrome must respect that.

- **L1 Breadcrumb** (`AdminLayout.tsx`): hierarchy. Format `[Project] > [Study?] > [Section]`.
  No local breadcrumbs in pages. Every static URL segment must have an entry in the
  `mapping` table (no fallback to `last.charAt(0).toUpperCase()`); detail routes
  (`…/concourses/:id`, `…/participants/:id`) get a typed special case.
- **L2 Page header** (`StudyPageHeader`): the page's function. Two patterns:
  - **Entity entry-point pages** → H1 = entity name. Project Dashboard = `project.title`,
    Study Overview = `study.translations[0].title`, Participant detail = "Participant #N".
  - **All other pages** → H1 = functional name ("Settings", "Analysis", "Data", "Access",
    "Project settings", "Profile"). Never `project.title` / `study.title` — those are in
    the breadcrumb already.
- **L3 Section titles** (`CardTitle` / `<h2>`): typography is `text-lg font-black text-slate-900`.
  L4 item titles inside cards may use `font-semibold` (precedent: AdminDashboard study cards).

**Naming canon.** One label per section, propagated to three keys:
`admin.sidebar.<s>` (may use a shorter variant if width-constrained),
`admin.breadcrumbs.<s>`, `admin.<s>.title`. Default values in `t(key, 'fallback')` must
match the canonical English label.
