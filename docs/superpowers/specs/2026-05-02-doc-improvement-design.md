# Documentation improvement — design

**Date:** 2026-05-02
**Status:** brainstorming → spec → writing-plans
**Author:** Julien Vastenaekels (with Claude assistance)

## Goal

Three concurrent issues with the Qualis documentation:

1. **Internal hygiene drift** — duplicate row in `docs/README.md`, two parallel `contributing/` folders (`docs/contributing/` and `docs/guides/contributing/`), legacy planning artifacts in `docs/plans/` and `docs/implementation_plans/` (the latter contains a 5144-line working doc), a stale root `TODO.md`.
2. **Doc-vs-code drift on recent features** (≈3 last months) — collaborative memos with @-mentions and export pipeline, free-distribution mode with overflow rows, rough-sort opt-in toggle, Analysis Compare with Tucker φ alignment, factor canvas focus mode + quote picker, Explorer panel diagnostics with preview-range, dedicated `/members` page, `is_test_run` removal — none documented in `docs/`.
3. **README positioning** — current Statement of need explicitly targets *« groups practising critical Q-methodology »* with classical Q as a secondary use case. This signals to PQMethod/Brown-school users that they are second-class. We want symmetric positioning that addresses both schools.

## Non-goals

- No site generator (Docusaurus, MkDocs). Stay on GitHub markdown rendering.
- No translation of the docs (UI is i18n'd; docs remain English-only).
- No rewrite of `docs/explanation/architecture.md` (~440 lines, ~80% accurate, out of scope).
- No use-cases-by-community pages (option d, not retained).
- No *Analytical fidelity* README section yet — deferred until cross-validation against PQMethod 2.35 and the R `qmethod` package is actually run. A vague "forthcoming" claim would erode trust more than help.

## Approach

Three waves, five PRs total, squash-merged sequentially. Each PR is mergeable on its own and reverts cleanly.

```
Vague 1 → Vague 2 (B1 → B2 → B3) → Vague 3
   1 PR        3 PRs                  1 PR
```

## Vague 1 — Hygiène (1 PR)

Estim ~½ day. Mechanical, zero new content.

### Deliverables

- **Fix `docs/README.md`** — drop the duplicate `Study Configuration Format` row (line 60). Run `lychee` over `docs/` + root `README.md`; resolve any newly-surfaced broken links.
- **Consolidate contributing/** — keep `docs/contributing/`, migrate `docs/guides/contributing/{development,testing,style-guide}.md` into it, remove the empty `docs/guides/contributing/` directory. Update all inbound links (root `README.md` line 187+210, `docs/README.md`, any cross-references inside the moved files).
- **Drop legacy planning docs** — `git rm docs/plans/branching-questions.md`, `git rm docs/implementation_plans/{backend_robustness,optimistic_locking_plan,study_visualization_overhaul}.md`. Git history preserves them.
- **Drop root `TODO.md`** — content is mixed (some items done, some never started, some partial). Plain `git rm`.
- **Audit `docs/explanation/design-decisions/mobile-ux.md`** for staleness in passing; flag in PR description if rewrite needed (don't do it in this PR).

### Acceptance

- `lychee` passes with no new warnings on `docs/` + `README.md`.
- `find docs -type d -name contributing` returns exactly one result.
- `docs/plans/` and `docs/implementation_plans/` no longer exist.
- `TODO.md` no longer exists at repo root.
- `docs/README.md` has no duplicate rows.

### PR title

`docs: hygiene — consolidate contributing folder, drop legacy plans`

## Vague 2 — Drift code → doc (3 PRs)

Estim ~4-5 days total, split into B1/B2/B3 of comparable size.

### B1 — Reference drift + tutorial mécanique (1 PR, ~1 day)

Mechanical updates: factual drift in reference docs + the one tutorial that needs only patches.

**Deliverables:**

- `docs/reference/configuration.md`: add `distribution_mode` (forced/free, semantics of overflow rows) and `rough_sort_enabled` toggle.
- `docs/reference/admin-dashboard.md`:
  - New `## Memos` section (placement, behavior, @-mentions, badge indicator).
  - New `## Members` section (the dedicated `/members` page).
  - New subsections `### Compare`, `### Explorer panel`, `### Factor canvas` under `## Analysis`.
- `docs/reference/study-configuration-format.md`: add new JSON fields if absent (`distribution_mode`, `rough_sort_enabled`, memo-related fields if any are exported).
- `docs/reference/api.md`: audit against `openapi.json`; add memo + compare + explorer endpoints that are missing.
- `docs/tutorials/collecting-responses.md` (patches a):
  - Remove `is_test_run` mention (column was dropped in commit `392372a1`).
  - Add `/members` page reference where Access submenu is described.
  - Detail the started-vs-completed funnel.

**Acceptance:**

- `grep -r "is_test_run" docs/` returns zero.
- `admin-dashboard.md` table of contents shows Memos, Members, Compare, Explorer, Factor canvas.
- `configuration.md` covers `distribution_mode` and `rough_sort_enabled`.
- `make ci` passes.

**PR title:** `docs: drift B1 — reference docs + collecting-responses patches`

### B2 — Tutorial 1 (refonte b) + researcher guides + tutorial 5 merge (1 PR, ~1.5 day)

The first researcher experience, with reflexive sidebars for the dual classical/critical audience, plus the tutorial-5 merge.

**Deliverables:**

- `docs/tutorials/your-first-study.md` — refonte b:
  - Tab list updated (Consignes tab absorbs parts of Presort/Interface, per commit `9ca2a7c7`).
  - Reflexive sidebar « Forced vs free distribution » at the grid step.
  - Reflexive sidebar « Should you use a rough-sort? » at the preview step.
  - Reflexive sidebar « Writing a non-leading Condition of Instruction » at the Instruction step.
  - Brief mention of the methodology memo as a design-memory tool.
  - Step 9 (rough-sort) reframed as opt-in rather than default.
- `docs/guides/conducting-studies.md` — integrate memos as a researcher workflow tool (design notes, sharing across team members); mention free-vs-forced distribution choice.
- `docs/guides/data-export.md` — verify the memo export pipeline is covered; add if missing.
- **Tutorial 5 merge** — fold useful content of `docs/tutorials/local-development.md` into `docs/guides/contributing/development.md` (which moves to `docs/contributing/development.md` per Vague 1). `git rm docs/tutorials/local-development.md`. Update inbound links: root `README.md` line 187, `docs/README.md`, `docs/tutorials/README.md`, `analyzing-results.md` step 7.

**Acceptance:**

- `your-first-study.md` reads correctly for a researcher who has not yet picked a school; the three sidebars are present and read as informative, not prescriptive.
- `docs/tutorials/local-development.md` no longer exists; all inbound links resolve.
- Manual check: `grep -r "tutorials/local-development" .` (excluding node_modules/.venv/.git) returns zero.

**PR title:** `docs: drift B2 — tutorial 1 refonte + researcher guides + tutorial 5 merge`

### B3 — Tutorials 3+4 (foundations + refinement) (1 PR, ~2 days)

The pivotal pedagogical piece. Splits the analysis tutorial into two paths.

**Deliverables:**

- Rename `docs/tutorials/analyzing-results.md` → `docs/tutorials/analyzing-results-foundations.md`. Refonte b: keep PCA/Varimax/auto-flag defaults, the four basic tabs (Loadings/Factor Arrays/Statements/Characteristics), exports. Audience: researcher who wants a publishable factor solution. Add an explicit pointer to Refinement at the end.
- New `docs/tutorials/analyzing-results-refinement.md`. Plan:
  1. Finding the right factor count (Explorer panel + preview-range).
  2. Validating stability (Compare / Tucker φ + delta columns).
  3. Interpretive layer (factor canvas focus mode + quote picker).
  4. Tracing collaborative interpretation (memos + @-mentions).
- Update `docs/README.md` (tutorials index) and `docs/tutorials/README.md` for the new 4-tutorial layout (your-first-study, collecting-responses, analyzing-results-foundations, analyzing-results-refinement).
- Cross-check `docs/explanation/q-methodology.md`: if free distribution warrants a paragraph, add it (no full rewrite).

**Acceptance:**

- The two analysis tutorials are present, with a clean handoff from Foundations to Refinement.
- `docs/tutorials/README.md` lists 4 tutorials. Index in `docs/README.md` matches.
- Manual read by Julien: does Refinement land for *both* a methodologist (preview-range, Compare) and a critical-Q researcher (memos, quote picker)?

**PR title:** `docs: drift B3 — analysis tutorials split into foundations + refinement`

## Vague 3 — README rework (1 PR)

Estim ~½ day rédaction + Codex review. Two changes only.

### Deliverables

- **Reformulate Statement of need** (`README.md` lines 21-27). The current closing sentence reads:
  > *"The platform is targeted at groups practising critical Q-methodology and is also usable for classical workflows."*
  Replace with symmetric framing — Qualis serves both Brown-school classical Q and critical Q practices that emphasise reflexivity and interpretive layering. Critical-Q references (Stainton Rogers, Stenner, Watts & Stenner, Sneegas) stay in the paragraph but as background context, not foreground positioning.
- **Add comparison-table row** (`README.md` lines 33-46). Insert one row: *Collaborative interpretation (memos, quotes, focus)* with `No / No / No / No / No / Yes`. This is the differentiator vs KADE / qmethod / Ken-Q that the table currently omits.

### Process

- Draft the diff.
- Run `codex-second-opinion` in *stress-test* mode on the reformulated Statement of need: ask Codex to argue against the broaden-positioning move (concretely: "you risk losing what made Qualis distinctive for the critical Q crowd"). Apply retained feedback or document divergence.
- Manual read by Julien with the lens « does a PQMethod user still feel out of place? ».

### Acceptance

- The closing sentence of the Statement of need treats classical and critical Q symmetrically.
- The comparison table has the new row.
- Codex stress-test feedback resolved (applied or argued against in the PR description).

### PR title

`docs: README — broaden positioning, add collaborative-interpretation row`

## Deferred (not in this design)

- **Analytical fidelity README section.** Originally proposed for Vague 3. Dropped because cross-validation against PQMethod 2.35 and the R `qmethod` package has not been run. A vague "forthcoming" claim would harm credibility. Open a follow-up PR once validation is done; that PR will land between the comparison table and Key features.
- **Hero screenshot.** The `<!-- TODO: Add hero screenshot -->` comment in the README stays as is.
- **`docs/explanation/architecture.md` refresh.** ~80% accurate, full pass deferred to a separate effort.
- **Mobile-UX explanation refresh.** Audited in Vague 1, refresh deferred to a separate PR if needed.
- **Tutorial 5 (local-development) full content audit.** During the merge in Vague 2 B2, only useful content goes into `docs/contributing/development.md`. A deeper rewrite of the dev guide is out of scope.

## Open questions

None at this stage.

## Sequencing & convention

- 5 PRs total, squash-merged in order: Vague 1 → V2 B1 → V2 B2 → V2 B3 → Vague 3.
- Each PR description lists what changes and what does *not* change (the non-goals from this spec stay valid PR-by-PR).
- `make ci` runs on each PR (no doc-specific CI other than internal-link sanity).
