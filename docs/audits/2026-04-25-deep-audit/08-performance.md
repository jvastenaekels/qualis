# Axis 08 — Performance

**Date:** 2026-04-25
**Pass:** light (≤30 min manual review, max 8 findings)
**Auditor:** Claude (claude-sonnet-4-6) with J. Vastenaekels

---

## Methodology

### Automated inputs

| Input | Outcome |
|-------|---------|
| Frontend build + bundle analysis | Build fails (3 TypeScript errors in uncommitted files); bundle sizes from prior successful build (2026-03-07). Sizes are representative of main-branch state. |
| `rollup-plugin-visualizer` | Not wired in `vite.config.ts` — no interactive treemap available |
| SQL trace (`SQLALCHEMY_ECHO=1`) on `tests/unit/test_analysis_service.py` | 0 SQL queries — analysis service is pure NumPy/math, no DB calls |
| Static N+1 grep (loops + DB calls in services) | 1 candidate: `concourse_service.py` `import_items_to_study` loop |
| Lazy-relationship audit (`lazy=` in `models.py`) | All relationships explicitly set to `lazy="raise"` or `lazy="selectin"` — no accidental `lazy="select"` defaults |

### Manual review scope

- `App.tsx` routing and lazy-loading strategy
- `vite.config.ts` chunk splitting configuration
- `dist/assets/` output sizes
- `analysis_service.py` algorithmic complexity
- `study_data_service.py` and `export_service.py` loop patterns
- `storage_service.py` S3 call patterns

### Out of scope (light pass)

- Lighthouse performance scores (dev server + chromedriver prerequisite — deferred)
- React re-render profiling
- Backend profiling under load

---

## Summary

5 findings. No blockers. One minor finding is the most consequential: `DataExportsPage`
is currently **eagerly imported** (lazy loading explicitly commented out), pulling the
entire 368 KB Recharts vendor chunk into the initial load for all routes — including
the participant Q-sort flow. The backend analysis pipeline shows no algorithmic
pathologies for Q-methodology dataset sizes. Lazy relationship guards (`lazy="raise"`)
are a strong positive signal: the ORM model is discipline-enforced to prevent accidental
N+1 loads.

---

## Findings

### F-08-001 : `DataExportsPage` lazy-load commented out — Recharts loaded eagerly on all routes

- **Severity:** minor
- **Audience:** [Prod]
- **Location:** `frontend/src/App.tsx:47-48`
- **Observation:** A `// const DataExportsPage = lazy(...)` comment on line 47 reveals
  that lazy loading was intentionally disabled. `DataExportsPage` is now eagerly imported,
  and its import chain (`DataExportsPage` → `InteractiveDataView` → three Recharts chart
  components) pulls `vendor-recharts` (368 KB unminified) into the initial synchronous
  load for every route, including the participant Q-sort flow (`/study/:slug/*`). The
  `manualChunks` config correctly isolates Recharts into its own chunk, but since the
  chunk reference is in the eagerly-loaded module graph it is fetched before the router
  renders anything.
- **Impact:** Participant-facing pages (mobile-primary) incur an unnecessary 368 KB JS
  fetch and parse on first load. For participants on low-bandwidth mobile connections
  this adds measurable latency before the consent or Q-sort screen appears.
- **Recommendation:** Restore `DataExportsPage` to lazy loading:
  ```ts
  const DataExportsPage = lazy(() => import('./pages/admin/DataExportsPage'));
  ```
  Also ensure `dataExportsPageLoader` is imported lazily or deferred in the route
  definition. If the previous eager import was a workaround for a specific bug, document
  it in a comment with the issue number; otherwise revert.
- **Effort:** S

---

### F-08-002 : `GeneralSettingsPage` eagerly imported — inconsistent with lazy pattern

- **Severity:** minor
- **Audience:** [Prod] [Maintenance]
- **Location:** `frontend/src/App.tsx:29` (comment: `// Added import`)
- **Observation:** `GeneralSettingsPage` is imported eagerly (`import GeneralSettingsPage from
  '@/pages/admin/GeneralSettingsPage'`) while all sibling admin pages (`StudyDesignPage`,
  `ProjectSettingsPage`, `RecruitmentPage`, etc.) are lazy-loaded. The trailing comment
  "Added import" suggests this was added in a hurry without applying the project's own
  lazy-loading convention.
- **Impact:** Adds `GeneralSettingsPage` and its dependency tree to the main synchronous
  bundle. The page itself is 20 KB; any heavy dependencies it transitively pulls in
  would also be bundled eagerly.
- **Recommendation:** Convert to lazy:
  ```ts
  const GeneralSettingsPage = lazy(() => import('./pages/admin/GeneralSettingsPage'));
  ```
  Remove the "Added import" comment. Verify the corresponding loader import
  (`generalSettingsPageLoader`) does not itself pull in heavy dependencies.
- **Effort:** S

---

### F-08-003 : No participant-vs-admin route split — all participant pages in 980 KB main bundle

- **Severity:** minor
- **Audience:** [Prod]
- **Location:** `frontend/src/App.tsx:18-35`, `frontend/vite.config.ts`
- **Observation:** The main bundle (`index-CZFxS8Ef.js`, 980 KB unminified, sitting just
  3% under the suppressed `chunkSizeWarningLimit: 1000`) contains both the participant
  Q-sort pages (`ConsentPage`, `WelcomePage`, `PreSortPage`, `RoughSortPage`,
  `PostSortPage`) and the admin layouts (`AdminLayout`, `ProjectLayout`,
  `StudyFocusLayout`, `StudyLayout`). There is no route-level code-split between the
  participant flow (mobile-primary, anonymous users) and the admin flow (desktop,
  authenticated researchers).

  The `chunkSizeWarningLimit` is set to `1000` (KB) in `vite.config.ts`, which silences
  Vite's default 500 KB warning and allowed the current 980 KB chunk to grow undetected.
- **Impact:** Every participant landing on `/study/:slug/welcome` downloads and parses
  nearly 1 MB of JavaScript that includes admin layout code they will never use. On
  mid-range mobile devices this has a measurable Time-to-Interactive cost. The suppressed
  warning masked this drift.
- **Recommendation:**
  1. Restore `chunkSizeWarningLimit` to `500` (Vite default) so oversized chunks are
     caught during development.
  2. Extract the participant flow into a dedicated lazy chunk by wrapping the
     `/study/:slug` route subtree in a lazy-loaded layout boundary, or by lazy-loading
     the heaviest participant pages individually (`RoughSortPage` at 28 KB source is a
     good candidate alongside the already-lazy `FineSortPage`).
  3. Consider a `manualChunks` entry grouping all `/study/*` pages into a `participant`
     chunk separate from the admin bundle.
- **Effort:** M

---

### F-08-004 : S3 audio deletions are fully sequential — no parallelism

- **Severity:** observation
- **Audience:** [Prod]
- **Location:** `backend/app/services/study_data_service.py:50-51`
- **Observation:** `delete_audio_files_for_study` iterates over all audio S3 keys
  sequentially with `await storage_service.delete_audio(key)`. Each call wraps a boto3
  `delete_object` in `run_in_executor`, so the event loop is not blocked, but the
  calls are still one-at-a-time. A study with N audio recordings performs N serial
  round-trips to S3 before returning.

  The same pattern appears in `export_service.py:168-172` (presigned URL generation per
  participant per audio recording) and `study_data_service.py:170-173`, though those
  calls are synchronous boto3 (not blocking in `run_in_executor`), meaning they **do**
  block the event loop briefly for each call.
- **Impact:** For a study with 50 participants each with 2 audio recordings, participant
  reset takes 100 serial S3 calls. At ~50 ms per call this is ~5 s of wall time in a
  research context where resets are occasional — acceptable for current scale, but will
  degrade if audio adoption grows.
- **Recommendation:** Use `asyncio.gather` to fan out deletions in parallel:
  ```python
  await asyncio.gather(*[storage_service.delete_audio(k) for k in s3_keys])
  ```
  For presigned URL generation (sync boto3 call), consider offloading to
  `run_in_executor` consistently rather than calling synchronously inside an async handler.
- **Effort:** S

---

### F-08-005 : `import_items_to_study` performs one `db.flush()` per statement — N round-trips for bulk import

- **Severity:** observation
- **Audience:** [Maintenance]
- **Location:** `backend/app/services/concourse_service.py:619-621`
- **Observation:** When importing N concourse items as study statements, the service calls
  `await db.flush()` inside the loop once per item (to populate `new_stmt.id` before
  creating `StatementTranslation` rows). For a concourse with 40 items this produces 40
  sequential flush round-trips to PostgreSQL within a single transaction.

  This is not a select-based N+1 pattern (no lazy relationship traversal occurs), and all
  flushes remain within a single transaction with a single `await db.commit()` at the end.
  The DB round-trip cost is thus N small INSERT + RETURNING trips rather than N full
  transactions.
- **Impact:** For typical Q-methodology concourse sizes (30–50 items), this is negligible
  (< 100 ms total on a local DB). At 500+ items (e.g., importing a large concourse
  library) it becomes noticeable but not blocking.
- **Recommendation:** Refactor to use `db.flush([new_stmt])` (flush only the new object)
  rather than a full session flush per iteration — this is already correct SQLAlchemy
  practice and avoids flushing unrelated pending objects. If performance matters at scale,
  consider using `RETURNING id` via a single bulk insert (`insert().returning()`),
  though this would require more significant refactoring.
- **Effort:** M

---

## Positive signals

- **`lazy="raise"` on all relationships** — the ORM model explicitly forbids implicit lazy
  loading across the board. This is the correct pattern for async SQLAlchemy and makes
  N+1 bugs surface immediately as exceptions rather than silently degrading performance.
  This is a non-trivial discipline for a project of this size and is worth noting in the
  SoftwareX manuscript's technical contribution paragraph.

- **Analysis pipeline algorithmic complexity is appropriate** — `run_analysis` in
  `analysis_service.py` uses vectorized NumPy operations throughout. The most expensive
  steps are `np.corrcoef` (O(M·N²)) and `np.linalg.eigh` (O(N³)) where N = participants
  and M = statements. For typical Q study sizes (N ≤ 50, M ≤ 60) these complete in
  milliseconds on any modern CPU. The varimax rotation uses O(k²) pair iterations with
  early convergence — no concern.

- **Dynamic import of SheetJS (xlsx)** — `analysisXlsxExport.ts` correctly uses
  `await import('xlsx')` at call time, keeping the 420 KB xlsx chunk out of the initial
  load. This is a well-executed optimization.

- **Route-level lazy loading for admin pages** — the heavy admin pages (AnalysisPage,
  StudyDesignPage at 209 KB, ConcourseDetailPage, etc.) are all properly lazy-loaded.
  The code-splitting strategy is solid; only two pages have regressed from it (findings
  F-08-001 and F-08-002).

---

## Bundle size reference (2026-03-07 build, pre-audit state)

| Chunk | Size (unminified) | Load timing |
|-------|-------------------|-------------|
| `index-CZFxS8Ef.js` | 980 KB | Eager (all routes) |
| `vendor-react` | 587 KB | Eager (all routes) |
| `vendor-lucide` | 574 KB | Eager (all routes) |
| `vendor-recharts` | 368 KB | **Eager (bug — see F-08-001)** |
| `xlsx` | 420 KB | Lazy (dynamic import at export time) |
| `StudyDesignPage` | 209 KB | Lazy (admin only) |
| `AnalysisPage` | 46 KB | Lazy (admin only) |
| `GridSort` | 53 KB | Lazy (participant fine-sort) |
| `sortable.esm` | 49 KB | Lazy (dnd-kit, via lazy pages) |

Approximate initial JS transfer for participant path (before F-08-001 fix):
**~2.1 MB uncompressed** (≈ 600–700 KB gzipped estimate).
After fixing F-08-001 + F-08-002 + F-08-003: target < 1.6 MB uncompressed (< 450 KB gzipped).

---

*Note: Bundle sizes reflect the last successful build (2026-03-07). The current working
tree has 3 TypeScript errors in uncommitted files (`AppSidebar.tsx`, `ProjectSettingsPage.tsx`)
that prevent a fresh build. These errors are tracked under axis 02 (code quality).*
