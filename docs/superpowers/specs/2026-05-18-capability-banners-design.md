# Capability banners — clarity & behaviour redesign

**Date:** 2026-05-18
**Branch:** `feat/capability-banners`
**Status:** approved (brainstorming), pending implementation plan

## Goal

Improve the clarity and behaviour of the operator-facing degraded-capability
warnings shipped by `smtp-optional-mode` and `s3-optional-mode`. Today they
are inconsistent (SMTP has a permanent global admin banner; S3 has none —
only a contextual study-design note), terse, non-actionable (no link to the
guide), and the SMTP banner is a permanent thin strip with no way to reclaim
the vertical space it consumes on every admin page.

## Decisions (locked in brainstorming)

1. **Keep SMTP and S3 as separate banner rows**, not a single merged
   "capabilities" banner. They share one component and one consistent style;
   they do not collapse into one combined message.
2. **Behaviour: collapse-to-chip.** A single collapse control for the whole
   stack. Collapsed → a small always-visible amber pill in the admin header.
   Never fully dismissable while a capability is degraded.
3. **S3 reaches parity** — it gets its own global admin banner row, driven by
   the existing `isAudioStorageAvailable()` store flag.
4. **Professional copy** — full sentences stating condition → operational
   consequence → remediation. No exclamation, no casual dashes-as-glue.
5. Participant-facing surfaces are **out of scope** (SMTP forgot-password copy
   stays; S3 stays silent by design).

## Scope

### In scope

- A shared frontend `CapabilityBanner` + `CapabilityBannerStack` (admin-only).
- S3 parity row + collapse-to-chip behaviour + localStorage persistence.
- Copy polish on: the two admin banner rows, the collapsed chip, the existing
  `PostSortConfigEditor` study-design contextual note (aligned register).
- **Backend static serving of the repo `docs/` directory** so the `View
  guide` links resolve (the app does not serve docs today). See §4.
- Phrasing alignment of the two backend startup-log helpers
  (`smtp_mode_banner_lines`, `storage_mode_banner_lines`) — clarity only, no
  behavioural or structural change, helpers remain separate.

### Out of scope (YAGNI)

- Merging the two banners into one combined capability message.
- Any new backend endpoint or settings (the `email_delivery` and
  `audio_storage` flags on `GET /api/config` already exist and are unchanged).
- Rendering markdown to HTML — the guide links serve the raw `.md` file
  (acceptable for a technical operator audience; renderer is YAGNI).
- Participant-facing copy/behaviour.
- Per-row individual dismissal (only whole-stack collapse).
- Persisting collapse state server-side or per-user (localStorage only).

## Design

### 1. Component architecture

Two new files under `frontend/src/components/admin/`:

- **`CapabilityBanner.tsx`** — one presentational row. Props:
  `{ message: string; guideHref: string; guideLabel: string }`. Renders an
  amber row, `role="status"`, warning icon, the message, and an anchor
  `<a href={guideHref} target="_blank" rel="noopener noreferrer">` with
  `guideLabel`. No state. One clear responsibility: render one capability
  warning. Styling reuses the existing SMTP banner's amber tokens
  (`bg-amber-50 border-amber-200 text-amber-800`) for visual continuity.

- **`CapabilityBannerStack.tsx`** — the stateful container. It:
  - reads `usePlatformConfigStore` (`isEmailManual()`,
    `isAudioStorageAvailable()`),
  - derives the ordered list of active degraded capabilities (SMTP first,
    then S3 — stable order),
  - owns the collapse boolean (see §2),
  - renders either the expanded stack (one `CapabilityBanner` per active
    capability + a collapse control) or nothing (when collapsed, the chip is
    rendered separately — see §3),
  - returns `null` when no capability is degraded.

The logic (capability derivation, collapse state, persistence, reset) lives in
a hook `frontend/src/hooks/admin/useCapabilityBanners.ts` per the project's
hook-driven-component convention; `CapabilityBannerStack` is the JSX shell.
The hook is unit-testable without rendering.

`useCapabilityBanners` returns:
`{ capabilities: CapabilityDescriptor[]; collapsed: boolean; setCollapsed:
(v: boolean) => void; count: number }` where `CapabilityDescriptor` is
`{ id: 'smtp' | 's3'; message: string; guideHref: string }`.

### 2. Collapse state + persistence

- One boolean: the whole stack is expanded or collapsed.
- Persisted in `localStorage` under key `qualis.capabilityBanners.collapsed`.
- **Auto-reset on capability-set change.** Persist alongside the collapsed
  flag a signature of the active capability set (e.g. the sorted ids joined,
  `"s3"` / `"smtp,s3"`). On load, if the stored signature differs from the
  current active set, ignore the stored collapsed flag and default to
  **expanded** (a newly-degraded capability must re-surface; resolving one
  must not leave a stale "2" chip). Re-persist the new signature.
- When no capability is degraded, the hook returns `count: 0` and the stack +
  chip render nothing; the localStorage entry is irrelevant (and may be
  cleared for tidiness).

### 3. Placement (respects the admin-header policy)

- **Expanded stack:** top of `AdminLayout`'s `SidebarInset` content area —
  exactly where the current SMTP banner sits (first child, above the
  `<header>`). The collapse control is a chevron/affordance on the stack
  (e.g. a right-aligned "Hide" button on the last row or a single control on
  the stack container), collapsing the entire stack.
- **Collapsed chip:** a small amber pill rendered in the **right cluster of
  the `AdminLayout` `<header>`** (alongside existing header utilities, not in
  the breadcrumb — L1 breadcrumb remains the single source of hierarchy per
  the admin-header policy in CLAUDE.md). Label: `⚠ Reduced functionality (N)`
  where N = `count`. `title`/tooltip: "Some platform capabilities are
  unavailable. Click for details." Clicking sets `collapsed=false`.
- The existing standalone SMTP `{isEmailManual && (...)}` block in
  `AdminLayout.tsx` is **removed** and replaced by `<CapabilityBannerStack />`
  (expanded stack slot) plus the chip slot in the header. No other consumer
  of the old markup exists.

### 4. Copy (final, professional register)

Admin banner rows (i18n keys under `admin.capability_banner.*`):

- **SMTP** (`admin.capability_banner.smtp`): *"Email delivery is not
  configured. Account recovery (password reset, email change, email-based
  two-factor authentication) requires manual administrator action."*
- **S3** (`admin.capability_banner.s3`): *"Object storage is not configured.
  Audio responses cannot be collected; audio-enabled studies fall back to
  text-only responses."*
- Guide link label (`admin.capability_banner.view_guide`): *"View guide"*.
- Chip (`admin.capability_banner.chip`): *"Reduced functionality"* (rendered
  with the count appended by the component: `Reduced functionality ({{n}})`
  via `admin.capability_banner.chip_count`).
- Chip tooltip (`admin.capability_banner.chip_tooltip`): *"Some platform
  capabilities are unavailable. Click for details."*

Guide hrefs (relative, served by the new backend docs mount — see below):
SMTP → `/docs/guides/running-without-smtp.md`, S3 →
`/docs/guides/running-without-s3.md`. Both files exist. Opened in a new tab
(`target="_blank" rel="noopener noreferrer"`).

**Backend docs static mount (pinned decision — "serve docs as static").**
The app currently serves only `frontend/dist/assets` via
`app.middleware.spa.mount_spa`; `docs/` is not served. Add, at the very top
of `mount_spa(app)` — **before** the existing `FRONTEND_DIST` early-return
guard and before the SPA catch-all route — a static mount of the
project-root `docs/` directory:

- Resolve `DOCS_DIR = os.path.join(_ROOT_DIR, "docs")` (`_ROOT_DIR` already
  defined in `spa.py`).
- `if os.path.isdir(DOCS_DIR): app.mount("/docs",
  StaticFiles(directory=DOCS_DIR), name="docs")`. Guard on existence so a
  packaging without `docs/` degrades gracefully (the link 404s, the banner
  still works — no crash), mirroring how `mount_spa` already guards
  `FRONTEND_DIST`.
- Independent of `FRONTEND_DIST`: placing it before the early return means
  docs are served even when the frontend build is absent.
- Mount registration precedes the `/{full_path:path}` catch-all, so `/docs/*`
  is served by `StaticFiles` and never swallowed by the SPA fallback (same
  ordering as the existing `/assets` mount).
- `StaticFiles` serves the raw `.md` (Content-Type `text/markdown`); no
  rendering (out of scope).

**Dev caveat:** in local dev the frontend is served by the Vite dev server,
not FastAPI, so `/docs/...` resolves only when the app is run as the
integrated FastAPI service (every real deployment — the operator scenario the
banner targets). Acceptable and noted; no dev-only doc copy is introduced
(that would duplicate content and risk drift).

Study-design contextual note (`PostSortConfigEditor`, existing keys
`admin.design.postsort.audio.storage_unavailable_{title,body}`) — copy
updated to the aligned register:

- Title: *"Audio capture is unavailable on this server"*
- Body: *"Object storage is not configured, so audio responses cannot be
  collected. You may still enable audio, but participants will respond in
  text only and no recording is made. Configure object storage and restart
  the server to enable audio capture."*

All new/changed strings use `t('key', 'English fallback')` with the fallback
byte-identical to `frontend/public/locales/en/admin.json`, admin-best-effort
per the i18n policy.

### 5. Backend startup-log alignment (clarity only)

`smtp_mode_banner_lines` and `storage_mode_banner_lines` remain separate
functions with separate call sites. Only the wording of the first line is
aligned to a shared shape, and the final line normalised:

- SMTP first line: `"Email delivery is not configured. Qualis is running in
  email-optional mode."`
- S3 first line: `"Object storage is not configured. Qualis is running in
  storage-optional mode."`
- Both keep their existing consequence/remediation lines and a final
  `"See docs/guides/running-without-{smtp,s3}.md for the capability matrix."`

No signature change, no merge, no lifespan-wiring change.

## Testing

**Frontend**
- `useCapabilityBanners` hook (unit, no render): returns `[]` when both
  configured; `[smtp]` / `[s3]` / `[smtp,s3]` in stable order for each
  combination; `collapsed` defaults expanded; `setCollapsed(true)` persists to
  localStorage; reload with matching signature restores collapsed; reload with
  changed signature ignores stale collapsed and re-expands; clearing all
  capabilities yields `count:0`.
- `CapabilityBanner` (render): shows message + a `View guide` link with the
  correct `href`, `target=_blank`, `rel=noopener noreferrer`,
  `role="status"`.
- `CapabilityBannerStack` (render): N rows for N active capabilities; collapse
  control hides the stack; chip shows `Reduced functionality (N)`; clicking
  chip re-expands; renders nothing when no capability degraded.
- `AdminLayout`: the old `isEmailManual` standalone block no longer renders;
  the stack/chip wiring renders for manual/unavailable states.

**Backend**
- Update `test_smtp_mode.py` / `test_storage_mode.py` assertions for the new
  first-line wording; keep the existing
  `docs/guides/running-without-*.md` and env-var substring assertions.
- New test: `GET /docs/guides/running-without-smtp.md` returns 200 and the
  body contains a known substring from that file (e.g. the H1). Asserts the
  docs mount is active and the banner links resolve. (Run via the existing
  integration `client` fixture, which exercises the app with `mount_spa`
  applied.)

## Strict-typing / gates

- No new backend modules; the two helpers stay in their already-strict
  modules (`app.utils.smtp_mode`, `app.utils.storage_mode`) — keep
  `-> list[str]` typing, no `Any`.
- `app.middleware.spa` is in the strict-overrides list — the added
  `DOCS_DIR`/mount lines must keep it mypy-clean (the existing
  `# type: ignore[explicit-any]` on `serve_spa` is unchanged; the new mount
  introduces no `Any`).
- No new FastAPI route handler/Pydantic field (a `StaticFiles` mount is not a
  route handler) → no `vulture_whitelist.py` change. Confirm with full
  `make check` regardless.
- Frontend: `npm run i18n-check` + `npm run check-interpolations` for the
  `{{n}}` chip interpolation; `npm run type-check`.
- Full `make ci` before the final gate (the security-suite/vulture gate gaps
  do not apply — frontend + two backend unit-test files only — but run full
  `make ci` regardless per project discipline).

## Pre-existing worktree note

`frontend/src/components/admin/designer/QSortEditor.tsx` and
`QSortEditor.test.tsx` carry unrelated uncommitted WIP that predates this
work. It must not be touched, staged, committed, or reverted by any task.
