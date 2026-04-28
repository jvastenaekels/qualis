# Admin UX Audit — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Address all UX-audit findings (`.playwright-mcp/ux-audit/REPORT.md`) — bugs, terminology, responsive layout, missing tooltips, methodological depth, GDPR retention — across the admin interface.

**Architecture:** Three sequential PRs ordered by leverage. P1 = critical fixes + obvious bugs (1 day). P2 = terminology, clarity, tooltip sweep (1–2 days). P3 = methodological depth + retention policy (2–3 days). Each phase ships independently. `make ci-fast` between every commit, `make ci` before push. No backend schema churn in P1; one Alembic migration in P3.

**Tech Stack:** React 19 + TypeScript + Tailwind + shadcn/Radix + Vitest + react-i18next on the frontend. FastAPI + SQLAlchemy + Pydantic + Alembic on the backend.

**Source spec:** `.playwright-mcp/ux-audit/REPORT.md` (audit), `.playwright-mcp/ux-audit/notes.md` (per-page detail).

---

## Phase 1 — Critical fixes (one PR)

Six independent fixes that ship together. Quick wins, no schema changes, friction removed for every persona.

### Task 1.1: Fix `seed.py` paginated-list bug

`/api/admin/projects` returns `{items: [...], total, limit, offset}` but
`script_utils.APIClient.login()` treats it as a flat list, raising `KeyError: 0`
on the first paginated path. Blocks `python seed.py data/example-study.json` on
a fresh install.

**Files:**
- Modify: `backend/app/utils/script_utils.py:62-74`
- Test: `backend/tests/unit/utils/test_script_utils_login.py` (new)

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/unit/utils/test_script_utils_login.py
"""Verify APIClient.login() handles the paginated /api/admin/projects shape."""

import httpx
import pytest
import respx
from app.utils.script_utils import APIClient


@pytest.mark.asyncio
@respx.mock
async def test_login_handles_paginated_projects_response():
    respx.post("http://test/api/token").respond(
        200, json={"access_token": "tok", "token_type": "bearer"}
    )
    respx.get("http://test/api/admin/projects").respond(
        200,
        json={
            "items": [{"id": 7, "title": "P", "slug": "p"}],
            "total": 1,
            "limit": 50,
            "offset": 0,
        },
    )

    api = APIClient(base_url="http://test")
    await api.login(email="a@b.c", password="x")

    assert api.client.headers.get("X-Project-ID") == "7"
    await api.close()


@pytest.mark.asyncio
@respx.mock
async def test_login_handles_empty_paginated_projects():
    respx.post("http://test/api/token").respond(
        200, json={"access_token": "tok", "token_type": "bearer"}
    )
    respx.get("http://test/api/admin/projects").respond(
        200, json={"items": [], "total": 0, "limit": 50, "offset": 0}
    )

    api = APIClient(base_url="http://test")
    await api.login(email="a@b.c", password="x")

    assert "X-Project-ID" not in api.client.headers
    await api.close()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && .venv/bin/pytest tests/unit/utils/test_script_utils_login.py -v`
Expected: both tests FAIL with `KeyError: 0` on the first one.

- [ ] **Step 3: Fix `script_utils.APIClient.login()`**

Edit `backend/app/utils/script_utils.py` to normalize the paginated response:

```python
ws_response = await self.client.get("/api/admin/projects")
if ws_response.status_code == 200:
    payload = ws_response.json()
    projects = payload["items"] if isinstance(payload, dict) and "items" in payload else payload
    if projects and len(projects) > 0:
        first_proj_id = projects[0]["id"]
        self.client.headers.update({"X-Project-ID": str(first_proj_id)})
        print(f"DEBUG: Set X-Project-ID to {first_proj_id}")
    else:
        print("DEBUG: No projects found for this user.")
else:
    print(f"DEBUG: Failed to fetch projects: {ws_response.text}")
```

- [ ] **Step 4: Run tests to verify they pass + run lint**

Run: `cd backend && .venv/bin/pytest tests/unit/utils/test_script_utils_login.py -v && .venv/bin/ruff check app/utils/script_utils.py && .venv/bin/mypy app/utils/script_utils.py`
Expected: 2 tests PASS, no lint or mypy errors.

- [ ] **Step 5: Commit**

```bash
git add backend/app/utils/script_utils.py backend/tests/unit/utils/test_script_utils_login.py
git commit -m "fix(scripts): handle paginated /api/admin/projects in seed bootstrap

The /api/admin/projects endpoint was paginated (returns {items, total,
limit, offset}) but APIClient.login() still treated the response as a
flat list, raising KeyError on the first projects[0] access. This broke
the documented 'python seed.py data/example-study.json' flow."
```

---

### Task 1.2: Disable retries on eigenvalues 400 + verify error UI

`AnalysisPage` already renders the right amber "too few participants" alert
when the eigenvalues endpoint 400s. The audit observed a 4-second window
where `Loader2` spins because React Query retries the 400 three times by
default. Fix: short-circuit retries for 4xx so the alert appears immediately.

**Files:**
- Modify: `frontend/src/hooks/admin/useAnalysisPage.ts:299-318` (eigenvaluesQuery options)
- Test: `frontend/src/hooks/admin/useAnalysisPage.test.ts` (extend existing)

- [ ] **Step 1: Add a test that the eigenvalues query does not retry on 400**

Append to `frontend/src/hooks/admin/useAnalysisPage.test.ts`:

```typescript
it('does not retry the eigenvalues query on a 4xx response', () => {
    // Inspect the options passed to useGetEigenvaluesApiAdminStudiesSlugAnalysisEigenvaluesGet
    // by spying on it before rendering the hook.
    const mod = require('@/api/generated');
    const spy = vi.spyOn(mod, 'useGetEigenvaluesApiAdminStudiesSlugAnalysisEigenvaluesGet');
    renderHook(() => useAnalysisPage(), { wrapper: makeWrapper('any-slug') });

    const passedOpts = spy.mock.calls[0][1] as { query?: { retry?: unknown } };
    const retry = passedOpts.query?.retry;
    expect(typeof retry).toBe('function');

    // Simulate a 400 response: should not retry.
    const apiError = Object.assign(new Error('bad request'), { status: 400 });
    const fnRetry = retry as (count: number, err: unknown) => boolean;
    expect(fnRetry(0, apiError)).toBe(false);

    // Network/5xx still retries up to React Query's default cap.
    const networkError = new Error('Network');
    expect(fnRetry(0, networkError)).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm run test -- --run useAnalysisPage.test`
Expected: FAIL — current call passes no `retry` option.

- [ ] **Step 3: Patch `useAnalysisPage.ts`**

In `frontend/src/hooks/admin/useAnalysisPage.ts:299`, replace:

```typescript
const eigenvaluesQuery = useGetEigenvaluesApiAdminStudiesSlugAnalysisEigenvaluesGet(slug, {
    query: { enabled: !!slug },
});
```

with:

```typescript
const eigenvaluesQuery = useGetEigenvaluesApiAdminStudiesSlugAnalysisEigenvaluesGet(slug, {
    query: {
        enabled: !!slug,
        retry: (_failureCount, error) => {
            if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
                return false;
            }
            return _failureCount < 2;
        },
    },
});
```

(Imports: `ApiError` is already imported; if not, add `import { ApiError } from '@/api/client';` to match the project's import style.)

- [ ] **Step 4: Run tests + lint**

Run: `cd frontend && npm run test -- --run useAnalysisPage.test && npm run lint`
Expected: PASS, no biome warnings.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/admin/useAnalysisPage.ts frontend/src/hooks/admin/useAnalysisPage.test.ts
git commit -m "fix(analysis): no retry on 4xx eigenvalues responses

React Query was retrying the eigenvalues 400 ('Need at least 2
participants') three times before settling, leaving the spinner up
for 4-9 seconds and emitting four console errors. Skip retries on
4xx so the existing too-few-participants alert renders immediately."
```

---

### Task 1.3: Fix `?reason=session_expired` cold path

`/admin → /login?reason=session_expired` is wrong on a first-time visit (no
prior session). The URL appears because the API mutator unconditionally appends
`reason=session_expired` on any 401. Distinguish "had a token, lost it" from
"never authenticated" using the existing `useAuthStore` token presence.

**Files:**
- Modify: `frontend/src/api/mutator.ts:112-130`
- Modify: `frontend/src/api/client.ts:190-200` (mirror change)
- Test: `frontend/src/api/mutator.session-reason.test.ts` (new)

- [ ] **Step 1: Write the failing test**

```typescript
// frontend/src/api/mutator.session-reason.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/store/authStore';

describe('mutator: 401 redirect reason', () => {
    const originalLocation = window.location;
    beforeEach(() => {
        // @ts-expect-error redefine for test
        delete window.location;
        // @ts-expect-error redefine for test
        window.location = { ...originalLocation, href: '' };
    });
    afterEach(() => {
        // @ts-expect-error restore
        window.location = originalLocation;
        useAuthStore.setState({ token: null });
    });

    it('uses reason=auth_required when there was no prior token', async () => {
        useAuthStore.setState({ token: null });
        // Simulate a 401 from a protected endpoint (helper from mutator test fixtures)
        await simulate401('/api/me');
        expect(window.location.href).toMatch(/reason=auth_required/);
    });

    it('uses reason=session_expired when a token was present', async () => {
        useAuthStore.setState({ token: 'tok' });
        await simulate401('/api/me');
        expect(window.location.href).toMatch(/reason=session_expired/);
    });
});
```

(Note: `simulate401` is a helper to be added in the same file matching the existing mutator test scaffold. If no scaffold exists, use `vi.spyOn(global, 'fetch')` to return a 401 Response and call the mutator directly.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm run test -- --run mutator.session-reason`
Expected: FAIL — current code always uses `reason=session_expired`.

- [ ] **Step 3: Patch `mutator.ts` and `client.ts`**

In `frontend/src/api/mutator.ts:127-129`:

```typescript
if (!window.location.pathname.includes('/login')) {
    const hadToken = useAuthStore.getState().token !== null;
    const reason = hadToken ? 'session_expired' : 'auth_required';
    window.location.href = `/login?reason=${reason}`;
}
```

Make the same change in `frontend/src/api/client.ts:196`. Read the token via `useAuthStore.getState().token` before calling `useAuthStore.getState().logout()` (logout clears it).

- [ ] **Step 4: Surface the cold-path message in the LoginPage**

Edit `frontend/src/pages/LoginPage.tsx`. The existing component reads `?reason=...`; extend the switch to handle `auth_required` (or its absence) with a neutral copy. Add the i18n keys:

`frontend/public/locales/en/translation.json`:
```json
"login.reason.auth_required": "Please sign in to access the admin panel."
```

`frontend/public/locales/fr/translation.json`:
```json
"login.reason.auth_required": "Connectez-vous pour accéder au panneau d'administration."
```

`frontend/public/locales/fi/translation.json`:
```json
"login.reason.auth_required": "Kirjaudu sisään päästäksesi hallintapaneeliin."
```

(Verify keys with `cd frontend && npm run i18n-check`.)

- [ ] **Step 5: Run tests + i18n-check + lint**

Run: `cd frontend && npm run test -- --run mutator.session-reason && npm run i18n-check && npm run lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/api/mutator.ts frontend/src/api/client.ts frontend/src/api/mutator.session-reason.test.ts frontend/src/pages/LoginPage.tsx frontend/public/locales/
git commit -m "fix(auth): use auth_required (not session_expired) for cold-path 401

A first-time visitor going to /admin saw '/login?reason=session_expired'
even though no session ever existed — misleading. Inspect the auth
store before redirecting and pick session_expired vs auth_required
accordingly. LoginPage gains a translation for the new reason."
```

---

### Task 1.4: Filter concourse single-add language picker

Concourse "+ Ajouter un élément" modal lists every ISO language; bulk-import
on the same page correctly defaults to the study's languages. Filter the
single-add modal to the same source of truth.

**Files:**
- Modify: `frontend/src/pages/admin/ConcourseDetailPage.tsx` (the AddItemDialog block — search "Langue" inside the page, locate the SelectContent producing the long list)
- Test: extend `frontend/src/pages/admin/ConcourseDetailPage.test.tsx` (or add `ConcourseDetailPage.add-item.test.tsx` if the existing test file is already large)

Step 0 — discovery: open `ConcourseDetailPage.tsx`, find the "Add item" dialog. The bulk-import dialog reads from `useConcourseDetailPage()` hook which already exposes `availableLanguages` (or similar) sourced from the study config. Reuse it.

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/src/pages/admin/ConcourseDetailPage.add-item.test.tsx
import { describe, expect, it } from 'vitest';
import { renderWithStore, screen, within } from '@/test-utils';
import ConcourseDetailPage from './ConcourseDetailPage';

describe('ConcourseDetailPage AddItem dialog', () => {
    it('only offers the study languages in the language picker', async () => {
        renderWithStore(<ConcourseDetailPage />, {
            // seed: study with languages = ['en', 'fr']
            preloadedStudy: { languages: ['en', 'fr'] },
            preloadedConcourse: { items: [] },
        });
        await screen.findByText(/Ajouter un élément/);
        await userEvent.click(screen.getByRole('button', { name: /Ajouter un élément/ }));
        const dialog = screen.getByRole('dialog');
        const trigger = within(dialog).getByRole('combobox', { name: /Langue/ });
        await userEvent.click(trigger);

        const listbox = screen.getByRole('listbox');
        const options = within(listbox).getAllByRole('option');
        expect(options.map((o) => o.textContent)).toEqual([
            expect.stringMatching(/English|Anglais/),
            expect.stringMatching(/Français|French/),
        ]);
    });
});
```

(Adjust seed-helper names to whatever `renderWithStore` exposes in this codebase; refer to the existing tests for the same page.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm run test -- --run ConcourseDetailPage.add-item`
Expected: FAIL — currently every ISO language is listed.

- [ ] **Step 3: Update the AddItem dialog to consume study languages**

In `ConcourseDetailPage.tsx`, locate the AddItem dialog's language `<Select>`. Replace the hard-coded ISO list with a map over the same `availableLanguages` (or whatever the bulk-import dialog uses). Default-select the first language. Concrete change: replace the `SelectContent` children with:

```tsx
{availableLanguages.map((lang) => (
    <SelectItem key={lang.code} value={lang.code}>
        {lang.label}
    </SelectItem>
))}
```

If the page does not yet expose `availableLanguages` to this dialog, lift it from the bulk-import section to a shared variable inside the page component (no hook change required).

- [ ] **Step 4: Run tests + lint**

Run: `cd frontend && npm run test -- --run ConcourseDetailPage && npm run lint`

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/admin/ConcourseDetailPage.tsx frontend/src/pages/admin/ConcourseDetailPage.add-item.test.tsx
git commit -m "fix(concourse): single-add language picker uses study languages

The 'Add item' modal listed every ISO 639-1 language, while the bulk-
import modal on the same page already filtered to the study's
configured languages. Now both paths read from a single source of truth."
```

---

### Task 1.5: Fix concourse-page header overlap at narrow widths

At ~800–900 px viewport, the "Concours" h1 visually overlaps the right-aligned
toolbar (Exporter CSV / Import en masse / Ajouter un élément). The DOM is
correct; the flex container fails to wrap.

**Files:**
- Modify: `frontend/src/pages/admin/ConcourseDetailPage.tsx` (the page header `<div>` containing both the title and the action group — search for `Concours` h1)

Approach: change the header container from a single non-wrapping flex row to a wrap-capable flex (`flex flex-wrap items-start gap-3 justify-between`) and let the action group keep its own `flex-wrap gap-2`.

- [ ] **Step 1: Add a Playwright responsive smoke test (or Vitest viewport test)**

Pick whichever the project uses. The codebase has Vitest + Playwright; this page already has component tests, so add a Vitest test using `matchMedia` mocking would be brittle. Cleaner: add to `frontend/e2e/concourse-detail.spec.ts` (new):

```typescript
import { test, expect } from '@playwright/test';

test.describe('ConcourseDetailPage header', () => {
    test('header and toolbar do not overlap at 900x800', async ({ page }) => {
        await page.setViewportSize({ width: 900, height: 800 });
        // login + nav helpers from the project's existing e2e harness
        await loginAdmin(page);
        await page.goto('/app/example-project/concourses/1');

        const h1Box = await page.locator('h1', { hasText: 'Concours' }).boundingBox();
        const btnBox = await page.locator('button', { hasText: 'Ajouter un élément' }).boundingBox();
        expect(h1Box).not.toBeNull();
        expect(btnBox).not.toBeNull();
        if (h1Box && btnBox) {
            // Either they wrap (button is below the title) or they fit side-by-side without overlap
            const overlap = !(btnBox.x >= h1Box.x + h1Box.width || btnBox.y >= h1Box.y + h1Box.height);
            expect(overlap).toBe(false);
        }
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && ENVIRONMENT=test npm run e2e -- concourse-detail`
Expected: FAIL — overlap detected at 900×800.

- [ ] **Step 3: Patch the header layout**

Locate the page header in `ConcourseDetailPage.tsx`. Replace the existing header container `className` with:

```tsx
<div className="flex flex-wrap items-start gap-3 justify-between">
    <div className="flex items-center gap-3 min-w-0">{/* icon + h1 */}</div>
    <div className="flex flex-wrap items-center gap-2">{/* Exporter CSV, Import en masse, Ajouter */}</div>
</div>
```

- [ ] **Step 4: Run e2e + lint**

Run: `cd frontend && ENVIRONMENT=test npm run e2e -- concourse-detail && npm run lint`

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/admin/ConcourseDetailPage.tsx frontend/e2e/concourse-detail.spec.ts
git commit -m "fix(concourse): header wraps instead of overlapping toolbar at <1024px

At ~800-900px viewports the page h1 and the right-aligned action
buttons (Exporter CSV / Import en masse / Ajouter un élément) overlapped
because the header used a non-wrap flex row. Switch to wrap-capable
flex; both groups remain coherent. Verified by an e2e smoke at 900x800."
```

---

### Task 1.6: Replace OPEN-Q logo asset

Browser tab says "Qualis", `frontend/public/qualis-logo.svg` renders "OPEN-Q"
glyphs (the rebrand from `.env.before-qualis-rename` was incomplete on the
visual asset). Asset replacement only — no code change.

**Files:**
- Replace: `frontend/public/qualis-logo.svg` (and `frontend/public/favicon.svg` if it shows OPEN-Q too)
- Inspect: `frontend/src/pages/LandingPage.tsx:31` (consumer — should not need to change)

- [ ] **Step 1: Verify the favicon does not also carry the old mark**

Run: `grep -i open frontend/public/favicon.svg | head -5`
Expected: no match. If a match is found, treat the favicon the same way.

- [ ] **Step 2: Replace the logo SVG**

Coordinate with whoever owns brand assets to drop a replacement SVG at
`frontend/public/qualis-logo.svg` matching the canonical Qualis wordmark
(viewBox 0 0 2816 1536 to keep dimensions; SVG must be ASCII). Until that
asset exists, use a placeholder text-only mark:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 280 80">
  <text x="20" y="55" font-family="ui-sans-serif, system-ui, sans-serif" font-size="42" font-weight="700" fill="#0f172a">Qualis</text>
</svg>
```

(Place this in the file *only* if no real asset is available; flag in PR description.)

- [ ] **Step 3: Visual smoke**

Run: `cd frontend && npm run dev` → open `http://localhost:5173/` → confirm the wordmark reads "Qualis".

- [ ] **Step 4: Commit**

```bash
git add frontend/public/qualis-logo.svg frontend/public/favicon.svg
git commit -m "chore(brand): replace OPEN-Q logo with Qualis wordmark

Public landing previously showed OPEN-Q glyphs because the rebrand
(.env.before-qualis-rename → .env) only renamed text references, not
the SVG asset. First-contact for every participant and researcher; UX
audit blocker."
```

---

### Phase 1 finishing touches

- [ ] Run `make ci` from the repo root. Fix anything red.
- [ ] Re-walk the audit checklist: Tasks 1.1–1.6 all addressed.
- [ ] Open a single PR titled "fix(admin): UX audit — Phase 1 (critical)" referencing `.playwright-mcp/ux-audit/REPORT.md` items 1, 2, 3, 5, 6, 7, 9.

---

## Phase 2 — Terminology, clarity, tooltips (one PR)

Polish that removes daily friction. Each task is small; bundle them or split
into 2 sub-PRs based on review bandwidth.

### Task 2.1: Relabel "Q-set 1" badge inside concourse view

The concourse curation banner is labeled "Q-set 1 / 4 éléments". For a
Q-methodologist the term *Q-set* belongs in the study, not the concourse.
Rename to "Curation".

**Files:**
- Modify: `frontend/src/pages/admin/ConcourseDetailPage.tsx` (search for the i18n key carrying "Q-set")
- Modify: `frontend/public/locales/{en,fr,fi}/translation.json` (rename the key value)
- Test: extend an existing `ConcourseDetailPage` test or add a focused one

- [ ] **Step 1: Write the failing test**

```tsx
it('labels the curation panel "Curation", not "Q-set"', async () => {
    renderWithStore(<ConcourseDetailPage />, { /* seed with 4 items */ });
    await screen.findByText(/Curation/);
    expect(screen.queryByText(/Q-set\s+\d/)).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm run test -- --run ConcourseDetailPage`

- [ ] **Step 3: Update the i18n key value**

In each of `en/fr/fi/translation.json`, locate the existing key (search
project for `"Q-set "` followed by numeric placeholder). Replace its value:

- en: `"Curation {{n}} · {{count}} items"` → `"Curation {{n}} · {{count}} items"` (already English) — drop the "Q-set" wording. Use `"Curation #{{n}}"` if there's a separate count key.
- fr: replace `"Q-set {{n}}"` with `"Curation n°{{n}}"`.
- fi: replace with `"Kuratointi #{{n}}"`.

(Verify with `npm run i18n-check`.)

- [ ] **Step 4: Run tests + lint**

Run: `cd frontend && npm run test -- --run ConcourseDetailPage && npm run i18n-check && npm run lint`

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/admin/ConcourseDetailPage.tsx frontend/public/locales/
git commit -m "feat(concourse): rename 'Q-set N' badge to 'Curation N'

Q-methodologists distinguish concourse (universe) from Q-set (curated
sample shown to participants). The badge inside a concourse view
labelled the curation progress 'Q-set 1', conflating the two. Use
'Curation' for the in-concourse panel; 'Q-set' remains the term inside
Study Design where it belongs."
```

---

### Task 2.2: Auto-named concourse derives from study title

Seed/init creates a concourse titled "Concours" (literal type name). Multiple
studies in one project produce multiple concourses all named "Concours".
Derive the title from the study on first creation.

**Files:**
- Modify: `backend/app/services/concourse_service.py` (function that creates the default concourse for a new study — search for "Concours" string)
- Test: `backend/tests/integration/test_concourse_default_name.py` (new)

Step 0 — discovery: `grep -rn '"Concours"' backend/app/`. Likely a one-liner where the new-study handler calls a `create_default_concourse(study)` helper.

- [ ] **Step 1: Write the failing test**

```python
@pytest.mark.asyncio
async def test_default_concourse_uses_study_title(async_client, admin_token):
    # Create a study with a known title, then assert the auto-created
    # concourse picks up that title.
    study = await create_study(async_client, admin_token, title="Telework Views")
    concourses = await list_concourses(async_client, admin_token, project_slug="example-project")
    auto = next(c for c in concourses if c["created_for_study_id"] == study["id"])
    assert auto["title"] == "Telework Views — Concourse"
```

(Adjust to whatever helper signatures the existing integration tests use.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && .venv/bin/pytest tests/integration/test_concourse_default_name.py -v`
Expected: FAIL with `assert "Concours" == "Telework Views — Concourse"`.

- [ ] **Step 3: Update the default-name derivation**

In `backend/app/services/concourse_service.py` (or wherever the default
concourse is created), replace the literal `"Concours"` with:

```python
default_title = f"{study.title} — Concourse" if study.title else "Concourse"
```

If the project's pattern uses i18n on the backend, fall back to a single English
default — researchers will immediately rename it and locale-on-backend is out of
scope.

- [ ] **Step 4: Run tests + lint**

Run: `cd backend && .venv/bin/pytest tests/integration/test_concourse_default_name.py -v && .venv/bin/ruff check app/services/concourse_service.py && .venv/bin/mypy app/services/concourse_service.py`

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/concourse_service.py backend/tests/integration/test_concourse_default_name.py
git commit -m "feat(concourse): derive default title from study

Auto-created concourses were all titled 'Concours', which became
unidentifiable in projects with multiple studies. Default to
'<study title> — Concourse' so the dashboard list is readable."
```

---

### Task 2.3: Bilingual edit-context banner on Study Design

When chrome locale is FR and the language toggle is set to EN, content fields
show EN values without explicit signaling. Researchers risk overwriting the
wrong language.

**Files:**
- Modify: `frontend/src/pages/admin/StudyDesignPage.tsx` (just under the page header, before the tabs)
- Modify: `frontend/src/hooks/admin/useStudyDesignPage.ts` (expose `editingLanguage` + UI locale comparison if not already)
- Test: extend `frontend/src/pages/admin/StudyDesignPage.test.tsx`
- i18n: `frontend/public/locales/{en,fr,fi}/translation.json`

- [ ] **Step 1: Add i18n keys**

```json
"admin.design.editing_language_banner": "You are editing the {{language}} version. Switch with the selector in the toolbar."
```

(en/fr/fi each.)

- [ ] **Step 2: Write the failing test**

```tsx
it('shows the editing-language banner when chrome locale != edited language', async () => {
    renderWithStore(<StudyDesignPage />, {
        chromeLocale: 'fr',
        editingLanguage: 'en',
    });
    expect(
        screen.getByText(/You are editing the EN version|Vous éditez la version EN/),
    ).toBeInTheDocument();
});

it('hides the banner when chrome locale matches edited language', () => {
    renderWithStore(<StudyDesignPage />, {
        chromeLocale: 'fr',
        editingLanguage: 'fr',
    });
    expect(screen.queryByText(/Vous éditez la version|You are editing the/)).toBeNull();
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd frontend && npm run test -- --run StudyDesignPage`

- [ ] **Step 4: Render the banner**

In `StudyDesignPage.tsx`, just inside the main content `<div>` and above the tab list:

```tsx
{api.editingLanguage && api.editingLanguage.toLowerCase() !== i18n.resolvedLanguage?.toLowerCase() && (
    <div className="mb-3 px-3 py-2 rounded-md text-sm bg-amber-50 border border-amber-200 text-amber-900" role="status">
        {t('admin.design.editing_language_banner', {
            language: api.editingLanguage.toUpperCase(),
            defaultValue: 'You are editing the {{language}} version. Switch with the selector in the toolbar.',
        })}
    </div>
)}
```

If `useStudyDesignPage` does not yet expose `editingLanguage`, surface the existing language-toggle value through the hook's return.

- [ ] **Step 5: Run tests + i18n-check + lint**

Run: `cd frontend && npm run test -- --run StudyDesignPage && npm run i18n-check && npm run lint`

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/admin/StudyDesignPage.tsx frontend/src/hooks/admin/useStudyDesignPage.ts frontend/src/pages/admin/StudyDesignPage.test.tsx frontend/public/locales/
git commit -m "feat(design): banner shows current editing language

When the chrome locale (FR) differs from the toggle-selected editing
language (EN), the form fields silently show EN content. Add a clear
amber banner so researchers do not overwrite the wrong-language
version."
```

---

### Task 2.4: Recruitment strategy descriptions visible for all options

The "Stratégie d'accès" combobox shows the description only for the
currently-selected option. Make all three descriptions visible at once when
the dropdown is open so users can compare without trial-selecting.

**Files:**
- Modify: `frontend/src/pages/admin/RecruitmentPage.tsx` (the access-strategy `<Select>` block)
- i18n: keys already exist; reuse them
- Test: extend `frontend/src/pages/admin/RecruitmentPage.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
it('shows all three strategy descriptions in the dropdown', async () => {
    renderWithStore(<RecruitmentPage />, { /* seed... */ });
    await userEvent.click(screen.getByRole('combobox', { name: /Stratégie d'accès/ }));
    const listbox = screen.getByRole('listbox');
    expect(within(listbox).getByText(/Idéal pour les réseaux sociaux/i)).toBeInTheDocument();
    expect(within(listbox).getByText(/Usage unique/i)).toBeInTheDocument();
    expect(within(listbox).getByText(/Capacité limitée/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm run test -- --run RecruitmentPage`

- [ ] **Step 3: Update the SelectItem render**

Wrap each option's text in a `<div>` with the title + description in a smaller second line:

```tsx
<SelectItem value="public">
    <div className="flex flex-col gap-0.5">
        <span className="flex items-center gap-1.5"><Globe className="size-3.5" /> {t('admin.recruitment.strategy.public', 'Public access')}</span>
        <span className="text-xs text-slate-500">{t('admin.recruitment.strategy.public_help', 'Ideal for social media. One link for all with multiple participations possible.')}</span>
    </div>
</SelectItem>
```

(Repeat for `single_use` and `capacity_limited`.)

- [ ] **Step 4: Run tests + lint**

Run: `cd frontend && npm run test -- --run RecruitmentPage && npm run lint`

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/admin/RecruitmentPage.tsx frontend/src/pages/admin/RecruitmentPage.test.tsx
git commit -m "feat(recruitment): inline strategy descriptions in dropdown

Each strategy already has a clear sub-line ('Ideal for social media',
'one-time access', 'capacity-limited'). Show all three at once in the
dropdown so users can compare without trial-selecting each option."
```

---

### Task 2.5: Tooltip sweep

Add `title` attributes (or `<Tooltip>` wrappers where the project already uses
shadcn Tooltip) to a fixed list of opaque controls.

**Files (one task per file):**

#### 2.5a Dashboard study counter

- Modify: `frontend/src/pages/admin/AdminDashboardPage.tsx` (the "1 étude / 0 active / 0 participant" header strip)
- Wrap the `0 active` and `0 participant` spans with shadcn `<Tooltip>` reading e.g. `t('admin.dashboard.counter.active_help', 'Studies currently accepting participants.')`
- Add i18n keys in en/fr/fi
- Test: render the page and assert `getByRole('button', { name: /active/i })` has the expected accessible description (or use `findByLabelText` with the tooltip helper used in other tests)

#### 2.5b Study card sub-actions

- Modify: `frontend/src/components/admin/StudyCard.tsx` (or the dashboard component holding the four buttons Conception/Accès/Données/Analyse)
- Add `title` props with one-line semantics:
  - Conception → "Study design — distribution, conditions of instruction, statements"
  - Accès → "Recruitment links and access rules"
  - Données → "Participant responses and exports"
  - Analyse → "Factor analysis configuration and runs"
- Test: assert each button has a non-empty `title`

#### 2.5c "Tester l'étude" button

- Modify: `frontend/src/pages/admin/StudyDesignPage.tsx`
- Wrap with shadcn `<Tooltip>` reading `"Open a participant preview. Test runs are flagged as is_test_run=true and never count toward your published data."`

#### 2.5d Concourse status mini-pills

- Modify: `frontend/src/pages/admin/ConcourseDetailPage.tsx` (the trio of count pills)
- Add `title="Proposed"`, `title="Accepted"`, `title="Rejected"` (i18n'd)

#### 2.5e Recruitment table headers

- Modify: `frontend/src/pages/admin/RecruitmentPage.tsx` table head row
- Add `<th title="...">` on `Type d'entrée` ("Public, single-use, or capacity-limited") and `Indicateurs` if such a column exists

For each sub-task: write the assertion test, run failing, add the title/Tooltip, run passing, commit with message `feat(admin): add tooltips to <area>`.

- [ ] **Final commit (or per-file commits):** wrap all five tooltip additions

```bash
git add frontend/src/pages/admin/ frontend/src/components/admin/ frontend/public/locales/
git commit -m "feat(admin): tooltip sweep — counters, sub-actions, status pills

Adds explanatory tooltips to the dashboard counters, study sub-actions
(Conception/Accès/Données/Analyse), 'Tester l'étude' button, concourse
status mini-pills, and recruitment table headers. Closes the friction
items in the UX audit's tooltip cluster."
```

---

### Phase 2 finishing touches

- [ ] Run `make ci`.
- [ ] Spot-check at 1024 px and 1440 px in a real browser.
- [ ] Open PR titled "feat(admin): UX audit — Phase 2 (terminology + clarity)" referencing audit items 4, 5 (auto-name), 8, 10 + the Phase-2 strategy-descriptions improvement.

---

## Phase 3 — Methodological depth + GDPR retention (one or two PRs)

Bigger features. Recommended: split each item below into its own PR.

### Task 3.1: Add "Mémo de méthodes" field to Study Design

Mirror the Concourse "Mémo de construction" on Study Design. A markdown text
area where researchers document why their distribution/conditions of
instruction/Q-set size are what they are.

**Files (backend):**
- Migration: `backend/alembic/versions/<new>_add_methodology_memo_to_studies.py` (new)
- Modify: `backend/app/models/study.py` — add `methodology_memo: Mapped[str | None] = mapped_column(Text, nullable=True)`
- Modify: `backend/app/schemas/study.py` — add `methodology_memo: str | None = None` on `StudyRead` / `StudyUpdate`
- Modify: `backend/app/routers/admin/studies.py` if needed (PATCH handler usually accepts a Pydantic update model wholesale — verify it forwards `methodology_memo`)
- Test: extend `backend/tests/integration/test_admin_studies.py`

**Files (frontend):**
- Modify: `frontend/src/hooks/admin/useStudyDesignPage.ts` (add `methodologyMemo` to the editable form state, wire to PATCH)
- Modify: `frontend/src/pages/admin/StudyDesignPage.tsx` (new section under "Aperçu du déroulement", styled like the concourse memo block, with citation prompt)
- Regenerate API: `make generate-api`
- i18n: en/fr/fi keys

#### Steps

- [ ] **Step 1: Write the failing backend test**

```python
@pytest.mark.asyncio
async def test_study_methodology_memo_round_trip(async_client, admin_token):
    study = await create_study(async_client, admin_token, title="X")
    resp = await async_client.patch(
        f"/api/admin/studies/{study['slug']}",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"methodology_memo": "Distribution chosen per Watts & Stenner 2012."},
    )
    assert resp.status_code == 200
    assert resp.json()["methodology_memo"].startswith("Distribution chosen")
```

- [ ] **Step 2: Run test → FAIL**

Run: `cd backend && .venv/bin/pytest tests/integration/test_admin_studies.py::test_study_methodology_memo_round_trip -v`

- [ ] **Step 3: Generate Alembic migration**

```bash
cd backend && .venv/bin/alembic revision --autogenerate -m "add methodology_memo to studies"
```

Review the generated migration: it must contain ONLY `op.add_column('studies', sa.Column('methodology_memo', sa.Text(), nullable=True))` and the corresponding `op.drop_column` in `downgrade()`. Delete any unrelated changes.

- [ ] **Step 4: Run migration in dev DB**

```bash
cd backend && .venv/bin/python scripts/migrate.py
```

- [ ] **Step 5: Add the model column**

Edit `backend/app/models/study.py` — add inside `Study`:

```python
methodology_memo: Mapped[str | None] = mapped_column(Text, nullable=True)
```

- [ ] **Step 6: Add the schema field**

Edit `backend/app/schemas/study.py`. Add `methodology_memo: str | None = None` to:
- `StudyBase` (or the appropriate `StudyUpdate` Pydantic model)
- `StudyRead`

- [ ] **Step 7: Run backend tests**

Run: `cd backend && .venv/bin/pytest tests/integration/test_admin_studies.py -v && .venv/bin/mypy app/`

- [ ] **Step 8: Regenerate API client**

Run: `cd /home/julien/tools/qualis && make generate-api`

- [ ] **Step 9: Add the frontend form field**

Edit `useStudyDesignPage.ts`: include `methodologyMemo` in the form state and wire it to the PATCH payload (`methodology_memo`). Edit `StudyDesignPage.tsx`: add a new card after `Aperçu du déroulement`:

```tsx
<Card>
    <CardHeader>
        <CardTitle>{t('admin.design.methodology_memo.title', 'Methodology memo')}</CardTitle>
        <CardDescription>
            {t(
                'admin.design.methodology_memo.help',
                'Optional. Document why this distribution, these conditions of instruction, this Q-set size. Useful for replication and pre-registration (Watts & Stenner 2012; Sneegas 2020). Leave empty if not relevant.',
            )}
        </CardDescription>
    </CardHeader>
    <CardContent>
        <Textarea
            value={api.methodologyMemo ?? ''}
            onChange={(e) => api.setMethodologyMemo(e.target.value)}
            placeholder={t('admin.design.methodology_memo.placeholder', 'Document the rationale for your design choices…')}
            rows={6}
        />
    </CardContent>
</Card>
```

- [ ] **Step 10: Add i18n keys + run i18n-check + frontend tests + lint**

Add keys to en/fr/fi. Run:
```bash
cd frontend && npm run i18n-check && npm run lint && npm run test -- --run StudyDesignPage
```

- [ ] **Step 11: Commit**

```bash
git add backend/alembic/versions/ backend/app/models/study.py backend/app/schemas/study.py backend/tests/integration/test_admin_studies.py frontend/openapi.json frontend/src/api/generated.ts frontend/src/hooks/admin/useStudyDesignPage.ts frontend/src/pages/admin/StudyDesignPage.tsx frontend/public/locales/
git commit -m "feat(study-design): methodology memo (mirrors concourse memo)

Adds an optional 'Methodology memo' free-text field to studies, modeled
on the existing concourse 'Mémo de construction'. Encourages researchers
to document the rationale behind distribution, conditions of
instruction, and Q-set size — supports replication and pre-registration.
Cites Watts & Stenner 2012 and Sneegas 2020 in the helper text."
```

---

### Task 3.2: Study-level retention policy field driving lifecycle anonymisation default

Lifecycle's "Date seuil" date picker defaults to today (anonymises records
strictly *before* today, i.e. nothing for a fresh study). If the study has a
retention policy (in months), default the threshold to *today − retention*.

**Files (backend):**
- Migration: add `data_retention_months: int | None` to `studies`
- `backend/app/models/study.py`, `backend/app/schemas/study.py`
- Test: extend `backend/tests/integration/test_admin_studies.py`

**Files (frontend):**
- Modify: `frontend/src/pages/admin/GeneralSettingsPage.tsx` or wherever study-level data settings live (search for the term "retention" first; create a new section if not present)
- Modify: `frontend/src/pages/admin/DataLifecyclePage.tsx` — change the date-seuil initial value
- i18n keys

Same step structure as Task 3.1 (test → migration → model → schema → API regen → frontend → commit).

Key UX detail in `DataLifecyclePage`:
```tsx
const defaultThreshold = study.data_retention_months
    ? subMonths(new Date(), study.data_retention_months)
    : new Date();
```

with a small caption next to the date picker:

```tsx
{study.data_retention_months && (
    <p className="text-xs text-slate-500">
        {t('admin.lifecycle.threshold.from_policy', 'Default derived from study retention policy ({{months}} months).', { months: study.data_retention_months })}
    </p>
)}
```

Commit message:
```
feat(lifecycle): retention-policy-aware default for anonymisation date

Studies gain an optional data_retention_months setting; the lifecycle
page's mass-anonymisation date threshold defaults to (today - retention)
instead of today. Closes the GDPR-retention default-correctness gap
flagged in the UX audit.
```

---

### Task 3.3: "Activer l'étude" confirmation dialog

Brouillon → Active is meaningful (recruitment opens). Today it's a one-click
button. Add a confirmation modal listing pre-flight checks already exposed by
the existing `Vérification` rail.

**Files:**
- Modify: `frontend/src/pages/admin/StudyDesignPage.tsx` (the "Activer l'étude" button)
- New: `frontend/src/components/admin/ActivateStudyDialog.tsx`
- Test: `frontend/src/components/admin/ActivateStudyDialog.test.tsx`
- i18n keys

#### Steps

- [ ] **Step 1: Write the failing test**

```tsx
it('cannot confirm activation while any verification item is unchecked', async () => {
    renderWithStore(
        <ActivateStudyDialog
            open
            onOpenChange={vi.fn()}
            verification={{
                title: true,
                consent: true,
                instructions: true,
                statements: false,        // missing
                balanced_grid: true,
            }}
            onConfirm={vi.fn()}
        />,
    );
    const confirm = screen.getByRole('button', { name: /Activate study|Activer/ });
    expect(confirm).toBeDisabled();
});
```

- [ ] **Step 2: Run → FAIL**

- [ ] **Step 3: Implement the dialog**

Use `Dialog` from `@/components/ui/dialog`. Render the verification checklist (read-only icons, mirroring the right-rail), an "I have reviewed the consent text and retention policy" checkbox, and a destructive `Activate` button enabled only when all verification items are true and the checkbox is ticked.

- [ ] **Step 4: Wire the dialog to the existing button**

In `StudyDesignPage.tsx`, change the "Activer l'étude" button's `onClick` to open the dialog. The dialog's `onConfirm` invokes the existing activate mutation.

- [ ] **Step 5: Run tests + i18n-check + lint**

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/admin/ActivateStudyDialog.tsx frontend/src/components/admin/ActivateStudyDialog.test.tsx frontend/src/pages/admin/StudyDesignPage.tsx frontend/public/locales/
git commit -m "feat(study): confirmation dialog before activating a study

Brouillon → Active is a meaningful state change (recruitment becomes
live, public links unlock). Surface the existing Vérification checklist
inside a confirmation dialog, plus a one-checkbox attestation that the
researcher has reviewed consent text and retention policy."
```

---

### Task 3.4: CSV/TSV concourse import

Concourse has an "Exporter CSV" button but "Import en masse" only accepts
pasted text. Researchers with statements coming from NVivo/Atlas.ti expect
CSV/TSV import with `code,text,language` columns.

**Files (frontend):**
- Modify: `frontend/src/pages/admin/ConcourseDetailPage.tsx` — extend the bulk-import dialog with a "Choose file…" button accepting `.csv`/`.tsv`
- New: `frontend/src/utils/parseConcourseCsv.ts` (parser, returns `{ code, text, language }[]` with diagnostics)
- New: `frontend/src/utils/parseConcourseCsv.test.ts` (table tests)

**Files (backend):**
- Likely none. The existing bulk-import endpoint accepts a list of items; CSV is parsed client-side and submitted as the same payload.

#### Steps

- [ ] **Step 1: Write the failing parser tests**

```typescript
import { describe, expect, it } from 'vitest';
import { parseConcourseCsv } from './parseConcourseCsv';

describe('parseConcourseCsv', () => {
    it('parses CSV with code,language,text headers', () => {
        const csv = 'code,language,text\nC1,en,Hello\nC2,fr,Bonjour\n';
        const result = parseConcourseCsv(csv);
        expect(result.errors).toEqual([]);
        expect(result.rows).toEqual([
            { code: 'C1', language: 'en', text: 'Hello' },
            { code: 'C2', language: 'fr', text: 'Bonjour' },
        ]);
    });

    it('parses TSV by detecting tab delimiter', () => {
        const tsv = 'code\tlanguage\ttext\nC1\ten\tHello\n';
        const result = parseConcourseCsv(tsv);
        expect(result.rows).toHaveLength(1);
    });

    it('reports a row error for missing required columns', () => {
        const csv = 'code,language\nC1,en\n';
        const result = parseConcourseCsv(csv);
        expect(result.errors).toEqual([
            expect.stringMatching(/missing.+text/i),
        ]);
    });
});
```

- [ ] **Step 2: Run → FAIL** (`parseConcourseCsv` does not exist yet)

- [ ] **Step 3: Implement the parser**

Use `papaparse` (already a transitive dep — verify with `npm ls papaparse`; if absent, prefer adding `csv-parse/sync` over a hand-rolled parser).

```typescript
// frontend/src/utils/parseConcourseCsv.ts
import Papa from 'papaparse';

export type ParsedRow = { code: string; language: string; text: string };
export type ParseResult = { rows: ParsedRow[]; errors: string[] };

export function parseConcourseCsv(input: string): ParseResult {
    const delim = input.includes('\t') ? '\t' : ',';
    const parsed = Papa.parse<Record<string, string>>(input.trim(), {
        delimiter: delim,
        header: true,
        skipEmptyLines: true,
    });
    const errors: string[] = [];
    const rows: ParsedRow[] = [];
    parsed.data.forEach((r, i) => {
        if (!r.code) errors.push(`row ${i + 1}: missing code`);
        if (!r.language) errors.push(`row ${i + 1}: missing language`);
        if (!r.text) errors.push(`row ${i + 1}: missing text`);
        if (r.code && r.language && r.text) rows.push({ code: r.code, language: r.language, text: r.text });
    });
    return { rows, errors };
}
```

- [ ] **Step 4: Run parser tests → PASS**

- [ ] **Step 5: Wire the file picker into the bulk-import dialog**

In `ConcourseDetailPage.tsx`, add an `<input type="file" accept=".csv,.tsv,text/csv,text/tab-separated-values">` button. On change: read with `FileReader`, call `parseConcourseCsv`, surface row errors in a list, and feed `rows` into the existing payload submission.

- [ ] **Step 6: Run tests + lint + e2e**

- [ ] **Step 7: Commit**

```bash
git add frontend/src/utils/parseConcourseCsv.ts frontend/src/utils/parseConcourseCsv.test.ts frontend/src/pages/admin/ConcourseDetailPage.tsx frontend/public/locales/ frontend/package.json frontend/package-lock.json
git commit -m "feat(concourse): CSV/TSV bulk import

Concourse already had paste-text bulk import; researchers with corpora
exported from NVivo / Atlas.ti expected file-based import with
code,language,text columns. Parser surfaces per-row errors before
submission. Comma and tab delimiters auto-detected."
```

---

### Phase 3 finishing touches

- [ ] Run `make ci`.
- [ ] If you split the phase into per-task PRs, link them with the audit-report items they close.

---

## Phase 4 — Deferred / nice-to-have

These are real findings but with weaker leverage. Track in the backlog; pick up
opportunistically.

- **Correlation matrix view in Analysis page** — P1 wants to see participant
  correlations before factor extraction. Significant new component; depends
  on `analysis_service` exposing the correlation matrix as an endpoint.
- **Language switcher on public login + landing pages** — anglophone users
  see French copy until they login. Lift the existing FR/EN/FI switcher out
  of the post-login shell.
- **Forgot-password / SSO / MFA cue on login** — copy-only nudge; skip until
  the auth flow is touched.
- **Analytics-page "Reset to defaults" CTA** — allows users to revert ACP /
  Varimax / 3-factor tweaks without page reload. Tiny, but unrelated to a
  user-reported pain.
- **In-product Q-methodology glossary** — accessible from the help icon;
  defines concourse, Q-set, conditions of instruction, distribution,
  flagging. Pairs nicely with a future onboarding tour.
- **Step-icon vocabulary on Study Design** — sync the step phase labels
  ("Let's meet" / "First impressions" / "Your perspective" / "Why") with the
  top-tab vocabulary ("Pré-tri / Q-tri / Post-tri") or add Q-canonical
  parentheticals.

---

## Test, lint, and CI gates per phase

Per CLAUDE.md, run between every change:

| Cadence | Command |
|---|---|
| Inner loop, between every commit | `make ci-fast` (~30–90 s) |
| Before pushing each phase PR | `make ci` (~3–5 min) |
| When the change touches admin flows | `make e2e` |
| When backend schemas/routes change | `make generate-api` then `make check-api` |

---

## Order of execution

```
Phase 1 (PR #1) — 1 day
  ├── 1.1 seed.py paginated bug
  ├── 1.2 eigenvalues retry
  ├── 1.3 session_expired cold path
  ├── 1.4 single-add language picker
  ├── 1.5 concourse header overlap
  └── 1.6 Qualis logo asset

Phase 2 (PR #2) — 1–2 days
  ├── 2.1 Q-set 1 → Curation
  ├── 2.2 default concourse name from study title
  ├── 2.3 bilingual edit-context banner
  ├── 2.4 strategy descriptions visible
  └── 2.5 tooltip sweep (5 sub-tasks)

Phase 3 (PRs #3, #4, #5, #6 — one per task) — 2–3 days total
  ├── 3.1 study methodology memo (one PR)
  ├── 3.2 retention policy field (one PR)
  ├── 3.3 activation confirmation dialog (one PR)
  └── 3.4 CSV/TSV concourse import (one PR)

Phase 4 — backlog
```

---

## Self-review checklist

| Audit-report item | Plan task |
|---|---|
| 1. Brand identity mismatch | Task 1.6 |
| 2. Header overlap on concourse | Task 1.5 |
| 3. Single-add language picker shows all ISO langs | Task 1.4 |
| 4. "Q-set 1" terminology in concourse | Task 2.1 |
| 5. Auto-named "Concours" | Task 2.2 |
| 6. Eigenvalues 400 not surfaced | Task 1.2 |
| 7. session_expired on cold path | Task 1.3 |
| 8. Bilingual edit context unclear | Task 2.3 |
| 9. seed.py paginated bug | Task 1.1 |
| 10. Tooltip sweep | Task 2.5 |
| 11. No CSV import | Task 3.4 |
| 12. No methodological memo on Study Design | Task 3.1 |
| 13a. Anonymisation date default | Task 3.2 |
| 13b. Step-icon vocabulary | Phase 4 |
| 13c. Recruitment strategy descriptions | Task 2.4 |
| 13d. Public-login language switcher | Phase 4 |
| 13e. Forgot password / SSO / MFA cue | Phase 4 |
| 13f. "Q-set vs concourse" glossary | Phase 4 |
| Activer l'étude one-click | Task 3.3 |

All findings have a target task or are explicitly deferred.

---

## Notes on style

- This plan follows the project's house style (e.g. `2026-04-27-settings-ia-polish.md`): pragmatic, terse-but-explicit, concrete file paths, commit-message templates.
- TDD discipline is per-task — write the failing test, then the impl. For pure UI cosmetic changes (Task 1.6, parts of 2.5), a visual smoke + accessibility assertion replaces a unit test.
- Each phase ships a single PR (or a small handful for Phase 3) so review stays bounded.
