# Libre-Q Audit — Action Backlog

**Sprint context:** SoftwareX submission target **2026-05-14**. Today **2026-04-25**. ~19 days, of which ~3 weeks of part-time work.

**Backlog source:** 132 findings across 12 axes (see `00-executive-summary.md`).

**Format reminder:** each line is copyable into Todoist as
`#libre-q [F-XX-NNN] {title} @{tag} p{1-3}`.
- `p1` = blocker, `p2` = SoftwareX-tagged major, `p3` = other.

---

## ⚡ Week 1 — 2026-04-27 → 2026-05-02 (Remediation week 1)

**Goal:** all 6 blockers + transverse Cluster A (reviewer install) + Cluster B (submission package frozen) + Critical Q framing in docs.

**Estimated effort: ~20h** (~6h/day × 3-4 working days).

### Block 1.1 — All blockers (~3h, single session)

- [ ] [F-01-001] Bump `pyjwt>=2.12.0` in `backend/pyproject.toml`; `uv lock`; verify decode call sites
      effort: S | axes: 01 | owner: ?
- [ ] [F-01-002] Move `.env` real creds to local-only template; create `.env.example` (overlaps F-09-003)
      effort: S | axes: 01, 09 | owner: ?
- [ ] [F-01-003] Hard-gate test router on `ENVIRONMENT=="development"` only; set `ENVIRONMENT` in `Procfile` and `scalingo.json`
      effort: S | axes: 01 | owner: ?
- [ ] [F-12-003] Uncomment `push:` and `pull_request:` triggers in `.github/workflows/ci.yml`
      effort: S | axes: 12 | owner: ?
- [ ] [F-12-001] Cut tag `v0.1.0-softwarex` (or chosen format) on a CI-green commit
      effort: S | axes: 12 | owner: ? — depends on F-12-003 green CI
- [ ] [F-12-002] Create `.zenodo.json`; let Zenodo auto-import on tag push; paste DOI into CITATION.cff and README
      effort: S | axes: 12 | owner: ? — depends on F-12-001

### Block 1.2 — Cluster B continuation: CITATION.cff + README citation (~1h)

- [ ] [F-10-004] Fill 3 CITATION.cff TODO stubs (`date-released` real date, Zenodo DOI from F-12-002, ORCIDs)
      effort: M | axes: 10 | owner: ? — depends on F-12-002
- [ ] [F-10-003] Add `## Citation` section to README pointing to CITATION.cff
      effort: S | axes: 10 | owner: ?
- [ ] [F-12-004] Add ORCIDs to CITATION.cff (overlaps F-10-004)
      effort: S | axes: 12 | owner: ?
- [ ] [F-12-016] Add AI usage disclosure section to README + CITATION.cff
      effort: S | axes: 12 | owner: ?

### Block 1.3 — Cluster A: Reviewer install path (~4h, single session)

- [ ] [F-09-003 + F-12-013] Create `.env.example` covering `DATABASE_URL`, `SECRET_KEY`, `ALLOWED_ORIGINS`, all settings actually read
      effort: S | axes: 09, 12 | owner: ?
- [ ] [F-09-006] Move `ALLOWED_ORIGINS` from bare `os.getenv()` to `Settings` class; document
      effort: S | axes: 09 | owner: ?
- [ ] [F-09-002 + F-12-013] Rewrite README Quick Start to a clean from-zero path: clone → copy `.env.example` → edit DB URL → `make install` → `make migrate` → `python init_db.py` → `python seed.py` → `make run-backend`/`make run-frontend`. Test as a fresh user.
      effort: M | axes: 09, 12 | owner: ?
- [ ] [F-09-004] Restore or relocate `backend/data/example-study.json` so seed works as documented
      effort: M | axes: 09 | owner: ?
- [ ] [F-12-006] Create `CONTRIBUTING.md` at repo root (or symlink to `docs/contributing/`)
      effort: S | axes: 12 | owner: ?

### Block 1.4 — Statement of Need + competitor comparison (~3h)

- [ ] [F-10-001 + F-12-012] Add explicit `## Statement of Need` section to README. Frame the gap Libre-Q fills (browser-based + mobile + critical Q + multi-language) vs existing tools.
      effort: M | axes: 10, 12 | owner: ?
- [ ] [F-12-011] Update README comparison table: add qmethod-R and KADE rows; correct "Open source" claim for Ken-Q; verify all rows
      effort: S | axes: 12 | owner: ?
- [ ] [F-12-014] Add hero screenshot of the Q-sort grid interface to README
      effort: S | axes: 12 | owner: ?

### Block 1.5 — Critical Q framing in documentation (~3h)

- [ ] [F-12-010] Add explicit critical Q positioning to README + CITATION.cff abstract
      effort: M | axes: 06, 12 | owner: ?
- [ ] [F-10-010] Rewrite `docs/explanation/q-methodology.md` to include critical Q (Sneegas 2020, Stainton Rogers 1997, Stenner 2011 references — already in papis library `q-methodology`)
      effort: M | axes: 06, 10 | owner: ?

### Block 1.6 — Axis 06 critical decisions (~2h discussion + decision)

These need user judgment: implement before submission OR document as known limitations in the manuscript.

- [ ] [F-06-001 — decision] `AnalysisRun` DB model + migration. Implement (L, ~6h) for full audit trail OR explicit limitation in manuscript.
      effort: L (if implementing) | axes: 06 | owner: ?
- [ ] [F-06-002 — decision] Judgmental (manual) rotation. Implement (L, ~8h) OR limitation in manuscript citing Stainton Rogers/Watts & Stenner.
      effort: L (if implementing) | axes: 06 | owner: ?
- [ ] [F-06-008 — decision] Audio↔factor linkage in admin UI. Implement (M-L, ~4-6h) OR limitation framed as "v0.2 roadmap".
      effort: M-L (if implementing) | axes: 06 | owner: ?

**Recommended Week 1 cumulative: ~20h** if all 3 axis-06 decisions are deferred to limitations; **~30-40h** if implementing.

---

## 🔧 Week 2 — 2026-05-03 → 2026-05-09 (Remediation week 2)

**Goal:** remaining SoftwareX-tagged majors that aren't desk-reject risks but reduce reviewer satisfaction. Triage based on Week 1 outcome.

**Estimated effort: ~25h** for the priorities below.

### Block 2.1 — Tests for critical paths (~10h)

- [ ] [F-04-007] Add unit tests for `FactorArraysView.tsx` and `FactorCharacteristicsTable.tsx` (currently 0%, your WIP files)
      effort: M | axes: 04 | owner: ?
- [ ] [F-04-006] Add Playwright e2e for admin analysis workflow (factor analysis run → results display)
      effort: M | axes: 04 | owner: ?
- [ ] [F-04-001] Test `submission_service.py` race conditions (lines 99-141, 348-366)
      effort: M | axes: 04 | owner: ?
- [ ] [F-04-002] Bring `study_service.py` to ≥70% with create/update/delete service tests
      effort: M | axes: 04 | owner: ?
- [ ] [F-04-008] Add tests for `useAdminStore.ts` and `useAuthStore.ts` (currently 13%)
      effort: S | axes: 04 | owner: ?
- [ ] [F-02-005] Add unit tests for `validate_for_activation` (CC=31, no tests, pre-activation gate)
      effort: S | axes: 02 | owner: ?

### Block 2.2 — RGPD compliance (~5h, decision-driven)

- [ ] [F-05-004 + F-01-012] **Cluster D** — Add `anonymised_at` column migration on `Participant` (parent finding F-05-004), then add `DELETE /participants/{id}` endpoint with anonymisation semantics
      effort: M+M = ~4h | axes: 01, 05 | owner: ?
      decision: implement before submission OR document as roadmap with manuscript framing

### Block 2.3 — Security follow-ups (~4h)

- [ ] [F-01-005] DOMPurify XSS CVEs — evaluate whether `SafeMarkdown` could move to a different sanitizer (e.g., markdown-it built-in) or accept the risk with documentation
      effort: S | axes: 01 | owner: ?
- [ ] [F-01-006] xlsx prototype pollution — same triage; evaluate alternatives or vendor with patches
      effort: M | axes: 01 | owner: ?
- [ ] [F-01-004] Trusted-proxy validation for X-Forwarded-For in `limiter.py`
      effort: M | axes: 01 | owner: ?
- [ ] [F-01-007] Replace `allow_headers: ["*"]` with explicit list
      effort: S | axes: 01 | owner: ?
- [ ] [F-01-008] Bump `i18next-http-backend` (path traversal CVE)
      effort: S | axes: 01 | owner: ?

### Block 2.4 — Frontend critical fixes (~3h)

- [ ] [F-07-002] Replace raw `<div>` progress bar with Radix `<Progress>` (ARIA-compliant) in RoughSortPage
      effort: S | axes: 07 | owner: ?
- [ ] [F-07-003 + F-07-008] Wire `useTranslation` into `LandingPage` and `ResetPage`; move strings to locale files
      effort: S | axes: 07 | owner: ?
- [ ] [F-07-001] Triage 59 EN==FR + 16 EN==FI suspicious entries; translate genuine gaps; add "ok-cognate" allowlist for false positives
      effort: M | axes: 07 | owner: ?

### Block 2.5 — Observability (~2h)

- [ ] [F-11-001] Wire `sentry-sdk[fastapi]` (backend) + `@sentry/react` (frontend) with env-gated DSN
      effort: M | axes: 11 | owner: ?
- [ ] [F-11-003] Add `logger.info(actor, resource)` at success path of each admin mutation
      effort: M | axes: 11 | owner: ?

### Block 2.6 — Performance quick wins (~1h)

- [ ] [F-08-001] Restore `DataExportsPage = lazy(...)` import (one-line fix)
      effort: S | axes: 08 | owner: ?
- [ ] [F-08-002] Restore `GeneralSettingsPage` lazy import
      effort: S | axes: 08 | owner: ?
- [ ] [F-09-005] Run `make migrate` to bring dev DB to HEAD; update CLAUDE.md migration chain to 15
      effort: S | axes: 09, 10 | owner: ?

---

## ✅ Week 3 — 2026-05-10 → 2026-05-14 (Pre-submission validation only)

**No new findings — only validation and submission ceremony.**

- [ ] Re-run `make ci-full` on the tagged commit; verify green
- [ ] Manual journey: admin onboarding (create study → add concourse → invite participant)
- [ ] Manual journey: participant Q-sort on mobile viewport (375x667)
- [ ] Manual journey: factor analysis with one realistic dataset (e.g., reference-bipolar from `.raw/qmethod-libre-q-*.json`)
- [ ] Re-tag if needed (e.g., `v0.1.0` → `v0.1.0-softwarex` final) and verify Zenodo archive triggers
- [ ] Confirm DOI in CITATION.cff and README links
- [ ] Submit manuscript + software metadata to SoftwareX
- [ ] Email co-author C. Dedinger (URCA) confirmation of submission

---

## 📚 Post-submission — minors + observations + deferred majors

**No deadline pressure.** Address as available.

### Architecture refactor (deferred majors that didn't fit)

- [ ] [F-03-001] Extract `AuthService` from `auth.py` router (currently 339 lines, 0 service imports)
      effort: M | axes: 03, 04 | owner: ?
- [ ] [F-03-002] Extract `ProjectService` from `projects.py` router
      effort: M | axes: 03 | owner: ?
- [ ] [F-03-003] Extract `StudyImportService` from `studies_import_export.py` (CC=58 in router)
      effort: M | axes: 03 | owner: ?
- [ ] [F-03-004] Extract `AudioService` from `audio.py` router
      effort: S | axes: 03 | owner: ?
- [ ] [F-03-006] Extract `InvitationService` from `invitations.py`
      effort: S | axes: 03 | owner: ?

### Q-methodology evolution (Cluster C continuation)

- [ ] [F-06-007] Include flagging threshold + `av_rel_coef` + SED matrix in analysis export
      effort: M | axes: 06 | owner: ?
- [ ] [F-06-001 — if not implemented in W1] Persist analyses with `AnalysisRun` model
      effort: L | axes: 06 | owner: ?
- [ ] [F-06-002 — if not implemented in W1] Add judgmental rotation support
      effort: L | axes: 06 | owner: ?
- [ ] [F-06-008 — if not implemented in W1] Link audio recordings to factor membership in admin UI
      effort: L | axes: 06 | owner: ?
- [ ] [F-06-009] Install R + qmethod, complete Layer 2 cross-tool validation, document in `docs/`
      effort: M | axes: 06 | owner: ?
- [ ] [F-06-012] Add explicit factor-naming step in admin analysis UI
      effort: M | axes: 06 | owner: ?

### Test infrastructure

- [ ] [F-04-012] Migrate from `mutmut` to `pytest-mutagen` (or downgrade mutmut to 2.4.4)
      effort: S | axes: 04 | owner: ?
- [ ] [F-04-013] Replace whole-API mocks in admin analysis page tests with targeted mocks
      effort: M | axes: 04 | owner: ?

### Performance

- [ ] [F-08-003] Split admin and participant routes into separate bundles
      effort: M | axes: 08 | owner: ?

### Code quality

- [ ] [F-02-002] Type the `updateTranslation` callback to remove the `any` cascade across 20 files
      effort: M | axes: 02 | owner: ?
- [ ] [F-02-001] Fix 3 tsc errors
      effort: S | axes: 02 | owner: ?

### All other minors and observations

See per-axis files for the remaining ~70 minors and ~30 observations. Tackle opportunistically — none block prod or SoftwareX.

---

## Findings explicitly NOT addressed before submission

(Fill in based on Week 1 decisions on cluster C / axis 06.)

For each item below, the manuscript must explicitly acknowledge as a known limitation:

- [ ] (placeholder — to be filled after Week 1 axis-06 decision session)

---

## Sprint capacity check

| Week | Recommended scope | Effort estimate | Capacity (~30h/week) | Margin |
|------|-------------------|----------------|---------------------|--------|
| W1 (04-27 → 05-02) | Blockers + clusters A/B + Statement of Need + critical Q framing | ~20h | 30h | 10h |
| W2 (05-03 → 05-09) | Tests + RGPD + security + frontend + observability | ~25h | 30h | 5h |
| W3 (05-10 → 05-14) | Validation + submit | ~5h | 30h (partial week) | 25h |

**Conclusion:** comfortable scope if axis-06 deep features (rotation, AnalysisRun, audio linkage) are deferred to limitations. If implementing all three: scope is tight but feasible with W1 margin reduced to ~0h.
