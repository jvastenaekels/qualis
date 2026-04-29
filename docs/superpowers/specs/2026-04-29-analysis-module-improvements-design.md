# Analysis module — interpretive workspace (design)

**Date:** 2026-04-29
**Status:** approved (brainstorm)
**Owner:** Julien Vastenaekels
**Audience:** implementer (Claude / contributor) for the next implementation plan

## 1. Problem

The Analysis page is a one-shot calculator: configuration card → run → four tabs of
results. Researchers iterate between two questions ("how many factors?" / "what does
this factor say?") with no shape to support the loop. Three concrete pains, ranked:

1. **Deciding on `n_factors`.** Eigenvalues are shown but the choice is vague; users
   launch several runs "to see" without a frame to compare them.
2. **Building a factor narrative.** `FactorNoteEditor` is an empty textarea; analysts
   juggle mental windows between the *Factor Arrays* tab, the *Voices* panel (audio +
   comments), and their own notes editor.
3. **Comparing two solutions.** No side-by-side view — the history sidebar lets you
   flip between runs but not see them together.

(De-prioritised by the user: integration with collaborative memos, novice-onboarding
wizard.)

## 2. Goal

Turn the page from "calculate then read" into a **two-phase interpretive workspace**:
*Explore* (decide `n_factors` by seeing solutions) → *Interpret* (build per-factor
narratives in a single canvas, with optional comparison against a pinned run).

## 3. Information architecture

The page splits into two phases, addressed by URL:

```
…/analysis?phase=explore                              ← Phase Explorer (default, no run)
…/analysis?phase=interpret&runId=42                   ← Phase Interpret (run selected)
…/analysis?phase=interpret&runId=42&focus=f1          ← per-factor focus
…/analysis?phase=interpret&runId=42&focus=f1&compareTo=38  ← compare pinned
```

**Transitions:**

- No run + insufficient participants → existing `EmptyStateContract` (unchanged).
- No run + sufficient data → Phase Explorer.
- Run launched / loaded from history → auto-switch to Phase Interpret (URL replaced,
  not pushed).
- Header button `← Back to Explore` returns to the Explorer phase.
- The **history sidebar remains visible in both phases** (right side, collapsible) so
  past runs are always one click away.

**Why URL state, not internal state.** A researcher shares "the run we discussed
yesterday" by sending a link → `?phase=interpret&runId=42&focus=f1` is self-contained.
The URL becomes the short-term memory of the workflow. Reload + share-link are stable.

**Hook split.** `useAnalysisPage` (557 LOC) is split into:

- `useExplorePhase(slug)` — eigenvalues, diagnostics, preview-range, form state, commit.
- `useInterpretPhase(slug, runId, focus, compareTo)` — fetch run + optional comparison,
  derive per-factor view-models.

Single source of truth: `runId` from the URL, fetched via `getAnalysisRun(runId)`. The
existing `result / viewingRun / freshRun / currentRun` quartet collapses into the URL
+ a single fetch.

## 4. Phase Explorer

**Goal:** decide `n_factors` by *seeing* candidate solutions, not guessing from a scree
plot alone.

### 4.1 Layout (ASCII)

```
┌─ Phase Explorer ────────────────────────────────────────────────┐
│  ┌─ Diagnostics ──────────┐  ┌─ Preview range ─────────────────┐│
│  │ Scree plot             │  │ ┌──┬──┬──┬──┬──┐                ││
│  │  • Kaiser:    3        │  │ │ 2│ 3│ 4│ 5│ 6│ ← n_factors    ││
│  │  • Parallel:  3        │  │ ├──┼──┼──┼──┼──┤                ││
│  │  • MAP:       4        │  │ │47│58│64│68│71│ ← cumvar %     ││
│  │  Advisory only —       │  │ │82│73│65│54│40│ ← % flagged    ││
│  │  Watts & Stenner 2012  │  │ │ 8│14│19│22│18│ ← # disting.   ││
│  └────────────────────────┘  │ │ 0│ 1│ 3│ 7│11│ ← # cross-load ││
│                              │ │ 4│ 4│ 3│ 2│ 1│ ← min def-sort ││
│  ┌─ Advanced config ─────┐   │ └──┴──┴──┴──┴──┘                ││
│  │ Extraction · Rotation │   │ [Click a column to commit]      ││
│  │ Flagging · Bootstrap  │   └──────────────────────────────────┘│
│  └────────────────────────┘                                      │
│  [ Commit and interpret → ]                                      │
└──────────────────────────────────────────────────────────────────┘
```

### 4.2 Backend

**(1) Enrich `GET /admin/studies/{slug}/analysis/eigenvalues`.** Add three retention
indicators to the response:

- `kaiser_n: int` — eigenvalues > 1 (renamed from `suggested_n_factors`).
- `parallel_analysis_n: int` — Horn (1965), Monte-Carlo with N=1000 random datasets of
  matching shape.
- `velicer_map_n: int` — Velicer (1976), minimum of mean squared partial correlations.

Response: `{eigenvalues, kaiser_n, parallel_analysis_n, velicer_map_n}`.

**(2) New endpoint `POST /admin/studies/{slug}/analysis/preview-range`.**

- Body: `{n_factors_range: [2,3,4,5,6], extraction, rotation, flagging}`. `extraction`
  must be `pca` and `rotation` must be in `{varimax, none}` — return 400 otherwise (see
  §4.4).
- Implementation: call `run_analysis` N times (one per `k`) with shared params and
  varying `n_factors`. **Not** a single-pass truncation. (Cost ≈ N × O(typical run);
  acceptable for typical study sizes.)
- Response per `k`: `PreviewSummary { n_factors, cumulative_variance, pct_flagged,
  n_distinguishing, n_cross_loaders, n_consensus, min_defining_sorts, has_empty_factor: bool }`.
- **No persistence** in `analysis_runs` — preview-range output is throwaway exploration.
- Validation: `n_factors_range` bounded to `[2, min(8, n_participants - 1)]`.

**(3) Service additions** in `app/services/analysis_service.py`:

- `compute_parallel_analysis_n(dataset, n_simulations=1000) -> int`
- `compute_velicer_map_n(cor_mat) -> int`
- `compute_preview_range(dataset, study_dump, n_factors_range, extraction, rotation, flagging) -> list[PreviewSummary]`

### 4.3 Frontend

- New component `<ExplorerPanel>` orchestrates `<ScreeWithDiagnostics>` +
  `<PreviewRangeTable>` + `<AdvancedConfigDisclosure>` + `<CommitButton>`.
- `<PreviewRangeTable>`: clickable columns; hover shows definition tooltips
  (`cross-loader = participant flagged on ≥2 factors`, etc.). Click pre-fills
  `n_factors` (does not run anything yet). `[Commit and interpret]` triggers a real
  `POST /analysis/run` which persists the run and switches to Phase Interpret.
- The existing `GuidanceCard` is repositioned above Diagnostics, with a short
  Watts & Stenner (2012) framing: *"These statistical criteria are advisory. In
  Q-methodology, factor retention also depends on interpretability and stability."*

### 4.4 Methodological guards

- **Preview-range is gated to PCA + varimax (or no rotation)** because (a) centroid
  extraction (Brown 1980) is iterative on residuals — solution at `k=3` ≠ prefix of
  solution at `k=6`; (b) judgmental rotation is path-dependent by definition. Showing
  preview rows for these would silently lie about what the committed run will look
  like. When the user picks `extraction=centroid` or `rotation=judgmental` in advanced
  config, `<PreviewRangeTable>` displays an honest message: *"Preview range supports
  PCA + varimax only. Centroid extraction and judgmental rotation are path-dependent;
  commit a run to inspect."*
- **Bootstrap is excluded from preview-range** — it serves z-score SE estimation, not
  factor retention, and cost would dominate the preview budget.

### 4.5 Per-factor diagnostic — `min_defining_sorts`

Listed alongside `cumulative_variance` in the preview row, this column surfaces the
minimum (across factors) of the count of flagged participants. A value of `0` means a
factor with no defining sorts — strong signal of over-factorisation. Marked with a ⚠
badge.

## 5. Phase Interpret

**Goal:** build the narrative of one factor without changing mental window. Top
statements + voices of flagged participants + narrative editor coexist in a focused
canvas.

### 5.1 Layout (ASCII)

```
Phase Interpret — Run #42 (3 factors, PCA+varimax, 2026-04-29)
───────────────────────────────────────────────────────────────────
[ F1 ]  [ F2 ]  [ F3 ]            [ Overview ⇆ ]   [📌 Pin compare]
───────────────────────────────────────────────────────────────────
Focus: F1   ·   def. sorts: 12   ·   variance: 24%   ·   composite r: .91

┌─ Statements (top/bottom z, distinguishing first) ─────────────┐
│  +2.41  S07  "Local food sovereignty matters more…"   D  ▸+   │
│  +1.89  S22  "..."                                       ▸+   │
│   …                                                            │
│  -1.74  S03  "..."                                    D  ▸+   │
│  -2.15  S15  "..."                                       ▸+   │
└────────────────────────────────────────────────────────────────┘

┌─ Voices — defining sorts on F1 ───────────────────────────────┐
│  P03 (load .78)  · 2 audio, 4 comments              [expand]  │
│    ▶ Audio on S07 (0:42)                  [no insert]         │
│    💬 "Because food sovereignty…" on S22         ▸+           │
│  P11 (load .71)  · 1 audio, 0 comments             [expand]   │
│  …                                                              │
└────────────────────────────────────────────────────────────────┘

┌─ Narrative — F1 ──────────────────────────────────────────────┐
│ [textarea]                                                     │
│ Save · 4000 chars · last saved 2 min ago                       │
└────────────────────────────────────────────────────────────────┘
```

### 5.2 Components & data flow

- **Factor selector chips** (`F1/F2/F3`) — sync to URL `?focus=f1`. Sharing a link
  goes to the right factor of the right run.
- **Mode toggle `Per-factor focus ⇆ Overview`** — Overview restores the existing four
  tabs (loadings, arrays, statements, characteristics) **unchanged**. Cross-factor
  view is preserved; focus is an addition, not a replacement.
- **Statements panel** — reuses `StatementsTable` filtered to the active factor,
  sorted by `|z|` descending, `D` badge for distinguishing. `▸+` button per row.
- **Voices panel** — reuses `FactorVoicesPanel`, restricted to participants where
  `flagged ∋ activeFactor`, sorted by `|loading|` descending. Each comment has its own
  `▸+` button; audios do not (see §5.3).
- **Narrative editor** — `FactorNoteEditor` enriched with an `onInsertQuote(snippet)`
  callback that appends to the draft (end of textarea). Save unchanged
  (`PATCH /analysis/runs/{run_id}` `factor_notes`).

### 5.3 Quote picker — scope decision

Insertions come **only from card comments** (text) for v1. Inserted format:

```
> {comment_text}
> — P{participant_label}, on statement {code}: "{statement_truncated_60ch}…"
```

Insertion is **at the end of the draft** (cursor handling deferred — KISS).

**No insertion from audios.** Without transcription, an inserted audio reference
would be a placeholder (`[Audio P03 — S07, 0:42]`) that adds nothing to a written
narrative. Audios remain listenable inline in the Voices panel; their transcription
is a separate, out-of-scope feature.

**No insertion from statements.** A statement's z-score is already visible via
`StatementsTable`; inserting `S07: "..." (z=+2.41)` duplicates information that the
analyst can already consult.

The quote picker is intentionally narrow: one source (comments of flagged participants),
one target (narrative of the active factor). Narrow → reliable.

### 5.4 Backend

**No new endpoint.** Existing endpoints cover all data needs:

- `GET /admin/studies/{slug}/analysis/runs/{run_id}` — summary + result with loadings
  and `flagged_factors`.
- `GET /admin/studies/{slug}/analysis/audios?run_id=…` (existing).
- `GET /admin/studies/{slug}/analysis/comments?run_id=…` (existing, router line 639).

Phase Interpret is **frontend-only** on the addition side: a new `<FactorCanvas>`
composes the existing data flows.

### 5.5 Compare runs (resolves pain C)

- `📌 Pin compare` button in the canvas header → opens a picker over the run history.
- Once pinned, the Statements panel gains a Δz column (`|Δz| ≥ 0.5` highlighted) and
  the Voices panel a Δloading column. The Narrative panel is **not** affected (each
  run owns its own notes).
- Factor matching is computed client-side via Tucker's φ on z-score vectors (a
  normalised dot product). Trivial computation. We align factors by maximum |φ| and
  warn when `φ < 0.85` ("ambiguous match — interpret deltas with care"). Comparison
  runs with a different `n_factors` are supported via the same max-|φ| matching;
  unmatched factors of the comparison run are simply ignored.
- The comparison run's audios and comments are **not** rendered in the canvas — only
  its numeric loadings/z-scores feed the delta columns. (Showing two sets of voices
  side-by-side is out of scope.)
- Unpinning at any time. The pin does not alter the active run.
- **Pin is not persisted server-side** — it lives in the URL
  (`?compareTo=38`). Reloading the page keeps it; closing the tab loses it.
  Deliberate: pins are session tools, not durable shareable objects (the persistent
  shareable thing is the `runId` itself).

### 5.6 Hook scope

- `useExplorePhase(slug)` owns: eigenvalues + diagnostics, preview-range, form state
  (`extraction / nFactors / rotation / flagging / bootstrap`), `manualFlags`,
  `manualRotations`, commit.
- `useInterpretPhase(slug, runId, focus, compareTo)` owns: run fetch, optional
  comparison run fetch, per-factor view-model derivation (statement filtering, voices
  filtering, comment grouping), Tucker's φ computation, quote-insertion handler.
- The `showFactorNarratives` localStorage toggle disappears from the focus mode (the
  narrative is *central* in the canvas, no longer optional). Toggle stays for
  Overview mode.

## 6. Migration & compatibility

**Database:** no schema change. The existing `AnalysisRun` model (with
`factor_notes` jsonb) covers everything.

**URLs:**

- Old: `?tab={loadings|arrays|…}&extraction&nFactors&rotation&flagging`
- New: `?phase={explore|interpret}&runId&focus&compareTo`
- Strategy: legacy URLs (presence of `tab` without `phase`) are ignored; default to
  Explorer if no run, Overview if a run exists. Form-state query params were
  session-scoped, not shareable links — safe to drop.

**Phasing:** five PRs, matching the 5–6 budget agreed in approach selection.

| PR | Scope | Risk |
|----|-------|------|
| 1 | Backend: enrich `/eigenvalues` (Horn + MAP); new `/preview-range` with PCA+varimax guard. Service: `compute_parallel_analysis_n`, `compute_velicer_map_n`, `compute_preview_range` (N real runs). | Low — additive, unit-testable. |
| 2 | Frontend: split `useAnalysisPage` → `useExplorePhase` + `useInterpretPhase`, route by `?phase=`. **No visible UI change.** Tests reorganised. | Medium — pure refactor; ci-fast + hook tests. |
| 3 | Frontend: `<ExplorerPanel>` (diagnostics + `<PreviewRangeTable>` + advanced disclosure). Replaces the legacy config card on the Explorer side. | Low — localised substitution. |
| 4 | Frontend: `<FactorCanvas>` + factor-selector chips + quote picker (comments only) + Overview ⇆ Focus toggle. Overview = existing tabs unchanged. | Medium — new surface, hook + component tests. |
| 5 | Frontend: Compare pin (Tucker's φ matching, delta strip in canvas). | Low — opt-in, doesn't alter the canvas by default. |

PR 2 is the risky pivot — a refactor that must not break behaviour. Guard-rail: take a
snapshot of `AnalysisPage.test.tsx` behaviour before PR 2; the same tests must pass
after. The rendered UI is identical; only plumbing changes.

## 7. Out of scope (explicit non-goals)

- **Memo integration** (analysis ↔ collaborative memo). User de-prioritised D.
- **Novice wizard** (guided onboarding). User de-prioritised E.
- **Audio transcription** to make audios insertable into narratives.
- **Tagged-runs model** (anchor / draft / alternative — Approach 3).
- **Cursor-position quote insertion**; v1 = append at end.
- **Server-side persistence of compare pins**; URL-scoped only.
- **Oblique rotations** (promax, quartimin). Orthogonal to this design.
- **Single-pass preview-range optimisation.** Reconsider only if profiling shows N=5
  real runs exceed ~3 s on realistic datasets.
- **Persistent run-diff storage.** Compare is a transient tool.

## 8. Testing strategy

**Backend** (`backend/tests/`):

- `unit/test_analysis_service.py`: new tests for `compute_parallel_analysis_n` (Horn
  1965 oracle on a small known dataset, fixed seed), `compute_velicer_map_n` (Velicer
  1976 oracle), `compute_preview_range` (consistency invariant: 5 calls to
  `run_analysis` produce the same per-`k` summary as the preview endpoint, for
  PCA+varimax).
- `integration/test_analysis.py`: 400 on `/preview-range` when `extraction=centroid` or
  `rotation=judgmental`. 200 + correct schema on PCA+varimax.
- `property/test_analysis_invariants.py`: Hypothesis test — preview row for `k`
  matches `#distinguishing` / `#cross_loaders` of a real `/run` with the same
  parameters and `k`, on random datasets.

**Frontend** (`frontend/src/`):

- `hooks/admin/useExplorePhase.test.ts` — ≥6 cases: diagnostics loading/error,
  preview-range trigger, PCA-only gating, commit transition to interpret.
- `hooks/admin/useInterpretPhase.test.ts` — ≥6 cases: fetch run, focus switch, voices
  filtered by factor flagging, quote insertion appends to draft, compare-pin Tucker
  matching, ambiguous-match warning.
- `components/admin/analysis/ExplorerPanel.test.tsx`: click on PreviewRangeTable
  pre-fills nFactors; advisory tooltip exposes Watts & Stenner framing.
- `components/admin/analysis/FactorCanvas.test.tsx`: focus rendering; `▸+` inserts the
  expected snippet; audios have no insert button.
- `pages/admin/AnalysisPage.test.tsx`: phase routing by URL; explore→interpret
  transition after commit.

**E2E:** no required additions — admin-only surface, no participant-side change.
Optional Playwright: "run an analysis, write a narrative inserting a quote, reload,
narrative persisted".

## 9. References

- Brown, S. R. (1980). *Political Subjectivity*. Yale University Press.
- Horn, J. L. (1965). A rationale and test for the number of factors in factor
  analysis. *Psychometrika*, 30(2), 179–185.
- Velicer, W. F. (1976). Determining the number of components from the matrix of
  partial correlations. *Psychometrika*, 41(3), 321–327.
- Watts, S., & Stenner, P. (2012). *Doing Q Methodological Research*. Sage.
- Zabala, A. (2014). qmethod: A Package to Explore Human Perspectives Using Q
  Methodology. *The R Journal*, 6(2), 163–173.
- Zabala, A., & Pascual, U. (2016). Bootstrapping Q methodology to improve the
  understanding of human perspectives. *PLOS ONE*, 11(2): e0148087.
