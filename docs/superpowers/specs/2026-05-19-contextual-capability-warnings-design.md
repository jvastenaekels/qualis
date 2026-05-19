# Contextual-only capability warnings — design

**Date:** 2026-05-19
**Branch:** `refactor/contextual-capability-warnings`
**Status:** approved (brainstorming), pending implementation plan

## Goal

Remove the global admin capability-banner chrome shipped in
`2026-05-18-capability-banners`. Absent-capability warnings must appear
**only at the place where the affected feature is actually used**, never as
global admin-wide chrome.

This reverses the *presentation* of the capability-banners feature while
keeping its underlying capability signal (`/api/config` flags) intact — the
already-contextual surfaces and the new Admin → Users note all depend on it.

## Decisions (locked in brainstorming)

1. Delete the entire global banner system (stack, chip, hook, i18n keys,
   their tests, the AdminLayout wiring).
2. Keep every existing contextual surface unchanged — they are already
   correctly placed at the point of use.
3. Add **one** new contextual note in Admin → Users (the one place the
   email-recovery feature lives in admin chrome), visible only when email
   delivery is manual.
4. Keep the capability signal plumbing (`/api/config`,
   `usePlatformConfigStore`, `usePlatformConfigBootstrap`) — it is required
   by the surviving contextual surfaces.
5. Keep the backend startup-log lines and the `/docs` guides — these are
   operator-diagnostic / documentation channels, not in-app banners, and are
   out of the directive's scope.

## Scope

### Remove

- `frontend/src/components/admin/CapabilityBanner.tsx` + `.test.tsx`
- `frontend/src/components/admin/CapabilityBannerStack.tsx` + `.test.tsx`
- `frontend/src/hooks/admin/useCapabilityBanners.ts` + `.test.ts`
- `frontend/src/layouts/AdminLayout.capability.test.tsx`
- In `frontend/src/layouts/AdminLayout.tsx`: the `useCapabilityBanners`
  import + call; the `CapabilityBannerStack`/`CapabilityBannerChip` import;
  the `{!collapsed && <CapabilityBannerStack …/>}` block (before `<header>`);
  the `{collapsed && count > 0 && (<div…><CapabilityBannerChip …/></div>)}`
  block (header right cluster); and the `gap-2` utility added to the
  `<header className>` (its sole rationale — the chip — is gone, so revert to
  the pre-capability-banners header class).
- In `frontend/public/locales/en/admin.json`: the entire
  `admin.capability_banner` object (`smtp`, `s3`, `view_guide`, `collapse`,
  `chip_count`, `chip_tooltip`).

After removal, `grep -rn "CapabilityBanner\|useCapabilityBanners\|capability_banner" frontend/src`
returns nothing.

### Keep unchanged (already contextual — verified)

- **S3 / audio:** `PostSortConfigEditor.tsx` renders the amber
  `storage_unavailable_title` / `storage_unavailable_body` note at the audio
  toggle when `!isAudioStorageAvailable()`. No change.
- **SMTP / user side:** `PasswordResetRequestPage.tsx` shows
  `auth.password_reset.request_success_manual` when `isEmailManual()`;
  `AccountSettingsPage` hides the email-2FA channel when manual. No change.
- `usePlatformConfigStore`, `usePlatformConfigBootstrap`,
  `GET /api/config`, the `/docs` static mount, the
  `running-without-{smtp,s3}.md` guides, and the backend
  `smtp_mode`/`storage_mode` startup-log helpers — all unchanged.

### Add

A contextual note in `frontend/src/pages/admin/AdminUsersPage.tsx`, rendered
**only when `usePlatformConfigStore(s => s.isEmailManual())`** is true,
positioned with the recovery actions (the page header / actions area, above
the user list — not a top-of-page global strip). Styling consistent with the
existing in-app amber notice idiom (`role="status"`,
`border-amber-200 bg-amber-50 text-amber-800`, `text-xs`/`text-sm`), no
collapse/dismiss, no chip.

Copy (new i18n key `admin.users.email_manual_note`, English value, fallback
byte-identical):

> "Email delivery is not configured. Use the password-reset link and
> set-email actions below for account recovery — no email is sent."

`t('admin.users.email_manual_note', '…')` with the fallback identical to the
`en/admin.json` value (admin best-effort per the i18n policy).

## Architecture / data flow

`GET /api/config` → `usePlatformConfigStore` (`isEmailManual`,
`isAudioStorageAvailable`) → consumed **only** by the contextual surfaces:
`PasswordResetRequestPage`, `AccountSettingsPage`, `PostSortConfigEditor`,
the participant audio components, and the new `AdminUsersPage` note. No
global/layout consumer remains. `AdminLayout` returns to its
pre-capability-banners shape (no banner stack, no chip, original header
class).

## Testing

- **Removal:** delete the four banner test files. Add/extend an
  `AdminUsersPage` test: the note is **absent** when `emailDelivery==='smtp'`
  and **present** (text match) when `emailDelivery==='manual'`
  (store-driven via `usePlatformConfigStore.setState`, `renderWithStore`).
- **Regression guards (must stay green, unchanged):**
  `PostSortConfigEditor` audio-note tests, `PasswordResetRequestPage` tests,
  `usePlatformConfigStore` store test, `RouteErrorBoundary.helpers` tests.
- **Backend:** untouched (`smtp_mode`/`storage_mode`/`/docs` tests stay
  green; no backend change in this work).
- Full `make ci` before the final gate (capture real `MAKE_CI_EXIT`, no
  pipe masking). Frontend-only change; the security-suite/vulture gate-gaps
  do not apply, but run full `make ci` regardless per project discipline,
  and run `npm run lint` / biome on the touched files before the final gate
  (per the per-task-verification-skips-formatter lesson).

## i18n / gates

- New key `admin.users.email_manual_note` in `en/admin.json`; fallback in
  the `t(...)` call byte-identical. `npm run i18n-check` exit 0
  (admin best-effort). Removing the `capability_banner` keys must not leave
  any dangling reference (enforced by the grep above + `i18n-check`).
- No backend change → no `vulture_whitelist.py` change, no mypy impact.
- `npm run type-check` clean after the import/JSX removals in
  `AdminLayout.tsx`.

## Out of scope (YAGNI)

- Any change to the capability signal, `/api/config`, or the store API.
- Any change to backend startup logs, `/docs`, or the guides.
- Re-styling the existing contextual notes (only the new Admin → Users note
  is added; existing notes are left exactly as-is).
- Participant-facing changes (S3 silent degradation stays as designed).
