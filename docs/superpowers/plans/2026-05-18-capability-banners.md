# Capability Banners — clarity & behaviour redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the inconsistent SMTP-only admin banner with a shared, professional, collapse-to-chip capability-banner system at parity for SMTP and S3, served-doc links, and aligned startup-log wording.

**Architecture:** A pure logic hook (`useCapabilityBanners`) derives the active degraded-capability list from the existing `usePlatformConfigStore` flags and owns collapse state (localStorage, signature-reset). `AdminLayout` is the single hook call site and composition point: it renders `CapabilityBannerStack` (expanded, above the header) or `CapabilityBannerChip` (collapsed, in the header's right cluster). A backend `StaticFiles` mount serves the repo `docs/` so the `View guide` links resolve. SMTP/S3 stay separate rows.

**Tech Stack:** React 19 + TS + Zustand + react-i18next (frontend); FastAPI `StaticFiles` (backend); Vitest + pytest.

---

## Verified codebase facts (ground truth — read before any task)

- **AdminLayout** `frontend/src/layouts/AdminLayout.tsx`: imports `usePlatformConfigStore` (line ~14), `useTranslation` (line ~19), `cn` (line ~20). `const isEmailManual = usePlatformConfigStore((s) => s.isEmailManual());` at line ~28. The standalone SMTP banner is the block `{isEmailManual && ( <div role="status" className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-center text-xs font-medium text-amber-800"> {t('admin.smtp_banner.manual', '…')} </div> )}` at lines ~75-85, inside `<SidebarInset>` immediately before `<header className="flex h-16 …">` (line ~86). The `<header>` is `flex … justify-between …` with a single left child `<div className="flex items-center gap-2 px-4 min-w-0 flex-1">…breadcrumb…</div>` and closes `</header>` at line ~137 — its right side is currently empty (justify-between has nothing on the right).
- **Store** `frontend/src/store/usePlatformConfigStore.ts`: `isEmailManual()` → `emailDelivery === 'manual'`; `isAudioStorageAvailable()` → `audioStorage !== 'unavailable'`. Tests set state via `usePlatformConfigStore.setState({ emailDelivery, audioStorage })`.
- **Hook-driven convention**: logic hooks live in `frontend/src/hooks/admin/use<Name>.ts` with a sibling `use<Name>.test.ts`; tests use `renderHook` + `AllTheProviders` from `@/test-utils/test-utils` (see `useAdminDashboard.test.ts`).
- **Component test helper**: `renderWithStore` from `@/test-utils/renderWithStore`.
- **i18n**: keys in `frontend/public/locales/en/admin.json`; the `admin` object starts at the `"admin": {` line, first child `"smtp_banner": { "manual": "…" }`. Use `t('key', 'English fallback')`, fallback byte-identical to JSON. `npm run i18n-check`, `npm run check-interpolations` (for `{{n}}`), `npm run type-check` (`tsc -b`).
- **spa.py** `backend/app/middleware/spa.py`: `_ROOT_DIR` = project root (already defined, line ~20). `FRONTEND_DIST = os.path.join(_ROOT_DIR, "frontend", "dist")`. `mount_spa(app)` (line ~36): first statement is `if not os.path.exists(FRONTEND_DIST): @app.get("/") read_root; return`; then `app.mount("/assets", StaticFiles(...))`; then the `@app.get("/{full_path:path}")` SPA catch-all. `app.middleware.spa` is in the mypy strict-overrides list.
- **Startup helpers**: `backend/app/utils/smtp_mode.py::smtp_mode_banner_lines(*, smtp_configured: bool) -> list[str]`; `backend/app/utils/storage_mode.py::storage_mode_banner_lines(*, s3_configured: bool) -> list[str]`. Unit tests: `backend/tests/unit/test_smtp_mode.py`, `backend/tests/unit/test_storage_mode.py`. Backend venv: `cd backend && uv run …`.
- **Worktree note**: `frontend/src/components/admin/designer/QSortEditor.tsx` and `QSortEditor.test.tsx` carry unrelated pre-existing uncommitted WIP. NEVER touch/stage/commit/revert them. Every task uses scoped `git add` of explicit paths only.
- Inner loop: `make ci-fast` (~38s). Frontend single test: `cd frontend && npx vitest run <path>`. Backend: `cd backend && uv run pytest <path> -q`.

---

### Task 1: Backend — serve `docs/` as static at `/docs`

**Files:**
- Modify: `backend/app/middleware/spa.py`
- Test: `backend/tests/integration/test_docs_static.py` (create)

- [ ] **Step 1: Write the failing test**

Create `backend/tests/integration/test_docs_static.py`:

```python
"""The repo docs/ directory is served statically so in-app guide links resolve."""

import pytest


@pytest.mark.asyncio
async def test_running_without_smtp_guide_served(client):
    r = await client.get("/docs/guides/running-without-smtp.md")
    assert r.status_code == 200
    assert "Running Qualis without SMTP" in r.text


@pytest.mark.asyncio
async def test_running_without_s3_guide_served(client):
    r = await client.get("/docs/guides/running-without-s3.md")
    assert r.status_code == 200
    assert "Running Qualis without S3" in r.text
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/integration/test_docs_static.py -q`
Expected: FAIL — 404 (no `/docs` mount yet; the SPA catch-all returns index/404).

- [ ] **Step 3: Add the docs mount**

In `backend/app/middleware/spa.py`, after the `FRONTEND_DIST = …` line near the top (module scope, next to the other path constants), add:

```python
DOCS_DIR = os.path.join(_ROOT_DIR, "docs")
```

Then, inside `def mount_spa(app: FastAPI) -> None:`, make the **first statements of the function body** (before the existing `if not os.path.exists(FRONTEND_DIST):` guard) :

```python
    # Serve the repo docs/ as static files so in-app guide links resolve
    # (e.g. the capability banners' "View guide"). Independent of the
    # frontend build; guarded so a packaging without docs/ degrades to a
    # 404 link rather than a crash. Registered before the SPA catch-all so
    # /docs/* is never swallowed by the client-side-routing fallback.
    if os.path.isdir(DOCS_DIR):
        app.mount("/docs", StaticFiles(directory=DOCS_DIR), name="docs")
```

(`StaticFiles` and `os` are already imported in this file. Do not modify the existing `serve_spa` type-ignore or any other line.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/integration/test_docs_static.py -q`
Expected: PASS (2 passed).

- [ ] **Step 5: Type-check the strict module**

Run: `cd backend && uv run mypy app/middleware/spa.py`
Expected: `Success: no issues found` (the two added lines introduce no `Any`).

- [ ] **Step 6: Commit**

```bash
cd /home/julien/tools/qualis
git add backend/app/middleware/spa.py backend/tests/integration/test_docs_static.py
git commit -m "$(cat <<'EOF'
feat(spa): serve repo docs/ statically at /docs

So in-app guide links (capability banners) resolve. Guarded on dir
existence, registered before the SPA catch-all, independent of the
frontend build.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Backend — align startup-log first lines

**Files:**
- Modify: `backend/app/utils/smtp_mode.py`
- Modify: `backend/app/utils/storage_mode.py`
- Test: `backend/tests/unit/test_smtp_mode.py`, `backend/tests/unit/test_storage_mode.py`

- [ ] **Step 1: Update the failing tests first (assert new wording)**

Replace the body of `backend/tests/unit/test_smtp_mode.py` with:

```python
from app.utils.smtp_mode import smtp_mode_banner_lines


def test_banner_lists_manual_consequences():
    lines = smtp_mode_banner_lines(smtp_configured=False)
    joined = "\n".join(lines)
    assert "Email delivery is not configured" in joined
    assert "email-optional mode" in joined
    assert "recovery link" in joined.lower()
    assert "docs/guides/running-without-smtp.md" in joined
    assert any("admin" in line.lower() for line in lines)


def test_banner_empty_when_smtp_configured():
    assert smtp_mode_banner_lines(smtp_configured=True) == []
```

Replace the body of `backend/tests/unit/test_storage_mode.py` with:

```python
from app.utils.storage_mode import storage_mode_banner_lines


def test_banner_empty_when_s3_configured():
    assert storage_mode_banner_lines(s3_configured=True) == []


def test_banner_lists_consequences_when_s3_absent():
    lines = storage_mode_banner_lines(s3_configured=False)
    joined = "\n".join(lines)
    assert "Object storage is not configured" in joined
    assert "storage-optional mode" in joined
    assert "text-only" in joined.lower()
    assert "docs/guides/running-without-s3.md" in joined
    assert "S3_BUCKET_NAME" in joined
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && uv run pytest tests/unit/test_smtp_mode.py tests/unit/test_storage_mode.py -q`
Expected: FAIL — current first lines are `"SMTP is not configured — Qualis runs in EMAIL-OPTIONAL mode."` / `"Object storage (S3) is not configured — Qualis runs in STORAGE-OPTIONAL mode."`, so `"Email delivery is not configured"` / `"Object storage is not configured"` / `"email-optional mode"` / `"storage-optional mode"` are absent.

- [ ] **Step 3: Update the first line in each helper**

In `backend/app/utils/smtp_mode.py`, change only the first list element from:

```python
        "SMTP is not configured — Qualis runs in EMAIL-OPTIONAL mode.",
```
to:
```python
        "Email delivery is not configured. Qualis is running in email-optional mode.",
```

In `backend/app/utils/storage_mode.py`, change only the first list element from:

```python
        "Object storage (S3) is not configured — Qualis runs in STORAGE-OPTIONAL mode.",
```
to:
```python
        "Object storage is not configured. Qualis is running in storage-optional mode.",
```

(Leave every other line in both helpers and both `-> list[str]` signatures unchanged.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && uv run pytest tests/unit/test_smtp_mode.py tests/unit/test_storage_mode.py -q`
Expected: PASS (4 passed).

- [ ] **Step 5: Commit**

```bash
cd /home/julien/tools/qualis
git add backend/app/utils/smtp_mode.py backend/app/utils/storage_mode.py backend/tests/unit/test_smtp_mode.py backend/tests/unit/test_storage_mode.py
git commit -m "$(cat <<'EOF'
refactor(startup): align SMTP/S3 banner first lines (professional register)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: i18n strings for the capability banners

**Files:**
- Modify: `frontend/public/locales/en/admin.json`

- [ ] **Step 1: Add the keys**

In `frontend/public/locales/en/admin.json`, locate the existing `"smtp_banner": { "manual": "…" }` object (first child of `"admin"`). Add a new sibling key `"capability_banner"` immediately after the `"smtp_banner"` object (keep `smtp_banner` itself — it is removed in Task 7's code change but the key removal is deferred to avoid an orphaned-key i18n failure mid-plan; Task 7 removes it). Insert:

```json
        "capability_banner": {
            "smtp": "Email delivery is not configured. Account recovery (password reset, email change, email-based two-factor authentication) requires manual administrator action.",
            "s3": "Object storage is not configured. Audio responses cannot be collected; audio-enabled studies fall back to text-only responses.",
            "view_guide": "View guide",
            "collapse": "Hide",
            "chip_count": "Reduced functionality ({{n}})",
            "chip_tooltip": "Some platform capabilities are unavailable. Click for details."
        },
```

- [ ] **Step 2: Verify JSON + interpolation parity**

Run: `cd frontend && npm run i18n-check && npm run check-interpolations`
Expected: no ERROR (admin best-effort; the new `{{n}}` in `chip_count` must be consistent — it only exists in `en` so far, which is allowed). If `check-interpolations` complains about `{{n}}` missing in other locales, that is the expected admin-best-effort warning, not an error — confirm exit code 0.

- [ ] **Step 3: Commit**

```bash
cd /home/julien/tools/qualis
git add frontend/public/locales/en/admin.json
git commit -m "$(cat <<'EOF'
feat(i18n): capability-banner strings (professional register)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: `useCapabilityBanners` hook (pure logic + persistence)

**Files:**
- Create: `frontend/src/hooks/admin/useCapabilityBanners.ts`
- Test: `frontend/src/hooks/admin/useCapabilityBanners.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `frontend/src/hooks/admin/useCapabilityBanners.test.ts`:

```typescript
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { AllTheProviders } from '@/test-utils/test-utils';
import { usePlatformConfigStore } from '@/store/usePlatformConfigStore';
import { useCapabilityBanners, CAPABILITY_BANNERS_STORAGE_KEY } from './useCapabilityBanners';

function setPlatform(emailDelivery: 'smtp' | 'manual' | null, audioStorage: 'available' | 'unavailable' | null) {
    usePlatformConfigStore.setState({ emailDelivery, audioStorage });
}

describe('useCapabilityBanners', () => {
    beforeEach(() => {
        localStorage.clear();
        setPlatform('smtp', 'available');
    });

    it('no degraded capability → empty, count 0', () => {
        const { result } = renderHook(() => useCapabilityBanners(), { wrapper: AllTheProviders });
        expect(result.current.capabilities).toEqual([]);
        expect(result.current.count).toBe(0);
    });

    it('smtp manual only → [smtp]', () => {
        setPlatform('manual', 'available');
        const { result } = renderHook(() => useCapabilityBanners(), { wrapper: AllTheProviders });
        expect(result.current.capabilities.map((c) => c.id)).toEqual(['smtp']);
        expect(result.current.count).toBe(1);
    });

    it('s3 unavailable only → [s3]', () => {
        setPlatform('smtp', 'unavailable');
        const { result } = renderHook(() => useCapabilityBanners(), { wrapper: AllTheProviders });
        expect(result.current.capabilities.map((c) => c.id)).toEqual(['s3']);
    });

    it('both degraded → stable order [smtp, s3]', () => {
        setPlatform('manual', 'unavailable');
        const { result } = renderHook(() => useCapabilityBanners(), { wrapper: AllTheProviders });
        expect(result.current.capabilities.map((c) => c.id)).toEqual(['smtp', 's3']);
        expect(result.current.capabilities[0].guideHref).toBe('/docs/guides/running-without-smtp.md');
        expect(result.current.capabilities[1].guideHref).toBe('/docs/guides/running-without-s3.md');
    });

    it('defaults to expanded', () => {
        setPlatform('manual', 'available');
        const { result } = renderHook(() => useCapabilityBanners(), { wrapper: AllTheProviders });
        expect(result.current.collapsed).toBe(false);
    });

    it('setCollapsed(true) persists to localStorage with the capability signature', () => {
        setPlatform('manual', 'available');
        const { result } = renderHook(() => useCapabilityBanners(), { wrapper: AllTheProviders });
        act(() => result.current.setCollapsed(true));
        expect(result.current.collapsed).toBe(true);
        const stored = JSON.parse(localStorage.getItem(CAPABILITY_BANNERS_STORAGE_KEY) as string);
        expect(stored).toEqual({ collapsed: true, sig: 'smtp' });
    });

    it('restores collapsed when the stored signature matches', () => {
        setPlatform('manual', 'available');
        localStorage.setItem(CAPABILITY_BANNERS_STORAGE_KEY, JSON.stringify({ collapsed: true, sig: 'smtp' }));
        const { result } = renderHook(() => useCapabilityBanners(), { wrapper: AllTheProviders });
        expect(result.current.collapsed).toBe(true);
    });

    it('ignores stale collapsed and re-expands when the signature changed', () => {
        setPlatform('manual', 'unavailable'); // sig now "smtp,s3"
        localStorage.setItem(CAPABILITY_BANNERS_STORAGE_KEY, JSON.stringify({ collapsed: true, sig: 'smtp' }));
        const { result } = renderHook(() => useCapabilityBanners(), { wrapper: AllTheProviders });
        expect(result.current.collapsed).toBe(false);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/hooks/admin/useCapabilityBanners.test.ts`
Expected: FAIL — module `./useCapabilityBanners` not found.

- [ ] **Step 3: Implement the hook**

Create `frontend/src/hooks/admin/useCapabilityBanners.ts`:

```typescript
import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePlatformConfigStore } from '@/store/usePlatformConfigStore';

export const CAPABILITY_BANNERS_STORAGE_KEY = 'qualis.capabilityBanners';

export type CapabilityId = 'smtp' | 's3';

export interface CapabilityDescriptor {
    id: CapabilityId;
    guideHref: string;
}

const GUIDE_HREF: Record<CapabilityId, string> = {
    smtp: '/docs/guides/running-without-smtp.md',
    s3: '/docs/guides/running-without-s3.md',
};

interface Persisted {
    collapsed: boolean;
    sig: string;
}

function readPersisted(): Persisted | null {
    try {
        const raw = localStorage.getItem(CAPABILITY_BANNERS_STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as Persisted;
        if (typeof parsed?.collapsed !== 'boolean' || typeof parsed?.sig !== 'string') return null;
        return parsed;
    } catch {
        return null;
    }
}

interface UseCapabilityBanners {
    capabilities: CapabilityDescriptor[];
    collapsed: boolean;
    setCollapsed: (v: boolean) => void;
    count: number;
}

export function useCapabilityBanners(): UseCapabilityBanners {
    const isEmailManual = usePlatformConfigStore((s) => s.isEmailManual());
    const isAudioStorageAvailable = usePlatformConfigStore((s) => s.isAudioStorageAvailable());

    const capabilities = useMemo<CapabilityDescriptor[]>(() => {
        const list: CapabilityDescriptor[] = [];
        if (isEmailManual) list.push({ id: 'smtp', guideHref: GUIDE_HREF.smtp });
        if (!isAudioStorageAvailable) list.push({ id: 's3', guideHref: GUIDE_HREF.s3 });
        return list;
    }, [isEmailManual, isAudioStorageAvailable]);

    const sig = useMemo(() => capabilities.map((c) => c.id).join(','), [capabilities]);

    // Seed collapsed from localStorage only when the persisted signature
    // matches the current degraded set; a changed set must re-surface.
    const [collapsed, setCollapsedState] = useState<boolean>(() => {
        const p = readPersisted();
        return p !== null && p.sig === sig ? p.collapsed : false;
    });

    // Re-evaluate when the capability set changes (e.g. a flag flips after
    // /api/config loads): changed signature → force expanded + re-persist.
    useEffect(() => {
        const p = readPersisted();
        if (p !== null && p.sig === sig) {
            setCollapsedState(p.collapsed);
        } else {
            setCollapsedState(false);
            if (sig !== '') {
                localStorage.setItem(
                    CAPABILITY_BANNERS_STORAGE_KEY,
                    JSON.stringify({ collapsed: false, sig }),
                );
            }
        }
    }, [sig]);

    const setCollapsed = useCallback(
        (v: boolean) => {
            setCollapsedState(v);
            localStorage.setItem(
                CAPABILITY_BANNERS_STORAGE_KEY,
                JSON.stringify({ collapsed: v, sig }),
            );
        },
        [sig],
    );

    return { capabilities, collapsed, setCollapsed, count: capabilities.length };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/hooks/admin/useCapabilityBanners.test.ts`
Expected: PASS (8 passed).

- [ ] **Step 5: Type-check**

Run: `cd frontend && npm run type-check`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
cd /home/julien/tools/qualis
git add frontend/src/hooks/admin/useCapabilityBanners.ts frontend/src/hooks/admin/useCapabilityBanners.test.ts
git commit -m "$(cat <<'EOF'
feat(admin): useCapabilityBanners hook (derive + collapse persistence)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: `CapabilityBanner` presentational row

**Files:**
- Create: `frontend/src/components/admin/CapabilityBanner.tsx`
- Test: `frontend/src/components/admin/CapabilityBanner.test.tsx` (create)

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/admin/CapabilityBanner.test.tsx`:

```typescript
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithStore } from '@/test-utils/renderWithStore';
import { CapabilityBanner } from './CapabilityBanner';

describe('CapabilityBanner', () => {
    it('renders the message and a new-tab guide link with the given href', () => {
        renderWithStore(
            <CapabilityBanner
                message="Email delivery is not configured."
                guideHref="/docs/guides/running-without-smtp.md"
                guideLabel="View guide"
            />,
        );
        const row = screen.getByRole('status');
        expect(row).toHaveTextContent('Email delivery is not configured.');
        const link = screen.getByRole('link', { name: 'View guide' });
        expect(link).toHaveAttribute('href', '/docs/guides/running-without-smtp.md');
        expect(link).toHaveAttribute('target', '_blank');
        expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/admin/CapabilityBanner.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the component**

Create `frontend/src/components/admin/CapabilityBanner.tsx`:

```tsx
import { AlertTriangle } from 'lucide-react';

interface CapabilityBannerProps {
    message: string;
    guideHref: string;
    guideLabel: string;
}

/** One degraded-capability warning row. Presentational only. */
export function CapabilityBanner({ message, guideHref, guideLabel }: CapabilityBannerProps) {
    return (
        <div
            role="status"
            className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs font-medium text-amber-800"
        >
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1">{message}</span>
            <a
                href={guideHref}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 underline underline-offset-2 hover:text-amber-900"
            >
                {guideLabel}
            </a>
        </div>
    );
}
```

(`lucide-react` is already a dependency — used across the admin UI.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/components/admin/CapabilityBanner.test.tsx`
Expected: PASS (1 passed).

- [ ] **Step 5: Commit**

```bash
cd /home/julien/tools/qualis
git add frontend/src/components/admin/CapabilityBanner.tsx frontend/src/components/admin/CapabilityBanner.test.tsx
git commit -m "$(cat <<'EOF'
feat(admin): CapabilityBanner presentational row

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: `CapabilityBannerStack` + `CapabilityBannerChip`

**Files:**
- Create: `frontend/src/components/admin/CapabilityBannerStack.tsx` (exports both `CapabilityBannerStack` and `CapabilityBannerChip`)
- Test: `frontend/src/components/admin/CapabilityBannerStack.test.tsx` (create)

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/admin/CapabilityBannerStack.test.tsx`:

```typescript
import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithStore } from '@/test-utils/renderWithStore';
import {
    CapabilityBannerStack,
    CapabilityBannerChip,
} from './CapabilityBannerStack';
import type { CapabilityDescriptor } from '@/hooks/admin/useCapabilityBanners';

const SMTP: CapabilityDescriptor = { id: 'smtp', guideHref: '/docs/guides/running-without-smtp.md' };
const S3: CapabilityDescriptor = { id: 's3', guideHref: '/docs/guides/running-without-s3.md' };

describe('CapabilityBannerStack', () => {
    it('renders one row per capability with mapped copy', () => {
        renderWithStore(<CapabilityBannerStack capabilities={[SMTP, S3]} onCollapse={vi.fn()} />);
        const rows = screen.getAllByRole('status');
        expect(rows).toHaveLength(2);
        expect(rows[0]).toHaveTextContent('Email delivery is not configured');
        expect(rows[1]).toHaveTextContent('Object storage is not configured');
    });

    it('collapse control calls onCollapse', async () => {
        const onCollapse = vi.fn();
        renderWithStore(<CapabilityBannerStack capabilities={[SMTP]} onCollapse={onCollapse} />);
        await userEvent.click(screen.getByRole('button', { name: 'Hide' }));
        expect(onCollapse).toHaveBeenCalledTimes(1);
    });
});

describe('CapabilityBannerChip', () => {
    it('shows the count and calls onExpand when clicked', async () => {
        const onExpand = vi.fn();
        renderWithStore(<CapabilityBannerChip count={2} onExpand={onExpand} />);
        const btn = screen.getByRole('button', { name: /Reduced functionality \(2\)/ });
        await userEvent.click(btn);
        expect(onExpand).toHaveBeenCalledTimes(1);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/admin/CapabilityBannerStack.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `frontend/src/components/admin/CapabilityBannerStack.tsx`:

```tsx
import { useTranslation } from 'react-i18next';
import { AlertTriangle, ChevronDown } from 'lucide-react';
import { CapabilityBanner } from './CapabilityBanner';
import type { CapabilityDescriptor, CapabilityId } from '@/hooks/admin/useCapabilityBanners';

const MESSAGE_KEY: Record<CapabilityId, { key: string; fallback: string }> = {
    smtp: {
        key: 'admin.capability_banner.smtp',
        fallback:
            'Email delivery is not configured. Account recovery (password reset, email change, email-based two-factor authentication) requires manual administrator action.',
    },
    s3: {
        key: 'admin.capability_banner.s3',
        fallback:
            'Object storage is not configured. Audio responses cannot be collected; audio-enabled studies fall back to text-only responses.',
    },
};

interface StackProps {
    capabilities: CapabilityDescriptor[];
    onCollapse: () => void;
}

/** Expanded stack: one CapabilityBanner per active capability + collapse. */
export function CapabilityBannerStack({ capabilities, onCollapse }: StackProps) {
    const { t } = useTranslation();
    if (capabilities.length === 0) return null;
    return (
        <div>
            {capabilities.map((c) => {
                const m = MESSAGE_KEY[c.id];
                return (
                    <CapabilityBanner
                        key={c.id}
                        message={t(m.key, m.fallback)}
                        guideHref={c.guideHref}
                        guideLabel={t('admin.capability_banner.view_guide', 'View guide')}
                    />
                );
            })}
            <div className="flex justify-end border-b border-amber-200 bg-amber-50 px-4 py-1">
                <button
                    type="button"
                    onClick={onCollapse}
                    className="flex items-center gap-1 text-xs font-medium text-amber-800 underline underline-offset-2 hover:text-amber-900"
                >
                    {t('admin.capability_banner.collapse', 'Hide')}
                </button>
            </div>
        </div>
    );
}

interface ChipProps {
    count: number;
    onExpand: () => void;
}

/** Collapsed indicator: always-visible amber pill in the admin header. */
export function CapabilityBannerChip({ count, onExpand }: ChipProps) {
    const { t } = useTranslation();
    if (count === 0) return null;
    return (
        <button
            type="button"
            onClick={onExpand}
            title={t(
                'admin.capability_banner.chip_tooltip',
                'Some platform capabilities are unavailable. Click for details.',
            )}
            className="flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100"
        >
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{t('admin.capability_banner.chip_count', 'Reduced functionality ({{n}})', { n: count })}</span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        </button>
    );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/components/admin/CapabilityBannerStack.test.tsx`
Expected: PASS (3 passed).

- [ ] **Step 5: Commit**

```bash
cd /home/julien/tools/qualis
git add frontend/src/components/admin/CapabilityBannerStack.tsx frontend/src/components/admin/CapabilityBannerStack.test.tsx
git commit -m "$(cat <<'EOF'
feat(admin): CapabilityBannerStack + collapsed chip

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Wire into `AdminLayout` (replace SMTP banner; add chip)

**Files:**
- Modify: `frontend/src/layouts/AdminLayout.tsx`
- Modify: `frontend/public/locales/en/admin.json` (remove the now-unused `smtp_banner` key)
- Test: `frontend/src/layouts/AdminLayout.capability.test.tsx` (create)

- [ ] **Step 1: Write the failing test**

Create `frontend/src/layouts/AdminLayout.capability.test.tsx`:

```typescript
import { describe, expect, it, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithStore } from '@/test-utils/renderWithStore';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import AdminLayout from './AdminLayout';
import { usePlatformConfigStore } from '@/store/usePlatformConfigStore';

function renderLayout() {
    return renderWithStore(
        <MemoryRouter initialEntries={['/app']}>
            <Routes>
                <Route path="/app" element={<AdminLayout />} />
            </Routes>
        </MemoryRouter>,
    );
}

describe('AdminLayout capability banners', () => {
    beforeEach(() => {
        localStorage.clear();
        usePlatformConfigStore.setState({ emailDelivery: 'smtp', audioStorage: 'available' });
    });

    it('renders no capability banner when nothing is degraded', () => {
        renderLayout();
        expect(screen.queryByText(/Email delivery is not configured/)).not.toBeInTheDocument();
        expect(screen.queryByText(/Object storage is not configured/)).not.toBeInTheDocument();
    });

    it('renders both rows when SMTP manual and S3 unavailable', () => {
        usePlatformConfigStore.setState({ emailDelivery: 'manual', audioStorage: 'unavailable' });
        renderLayout();
        expect(screen.getByText(/Email delivery is not configured/)).toBeInTheDocument();
        expect(screen.getByText(/Object storage is not configured/)).toBeInTheDocument();
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/layouts/AdminLayout.capability.test.tsx`
Expected: FAIL — old layout shows the legacy single SMTP string, not the new `capability_banner.s3` text; the "both rows" assertion fails.

- [ ] **Step 3: Wire the hook + components into AdminLayout**

In `frontend/src/layouts/AdminLayout.tsx`:

(a) Replace the import line `import { usePlatformConfigStore } from '@/store/usePlatformConfigStore';` — keep it (still used elsewhere? it is ONLY used for `isEmailManual` here). Remove that import line and the `const isEmailManual = usePlatformConfigStore((s) => s.isEmailManual());` line. Add instead:

```typescript
import {
    CapabilityBannerStack,
    CapabilityBannerChip,
} from '@/components/admin/CapabilityBannerStack';
import { useCapabilityBanners } from '@/hooks/admin/useCapabilityBanners';
```

(group with the other `@/components/admin/...` / `@/hooks/...` imports).

(b) Inside the component body, where `const isEmailManual = …` was, add:

```typescript
    const { capabilities, collapsed, setCollapsed, count } = useCapabilityBanners();
```

(c) Replace the entire legacy banner block

```tsx
                {isEmailManual && (
                    <div
                        role="status"
                        className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-center text-xs font-medium text-amber-800"
                    >
                        {t(
                            'admin.smtp_banner.manual',
                            'Email delivery not configured — recovery links are generated manually from Admin → Users.'
                        )}
                    </div>
                )}
```

with:

```tsx
                {!collapsed && (
                    <CapabilityBannerStack
                        capabilities={capabilities}
                        onCollapse={() => setCollapsed(true)}
                    />
                )}
```

(d) In the `<header className="flex h-16 …justify-between…">`, add a right-side cluster after the existing left `<div className="flex items-center gap-2 px-4 min-w-0 flex-1">…</div>` (i.e. immediately before `</header>`):

```tsx
                    {collapsed && count > 0 && (
                        <div className="flex items-center px-4 shrink-0">
                            <CapabilityBannerChip count={count} onExpand={() => setCollapsed(false)} />
                        </div>
                    )}
```

(e) If `t` is now unused after removing the legacy block, leave it — it is used elsewhere in the breadcrumb mapping; do not remove `useTranslation`. (Verify by `grep -n "t(" frontend/src/layouts/AdminLayout.tsx` — multiple breadcrumb usages remain.)

- [ ] **Step 4: Remove the orphaned `smtp_banner` i18n key**

In `frontend/public/locales/en/admin.json`, delete the now-unused `"smtp_banner": { "manual": "…" },` object (the `capability_banner` sibling added in Task 3 stays). Removing it after the only consumer is gone keeps `i18n-check` green (an unused key is a warning, but the canonical en file should not carry dead keys).

- [ ] **Step 5: Run tests + i18n + type-check**

Run: `cd frontend && npx vitest run src/layouts/AdminLayout.capability.test.tsx && npm run type-check && npm run i18n-check`
Expected: layout test PASS (2 passed); type-check clean; i18n-check exit 0 (no ERROR).

- [ ] **Step 6: Commit**

```bash
cd /home/julien/tools/qualis
git add frontend/src/layouts/AdminLayout.tsx frontend/public/locales/en/admin.json frontend/src/layouts/AdminLayout.capability.test.tsx
git commit -m "$(cat <<'EOF'
feat(admin): replace SMTP banner with CapabilityBannerStack + chip

S3 reaches parity; collapse-to-chip behaviour; legacy smtp_banner
markup and i18n key removed.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Align the study-design contextual note copy

**Files:**
- Modify: `frontend/public/locales/en/admin.json`
- Modify: `frontend/src/components/admin/designer/PostSortConfigEditor.tsx`

- [ ] **Step 1: Update the i18n values**

In `frontend/public/locales/en/admin.json`, under `admin.design.postsort.audio`, change the two existing keys to the aligned register:

- `storage_unavailable_title` → `"Audio capture is unavailable on this server"` (unchanged — already correct).
- `storage_unavailable_body` → `"Object storage is not configured, so audio responses cannot be collected. You may still enable audio, but participants will respond in text only and no recording is made. Configure object storage and restart the server to enable audio capture."`

(Only `storage_unavailable_body` changes; keep `storage_unavailable_title` as-is.)

- [ ] **Step 2: Update the matching fallback in the component**

In `frontend/src/components/admin/designer/PostSortConfigEditor.tsx`, find the `t('admin.design.postsort.audio.storage_unavailable_body', '…')` call and replace its second argument (the English fallback) byte-for-byte with the new value from Step 1:

```tsx
                                {t(
                                    'admin.design.postsort.audio.storage_unavailable_body',
                                    'Object storage is not configured, so audio responses cannot be collected. You may still enable audio, but participants will respond in text only and no recording is made. Configure object storage and restart the server to enable audio capture.'
                                )}
```

(Do not touch the title `t(...)` call or any other part of the file. The fallback MUST equal the JSON value character-for-character.)

- [ ] **Step 3: Verify parity + types**

Run: `cd frontend && npm run i18n-check && npm run type-check`
Expected: i18n-check exit 0; type-check clean. Also verify byte-identity:

Run: `cd /home/julien/tools/qualis && python3 -c "import json; a=json.load(open('frontend/public/locales/en/admin.json'))['admin']['design']['postsort']['audio']; src=open('frontend/src/components/admin/designer/PostSortConfigEditor.tsx').read(); print('match:', a['storage_unavailable_body'] in src)"`
Expected: `match: True`

- [ ] **Step 4: Commit**

```bash
cd /home/julien/tools/qualis
git add frontend/public/locales/en/admin.json frontend/src/components/admin/designer/PostSortConfigEditor.tsx
git commit -m "$(cat <<'EOF'
refactor(admin): align study-design audio note to professional register

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Full quality gate

**Files:** none (verification + any fix-ups)

- [ ] **Step 1: Run the full CI gate**

Run: `cd /home/julien/tools/qualis && make ci > /tmp/cap_ci.log 2>&1; echo "EXIT=$?"; tail -30 /tmp/cap_ci.log`
Expected: `EXIT=0`. **Do not trust a wrapper/pipe exit code — read the `EXIT=` line and the test summary explicitly** (lesson from the S3 feature: `make ci | tail` masks `make`'s real status). `make ci` includes `make check` (vulture/deptry/radon) and the frontend build.

- [ ] **Step 2: If red, triage**

- If a failure is in `frontend/src/components/admin/designer/QSortEditor*` — that is the **pre-existing unrelated WIP**, not this feature. Note it, do NOT fix it, and assess whether `make ci` was already red on `main` for that reason before this branch (run `git stash` of ONLY the QSortEditor files is NOT permitted — instead report to the controller). Otherwise fix feature-introduced failures at their source and re-run.
- vulture should not flag anything (no new route handler/Pydantic field; a `StaticFiles` mount is not a handler). If it does, add the bare symbol to `backend/vulture_whitelist.py` under a new `# --- capability banners ---` section and re-run.
- i18n: the new `{{n}}` interpolation only in `en` is an admin-best-effort warning, not an error; confirm `make ci` exit is 0 regardless.

- [ ] **Step 3: Commit any fix-ups**

```bash
cd /home/julien/tools/qualis
git add -A -- ':!frontend/src/components/admin/designer/QSortEditor.tsx' ':!frontend/src/components/admin/designer/QSortEditor.test.tsx'
git commit -m "$(cat <<'EOF'
chore(capability-banners): final quality-gate fix-ups

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

(Skip if `make ci` was green with no changes. The `:!QSortEditor` pathspecs guarantee the pre-existing WIP is never staged even by `git add -A`.)

- [ ] **Step 4: Report**

State explicitly: real `make ci` `EXIT=` value, backend/frontend test counts, commit list (`git log --oneline main..HEAD`), confirmation the QSortEditor WIP is still dirty/untouched (`git status --short`), and that the branch is ready for `finishing-a-development-branch`.

---

## Self-review

**Spec coverage:**
- Shared `CapabilityBanner` + `CapabilityBannerStack` → Tasks 5, 6. ✓
- S3 parity row + collapse-to-chip + localStorage persistence + signature-reset → Tasks 4 (hook), 6 (chip), 7 (wiring). ✓
- Backend static `docs/` mount + guide hrefs `/docs/guides/running-without-{smtp,s3}.md` + graceful absence + before-catch-all ordering → Task 1. ✓
- Copy: admin rows, `View guide`, chip + tooltip + `{{n}}` → Tasks 3, 6; study-design note aligned → Task 8. ✓
- Startup-log first-line alignment, helpers stay separate → Task 2. ✓
- Placement respects admin-header policy (chip in header right cluster, not breadcrumb) → Task 7 step 3d. ✓
- Old `isEmailManual` block + `smtp_banner` key removed → Task 7. ✓
- Testing: hook unit, CapabilityBanner render, stack/chip render, AdminLayout integration, backend banner + docs-mount → Tasks 1,2,4,5,6,7. ✓
- Strict typing: `app.middleware.spa` mypy-clean (Task 1 step 5); no vulture change (Task 9 step 2). ✓
- QSortEditor WIP guard reaffirmed in facts + Task 9. ✓

**Placeholder scan:** every code/step block is literal — exact paths, full component/hook source, exact commands and expected output. No TBD/“similar to”. ✓

**Type/name consistency:** `useCapabilityBanners` returns `{ capabilities, collapsed, setCollapsed, count }` (Task 4) consumed identically in Task 7; `CapabilityDescriptor { id, guideHref }` + `CapabilityId` exported in Task 4, imported in Task 6 test and component; `CAPABILITY_BANNERS_STORAGE_KEY` exported (Task 4) used in its test; `CapabilityBanner` props `{message,guideHref,guideLabel}` consistent Tasks 5↔6; i18n keys `admin.capability_banner.{smtp,s3,view_guide,collapse,chip_count,chip_tooltip}` defined Task 3, used Task 6; `chip_count` uses `{{n}}` consistently (Task 3 JSON ↔ Task 6 `{ n: count }`); guide hrefs identical across hook (Task 4), tests, and the served paths (Task 1). ✓
