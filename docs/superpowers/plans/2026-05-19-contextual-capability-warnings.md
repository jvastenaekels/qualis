# Contextual-only Capability Warnings — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete the global admin capability-banner chrome and surface absent-capability warnings only at each feature's point of use (S3/SMTP contextual notes already exist; add one email-manual note in Admin → Users).

**Architecture:** Pure removal of the `CapabilityBanner*` system + its `AdminLayout` wiring and i18n keys, plus one small conditional note in `AdminUsersPage` driven by the existing `usePlatformConfigStore.isEmailManual()`. The `/api/config` capability signal and all other contextual surfaces stay unchanged.

**Tech Stack:** React 19 + TS + Zustand + react-i18next; Vitest. Frontend-only; no backend change.

---

## Verified codebase facts (ground truth — read before any task)

- **AdminLayout** `frontend/src/layouts/AdminLayout.tsx`:
  - Lines **15–19** are the banner imports: a multi-line
    `import { CapabilityBannerStack, CapabilityBannerChip } from '@/components/admin/CapabilityBannerStack';`
    (lines 15–18) followed by
    `import { useCapabilityBanners } from '@/hooks/admin/useCapabilityBanners';` (line 19).
    Line 14 is `import { useAuthStore } from '@/store/useAuthStore';`; line 20 is
    `import { Outlet, useLocation } from 'react-router-dom';`.
  - Line **33**: `const { capabilities, collapsed, setCollapsed, count } = useCapabilityBanners();`
  - JSX block 1 (inside `<SidebarInset>`, immediately before `<header>`):
    ```tsx
                {!collapsed && (
                    <CapabilityBannerStack
                        capabilities={capabilities}
                        onCollapse={() => setCollapsed(true)}
                    />
                )}
    ```
  - The `<header>` className currently contains an added ` gap-2`. Current:
    `className="flex h-16 shrink-0 items-center justify-between gap-2 border-b px-4 transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12 min-w-0 overflow-hidden"`.
    Pre-capability-banners original (verified at `092215f8~1`) is identical **without** ` gap-2`.
  - JSX block 2 (inside `<header>`, after the breadcrumb `</div>`, before `</header>`):
    ```tsx
                    {collapsed && count > 0 && (
                        <div className="flex items-center px-4 shrink-0">
                            <CapabilityBannerChip
                                count={count}
                                onExpand={() => setCollapsed(false)}
                            />
                        </div>
                    )}
    ```
- **Files to delete** (all exist; no other importers after AdminLayout is stripped):
  `frontend/src/components/admin/CapabilityBanner.tsx`,
  `frontend/src/components/admin/CapabilityBanner.test.tsx`,
  `frontend/src/components/admin/CapabilityBannerStack.tsx`,
  `frontend/src/components/admin/CapabilityBannerStack.test.tsx`,
  `frontend/src/hooks/admin/useCapabilityBanners.ts`,
  `frontend/src/hooks/admin/useCapabilityBanners.test.ts`,
  `frontend/src/layouts/AdminLayout.capability.test.tsx`.
- **i18n** `frontend/public/locales/en/admin.json`: line 106 `"admin": {`, lines **107–114** are the entire `"capability_banner": { … },` object, line 115 `"hub": {`. Deleting 107–114 leaves `"admin": {` directly followed by `"hub": {` (valid JSON, no dangling comma). The `"users"` object starts at line **2200**; `"title"` line 2201, `"subtitle"` line 2202.
- **AdminUsersPage** `frontend/src/pages/admin/AdminUsersPage.tsx`: imports `useState` (16), `useTranslation` (17); component has `const { t } = useTranslation();` (130) and destructures `useAdminUsersPage()` (135–145). It does **not** import `usePlatformConfigStore`. The render `return (` is line 202; `<StudyPageHeader … />` spans 204–210; the `{mutationError != null && (` Alert block starts line 212. The contextual note goes between `</StudyPageHeader>`-close (line 210) and the `mutationError` block (line 212).
- Store: `usePlatformConfigStore((s) => s.isEmailManual())` → `true` when `emailDelivery === 'manual'` (tests set it via `usePlatformConfigStore.setState({ emailDelivery, audioStorage })`). Component test helper: `renderWithStore` from `@/test-utils/renderWithStore`.
- **Surviving contextual surfaces — do NOT touch:** `PostSortConfigEditor.tsx` audio note, `PasswordResetRequestPage.tsx` `request_success_manual`, `AccountSettingsPage` 2FA gating, `usePlatformConfigStore`/`usePlatformConfigBootstrap`/`/api/config`, backend `smtp_mode`/`storage_mode`/`/docs`.
- Gates: full `make ci` capturing real `MAKE_CI_EXIT` (no pipe masking). Run `npx biome check` on touched files before the final gate (per the per-task-verification-skips-formatter lesson). Frontend-only → no vulture/mypy/security-suite impact.
- No pre-existing unrelated worktree WIP this time (tree was clean at branch creation); still use scoped `git add` of explicit paths.

---

### Task 1: Add the contextual email-manual note in Admin → Users

**Files:**
- Modify: `frontend/public/locales/en/admin.json` (add key under `admin.users`)
- Modify: `frontend/src/pages/admin/AdminUsersPage.tsx`
- Test: `frontend/src/pages/admin/AdminUsersPage.emailManual.test.tsx` (create)

- [ ] **Step 1: Write the failing test**

Create `frontend/src/pages/admin/AdminUsersPage.emailManual.test.tsx`:

```tsx
import { describe, expect, it, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithStore } from '@/test-utils/renderWithStore';
import { MemoryRouter } from 'react-router-dom';
import AdminUsersPage from './AdminUsersPage';
import { usePlatformConfigStore } from '@/store/usePlatformConfigStore';

function renderPage() {
    return renderWithStore(
        <MemoryRouter>
            <AdminUsersPage />
        </MemoryRouter>
    );
}

describe('AdminUsersPage — email-manual contextual note', () => {
    beforeEach(() => {
        usePlatformConfigStore.setState({ emailDelivery: 'smtp', audioStorage: 'available' });
    });

    it('is absent when email delivery is configured (smtp)', () => {
        renderPage();
        expect(screen.queryByText(/Email delivery is not configured/i)).not.toBeInTheDocument();
    });

    it('is shown when email delivery is manual', () => {
        usePlatformConfigStore.setState({ emailDelivery: 'manual', audioStorage: 'available' });
        renderPage();
        expect(screen.getByText(/Email delivery is not configured/i)).toBeInTheDocument();
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/pages/admin/AdminUsersPage.emailManual.test.tsx`
Expected: the second test FAILS — no such note rendered yet (first test passes vacuously).

- [ ] **Step 3: Add the i18n key**

In `frontend/public/locales/en/admin.json`, inside the `"users"` object, immediately after the `"subtitle"` line (line 2202) add:

```json
            "email_manual_note": "Email delivery is not configured. Use the password-reset link and set-email actions below for account recovery — no email is sent.",
```

(Keep valid JSON: the preceding `"subtitle": "…",` line already ends with a comma; the new line ends with a comma; `"error_title"` follows.)

- [ ] **Step 4: Wire the note into AdminUsersPage**

In `frontend/src/pages/admin/AdminUsersPage.tsx`:

(a) Add the store import grouped with the other `@/` imports near the top (after the `useTranslation` import line):

```tsx
import { usePlatformConfigStore } from '@/store/usePlatformConfigStore';
```

(b) Inside the component, right after `const { t } = useTranslation();` (line 130), add:

```tsx
    const isEmailManual = usePlatformConfigStore((s) => s.isEmailManual());
```

(c) Between the `<StudyPageHeader … />` closing (line 210) and the `{mutationError != null && (` block (line 212), insert:

```tsx
            {isEmailManual && (
                <div
                    role="status"
                    className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800"
                >
                    {t(
                        'admin.users.email_manual_note',
                        'Email delivery is not configured. Use the password-reset link and set-email actions below for account recovery — no email is sent.'
                    )}
                </div>
            )}
```

The fallback string MUST be byte-identical to the `en/admin.json` value from Step 3.

- [ ] **Step 5: Run test + i18n + type-check**

Run: `cd frontend && npx vitest run src/pages/admin/AdminUsersPage.emailManual.test.tsx && npm run type-check && npm run i18n-check`
Expected: 2 passed; type-check clean; i18n-check exit 0 (admin best-effort).

Verify byte-identity:
Run: `cd /home/julien/tools/qualis && python3 -c "import json; u=json.load(open('frontend/public/locales/en/admin.json'))['admin']['users']; src=open('frontend/src/pages/admin/AdminUsersPage.tsx').read(); print('match:', u['email_manual_note'] in src)"`
Expected: `match: True`

- [ ] **Step 6: Commit**

```bash
cd /home/julien/tools/qualis
git add frontend/public/locales/en/admin.json frontend/src/pages/admin/AdminUsersPage.tsx frontend/src/pages/admin/AdminUsersPage.emailManual.test.tsx
git commit -m "$(cat <<'EOF'
feat(admin): contextual email-manual note in Admin > Users

Shown only when email delivery is manual, beside the recovery actions
it refers to. Replaces the discoverability the global banner provided.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Delete the global capability-banner system + strip AdminLayout

**Files:**
- Delete: the 7 banner files listed in Verified facts
- Modify: `frontend/src/layouts/AdminLayout.tsx`
- Modify: `frontend/public/locales/en/admin.json` (remove `capability_banner`)

- [ ] **Step 1: Delete the seven files**

```bash
cd /home/julien/tools/qualis
git rm frontend/src/components/admin/CapabilityBanner.tsx \
       frontend/src/components/admin/CapabilityBanner.test.tsx \
       frontend/src/components/admin/CapabilityBannerStack.tsx \
       frontend/src/components/admin/CapabilityBannerStack.test.tsx \
       frontend/src/hooks/admin/useCapabilityBanners.ts \
       frontend/src/hooks/admin/useCapabilityBanners.test.ts \
       frontend/src/layouts/AdminLayout.capability.test.tsx
```

- [ ] **Step 2: Remove the banner imports from AdminLayout**

In `frontend/src/layouts/AdminLayout.tsx`, delete lines 15–19 — exactly this block:

```tsx
import {
    CapabilityBannerStack,
    CapabilityBannerChip,
} from '@/components/admin/CapabilityBannerStack';
import { useCapabilityBanners } from '@/hooks/admin/useCapabilityBanners';
```

(Line 14 `import { useAuthStore } …` and line 20 `import { Outlet, useLocation } …` remain adjacent.)

- [ ] **Step 3: Remove the hook call**

Delete this line (was line 33):

```tsx
    const { capabilities, collapsed, setCollapsed, count } = useCapabilityBanners();
```

- [ ] **Step 4: Remove JSX block 1 + revert the header className**

Delete this block (inside `<SidebarInset>`, before `<header>`):

```tsx
                {!collapsed && (
                    <CapabilityBannerStack
                        capabilities={capabilities}
                        onCollapse={() => setCollapsed(true)}
                    />
                )}
```

Then change the `<header>` line — remove the ` gap-2` token so it reads exactly:

```tsx
                <header className="flex h-16 shrink-0 items-center justify-between border-b px-4 transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12 min-w-0 overflow-hidden">
```

- [ ] **Step 5: Remove JSX block 2**

Delete this block (inside `<header>`, after the breadcrumb container `</div>`, before `</header>`):

```tsx
                    {collapsed && count > 0 && (
                        <div className="flex items-center px-4 shrink-0">
                            <CapabilityBannerChip
                                count={count}
                                onExpand={() => setCollapsed(false)}
                            />
                        </div>
                    )}
```

- [ ] **Step 6: Remove the i18n keys**

In `frontend/public/locales/en/admin.json`, delete the entire `"capability_banner": { … },` object (lines 107–114), leaving `"admin": {` immediately followed by `"hub": {`.

- [ ] **Step 7: Verify removal is clean**

Run, from `/home/julien/tools/qualis`:

```bash
grep -rn "CapabilityBanner\|useCapabilityBanners\|capability_banner" frontend/src frontend/public/locales/en/admin.json
```
Expected: **no output** (exit 1).

Run: `cd frontend && npm run type-check`
Expected: clean (no unresolved imports / unused symbols in `AdminLayout.tsx`).

Run: `cd frontend && npx biome check src/layouts/AdminLayout.tsx`
Expected: no errors (no unused import / dangling refs). If biome reports a format-only diff on `AdminLayout.tsx`, run `npx biome check --write src/layouts/AdminLayout.tsx` and re-run type-check.

Run: `cd frontend && npm run i18n-check`
Expected: exit 0, no ERROR about a missing/dangling key.

- [ ] **Step 8: Run the surviving regression tests**

Run:
```bash
cd frontend && npx vitest run \
  src/pages/admin/AdminUsersPage \
  src/components/postsort/Step2_Questionnaire.audio-storage.test.tsx \
  src/store/usePlatformConfigStore.test.ts \
  src/components/RouteErrorBoundary.helpers.test.ts
```
Expected: all passed (the contextual surfaces and store are unaffected; no banner test remains).

- [ ] **Step 9: Commit**

```bash
cd /home/julien/tools/qualis
git add frontend/src/layouts/AdminLayout.tsx frontend/public/locales/en/admin.json
git commit -m "$(cat <<'EOF'
refactor(admin): remove global capability-banner chrome

Deletes CapabilityBanner/Stack/Chip, useCapabilityBanners, their tests
and i18n keys; strips the AdminLayout wiring and reverts the chip-only
header gap. Absent-capability warnings are now contextual only
(Admin > Users note, study-design audio note, forgot-password copy).
The /api/config capability signal and store are retained — the
contextual surfaces depend on them.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Full quality gate

**Files:** none (verification + any fix-ups)

- [ ] **Step 1: Run the full CI gate**

Run: `cd /home/julien/tools/qualis && make ci > /tmp/ccw_ci.log 2>&1; echo "MAKE_CI_EXIT=$?" >> /tmp/ccw_ci.log; echo done`
Then read the real result: `grep -n "MAKE_CI_EXIT=" /tmp/ccw_ci.log` and the test summary.
Expected: `MAKE_CI_EXIT=0`. **Do not trust any wrapper/pipe exit — read the `MAKE_CI_EXIT=` line and the backend/frontend `passed` summary explicitly.**

- [ ] **Step 2: Triage if red**

- A `Cannot find module '@/components/admin/CapabilityBannerStack'` (or `useCapabilityBanners`) → a reference was missed; re-run the Step-7 grep from Task 2 and remove the straggler.
- A frontend test failure naming a deleted banner test → a `git rm` was missed; remove it.
- biome/format on a touched file → `npx biome check --write <file>` (scoped to the touched file only), re-run.
- i18n ERROR → a `capability_banner` reference remains; grep and remove.

- [ ] **Step 3: Commit any fix-ups**

```bash
cd /home/julien/tools/qualis
git add -A
git commit -m "$(cat <<'EOF'
chore(contextual-warnings): final quality-gate fix-ups

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

(Skip if `make ci` was green with no changes.)

- [ ] **Step 4: Report**

State explicitly: real `MAKE_CI_EXIT=` value, backend/frontend test counts, `git log --oneline main..HEAD`, `git status --short` (expect clean), and that the branch is ready for `finishing-a-development-branch`.

---

## Self-review

**Spec coverage:**
- Remove banner system (components/hook/tests/AdminLayout wiring/i18n/gap-2) → Task 2 (Steps 1–6), grep-clean invariant Step 7. ✓
- Keep contextual surfaces unchanged → not modified by any task; Task 2 Step 8 runs them as regression guards. ✓
- Add Admin → Users email-manual note (only when `isEmailManual()`, point-of-use, amber `role="status"`) → Task 1. ✓
- Keep `/api/config`/store/bootstrap/startup-logs/`/docs` → untouched (explicit in Verified facts). ✓
- Testing: note absent/present test (Task 1), regression set + grep-clean + type/i18n (Task 2), full `make ci` real-exit (Task 3). ✓

**Placeholder scan:** every step has exact paths, literal code/JSON, exact commands + expected output. No TBD/"similar to". ✓

**Type/name consistency:** `usePlatformConfigStore((s) => s.isEmailManual())` and key `admin.users.email_manual_note` used identically in Task 1 test, i18n, and component; the 7 delete paths in Task 2 Step 1 match the Verified-facts list and the grep invariant (Step 7); header className revert string matches the verified `092215f8~1` original (no `gap-2`). ✓
