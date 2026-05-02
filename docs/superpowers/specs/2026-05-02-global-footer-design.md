# Global Footer — Design

**Date:** 2026-05-02
**Status:** Draft, pending implementation plan
**Scope:** Frontend SPA (`frontend/`), no backend changes
**TODO item resolved:** "Footer with GitHub link" + "Terms of use?" (TODO.md)

## Problem

Qualis ships no global footer. The only attribution is a single inline *"Powered by Qualis"* line in `StudyAccessGate.tsx:109-113`, shown only on password-protected studies. Participants completing a study, researchers in the admin, and visitors to the landing page see no attribution, no source-code link, and no license signal.

For an AGPLv3 self-hostable platform, footer attribution serves three goals:

1. **Discoverability** — participants who are curious about the tool behind their study can find the project.
2. **Open-source signal** — the AGPL spirit calls for license visibility to network users.
3. **Trust / credibility** — researchers (and the institutions hosting Qualis) benefit from the platform being identifiably open and auditable.

A "Terms of Use" link was floated. Investigation of comparable open-source platforms (LimeSurvey, Discourse, Forgejo/Codeberg, REDCap) shows that ToS, when present, are **always written by the deployer of the instance, never shipped by the upstream project**. Qualis the software cannot honestly ship generic ToS — that is the deployer's responsibility. A configurable per-deployment ToS slot is plausible future work but out of scope here.

## Decisions

### Surface

Footer rendered **everywhere except** `FineSortPage` and `RoughSortPage` (the two immersive Q-sort screens, which already carry their own validation footer with `flex-none z-[100]` and saturate mobile vertical space).

Pages that get the footer: Landing, all auth flows (login, register, verify-email, verify-email-sent, forgot-password, reset-password, 2fa/recover, 2fa/disable), `ResearcherHub`, `StudyAccessGate`, participant non-sort steps (welcome, consent, presort, postsort), all admin routes (`/app/...`), `ResetPage`, `ResumePage`. `StudyStatusPage` and the in-flow `ErrorPage` (rendered as participant 404 catch-all) inherit the footer through `StudyLayout` since they're mounted inside it.

The existing inline *"Powered by Qualis"* in `StudyAccessGate.tsx` is **deleted** — covered by the global footer.

### Composition

Three blocks, left↔right:

```
[mini-logo 16px] Powered by Qualis  ·  AGPLv3                        [GitHub icon 16px]
```

| Element | Link target | Mobile (< 640px) |
|---|---|---|
| Mini-logo + "Powered by Qualis" | `https://github.com/jvastenaekels/qualis` | shown |
| `·` separator | — | shown |
| AGPLv3 | `https://github.com/jvastenaekels/qualis/blob/main/LICENSE` | **hidden** (`hidden sm:inline`) |
| GitHub icon | `https://github.com/jvastenaekels/qualis` | shown |

All external links: `target="_blank" rel="noopener noreferrer"`. The GitHub icon carries an `aria-label` (`"View source on GitHub"`) since it has no visible text.

The "Powered by Qualis" link and the GitHub icon point to the same URL. This is intentional — they have **distinct affordances**: the textual attribution conveys trust/branding ("this product is built on Qualis"), the icon signals "audit / contribute". Pattern lifted from Forgejo / Codeberg.

### Visual style

```
Container: <footer class="border-t border-slate-100 bg-white/70 backdrop-blur">
Inner:     <div class="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between
                       text-xs text-slate-400">
Hover:     hover:text-slate-600 transition-colors on each link
```

**Inline at the end of the layout's flex column** (classic "sticky footer" CSS pattern: parent is `min-h-screen flex flex-col`, content is `flex-1`, footer naturally sits at viewport bottom on short pages, scrolls into view on long pages). **Not** `position: fixed` — that would either overlap the admin sidebar or require z-index gymnastics with modals/dialogs (typically z-50).

### i18n

Three new translation keys, mirrored across `en/fr/fi`:

| Key | en | fr | fi |
|---|---|---|---|
| `footer.powered_by` | Powered by Qualis | Propulsé par Qualis | Qualisin tarjoama |
| `footer.license` | AGPLv3 | AGPLv3 | AGPLv3 |
| `footer.github_aria` | View source on GitHub | Voir le code source sur GitHub | Katso lähdekoodi GitHubissa |

`footer.license` is identical across locales (proper noun for the license).

## Architecture

### New files

- **`frontend/src/components/Footer.tsx`** (~50 LOC) — pure presentational component, no context dependencies, no props. Reads i18n via `useTranslation()`. Imports `Github` icon from `lucide-react`. Logo via `<img src="/qualis-logo.svg" alt="" />` (alt empty, decorative — the adjacent text carries the meaning).
- **`frontend/src/components/Footer.test.tsx`** — Vitest. Asserts: (1) three links with correct hrefs, (2) `rel="noopener noreferrer"` on each external link, (3) `hidden sm:inline` class on AGPLv3 link, (4) `aria-label` present on GitHub icon link, (5) i18n keys resolve via the `renderWithStore` helper.
- **`frontend/src/layouts/PublicPageLayout.tsx`** (~15 LOC) — thin wrapper: `<div className="min-h-screen flex flex-col">{children}<Footer/></div>`. Used for standalone public pages that have no other layout.

### Modified files

- **`frontend/src/layouts/AdminLayout.tsx`** — mount `<Footer />` after `<Outlet />` inside `SidebarInset`. Footer sits below the page content, above no other chrome.
- **`frontend/src/layouts/StudyLayout.tsx`** — mount `<Footer />` after `<Outlet />` inside `<main>`. **Route-guard:** read `useLocation().pathname`; if it ends with `/fine-sort` or `/rough-sort`, render `null` instead of the footer. (Could also be moved to a `Footer` prop or done by reading a layout flag — the pathname check keeps the call site explicit.)
- **`frontend/src/App.tsx`** — wrap the standalone-page route elements with `<PublicPageLayout>`. Affected routes: `/`, `/login`, `/register`, `/verify-email`, `/verify-email-sent`, `/forgot-password`, `/reset-password`, `/2fa/recover`, `/2fa/disable`, `/hub` (ResearcherHub, wrapped at the child `index: true` element), `/study/:slug/resume/:token`, `/study/:slug/reset`. `PublicPageLayout` provides `min-h-screen flex flex-col`; the existing `min-h-screen` on each wrapped page's root `<div>` becomes redundant and is removed (otherwise double-flex layout glitches: nested `flex-col` containers each claiming full viewport height).
- **`frontend/src/components/study/StudyAccessGate.tsx`** — delete lines 109-113 (the inline `<p>Powered by Qualis</p>` block; the `mt-8` spacing is on that `<p>`, so it goes with it).
- **`frontend/public/locales/{en,fr,fi}/translation.json`** — add the three `footer.*` keys.
- **`frontend/src/layouts/StudyLayout.test.tsx`** — add cases verifying the footer is absent on `/study/foo/fine-sort` and `/study/foo/rough-sort`, present on `/study/foo/welcome` (and at least one other non-sort step).

### Why a `PublicPageLayout` wrapper rather than mounting `<Footer/>` in each public page

- **Single point of change** — if the footer pattern evolves (added language switcher, restyle, etc.) only one file touches.
- **Consistency with existing pattern** — `AdminLayout` and `StudyLayout` already encapsulate cross-page chrome. `PublicPageLayout` extends the same convention to the standalone-page set.
- **Avoids per-page drift** — duplicating `<Footer/>` across 12 page files invites someone to forget it on the next new page.

### Why the route-guard lives in `StudyLayout`, not in `Footer`

- The hide condition is **layout-specific** (only applies to study participant flows), not a property of the footer itself. Pushing the guard into `Footer` would couple a generic component to a route shape it has no other reason to know.
- Other layouts that mount `Footer` (admin, public) never need to hide it — keeping the guard local to `StudyLayout` keeps `Footer` reusable.

## Out of scope

- **Configurable ToS slot per deployment** (env var → conditional link). Plausible future work; deferred until either an official Qualis instance launches with real ToS, or a deployer requests it.
- **Language switcher in the footer** (Codeberg pattern). Orthogonal; can be added to the same `Footer` component later if desired, or kept in admin sidebar where it likely already lives.
- **Dedicated `qualis-mark.svg` icon-only logo variant**. We render `qualis-logo.svg` at `h-4 w-4`. If it looks too busy at that size during implementation, extract a mark variant then.
- **Version display** (Forgejo/Discourse don't show version in footer either; useful for ops but noisy for the participant audience). Skipped.
- **Footer on error / 404 boundaries** (`RouteErrorBoundary`, `ErrorPage`). Worth a quick check during implementation — adding to error pages is trivial and improves the "where am I" signal when something breaks. Likely just wrap the error page with `PublicPageLayout` too.

## Acceptance

- Footer visible on Landing, all auth pages, ResearcherHub, StudyAccessGate, participant welcome/consent/presort/postsort, all admin routes.
- Footer absent on `FineSortPage` and `RoughSortPage`.
- Three links: "Powered by Qualis" → repo home; AGPLv3 → LICENSE on GitHub; GitHub icon → repo home. All `target="_blank"`, all `rel="noopener noreferrer"`.
- AGPLv3 link hidden below `sm` breakpoint (640px).
- i18n: `footer.powered_by`, `footer.license`, `footer.github_aria` present in `en/fr/fi`; `npm run i18n-check` passes.
- The inline "Powered by Qualis" in `StudyAccessGate.tsx` is deleted.
- `make ci-fast` green; `Footer.test.tsx` passes; `StudyLayout.test.tsx` route-guard cases pass.
