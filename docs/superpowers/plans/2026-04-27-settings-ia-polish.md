# Settings IA Polish Implementation Plan

**Goal:** Three small, cohesive fixes that resolve the "3 settings pages all called Settings" confusion and remove duplicated avatar/danger-zone scaffolding. Smallest viable PR from Plan B (the larger RHF+zod migration is deferred to Plan B2).

**Architecture:** Three commits in one PR: sidebar relabel → `<UserAvatar>` extraction → `<DangerZoneCard>` extraction. All three consume existing components and existing data; no schema, backend, or migration churn. Inline execution by Claude Code, `make ci-fast` between every commit.

**Tech Stack:** React 19 + TypeScript + Tailwind + shadcn/Radix + Vitest + react-i18next.

---

## Task 1: Disambiguate sidebar "Settings" labels

The sidebar has TWO entries that both render as "Settings" — the project-scoped one (icon `Settings2`) and the study-scoped one (icon `Settings`). Breadcrumb is the only disambiguator. Rename labels in-place.

**Files:**
- Modify: `frontend/src/components/admin/AppSidebar.tsx` — change `t('admin.sidebar.project_settings', 'Settings')` to `t('admin.sidebar.project_settings', 'Project settings')` (the key already exists; only the English fallback changes — and the value in en/fr/fi).
- Modify the study-scoped item to `t('admin.sidebar.settings', 'Study settings')` (key `admin.sidebar.settings` exists in locales; update the English value).
- Modify: `frontend/public/locales/{en,fr,fi}/translation.json` — update existing values (no new keys).

**Test:** `frontend/src/components/admin/AppSidebar.scope-labels.test.tsx` (new) — render `AppSidebar` at `/app/demo/dashboard` (Project View) → assert `Project settings` link present, no bare `Settings` button label. Render at `/app/demo/studies/s1/dashboard` (Focus Mode) → assert `Study settings` link present.

**Commit message:**
```
feat(admin): disambiguate "Settings" sidebar labels

Rename the project-scoped sidebar entry to "Project settings" and the
study-scoped entry to "Study settings". The two entries previously shared
the label "Settings", forcing users to read the breadcrumb to know which
scope they were operating in.
```

---

## Task 2: Extract `<UserAvatar>` primitive

Avatar-initials computation is duplicated 3 times: `AppSidebar.tsx` lines 127-134 (NavUser trigger) and 154-161 (NavUser dropdown header), and `ProjectSettingsPage.tsx` lines 357-366 (member rows). Extract a single shadcn-styled component.

**Files:**
- Create: `frontend/src/components/admin/UserAvatar.tsx` — props `{ name?: string | null; email?: string | null; size?: 'sm' | 'md' | 'lg' }`. Returns the indigo-bg square with computed initials.
- Create: `frontend/src/components/admin/UserAvatar.test.tsx` — 3 cases: full name → initials, email-only fallback → 2-char initials, both null → '?' fallback.
- Modify: `frontend/src/components/admin/AppSidebar.tsx` — replace 2 inline blocks with `<UserAvatar size="md" name={user?.full_name} email={user?.email} />`.
- Modify: `frontend/src/pages/admin/ProjectSettingsPage.tsx` — replace 1 inline block in the members table.

**Commit message:**
```
refactor(admin): extract UserAvatar primitive

Replace 3 duplicated copies of the avatar-initials computation
(AppSidebar NavUser trigger + dropdown header, ProjectSettingsPage
member rows) with a single component. The 'name → initials || email
prefix || ?' fallback chain is unit-tested.
```

---

## Task 3: Extract `<DangerZoneCard>` shell

`GeneralSettingsPage` and `ProjectSettingsPage` both have a "Danger Zone" Card with red styling, a `ShieldAlert` heading, a description, and a destructive button. The shell is duplicated. Extract to a shared component so the visual contract is consistent and any future destructive page (e.g. Profile delete-account) reuses it.

**Files:**
- Create: `frontend/src/components/admin/DangerZoneCard.tsx` — props `{ title: string; description: string; children: React.ReactNode }` where `children` is the action area (button(s)). Wraps in the existing red-border Card with `ShieldAlert` icon header.
- Create: `frontend/src/components/admin/DangerZoneCard.test.tsx` — render with sample title/description/button, assert title rendered, description rendered, children mounted, role/heading semantics correct.
- Modify: `frontend/src/pages/admin/GeneralSettingsPage.tsx` — replace inline danger-zone Card with `<DangerZoneCard>` wrapping the existing buttons.
- Modify: `frontend/src/pages/admin/ProjectSettingsPage.tsx` — same.
- Verify the existing `AlertDialog` flows from Plan A (study delete, member remove) still attach correctly.

**Commit message:**
```
refactor(admin): extract DangerZoneCard shell

GeneralSettingsPage and ProjectSettingsPage both reimplement the same
red-bordered Card with ShieldAlert heading for destructive actions.
Extract to a shared component so the visual contract is consistent
and so future destructive pages can reuse it without copy-paste.
```

---

## Final verification

- `make ci` green
- `npm run i18n-check` green (Task 1 modifies values, no key changes)
- Manual smoke: open project nav → "Project settings" labeled correctly; open study → "Study settings" labeled correctly; user dropdown avatar still renders; member-row avatars still render; both danger zones still trigger their AlertDialogs from Plan A.
- Push branch `feat/settings-ia-polish`, open PR.

---

## Out of scope (Plan B2)

- RHF+zod migration of `GeneralSettingsPage` and `ProfilePage` (currently raw `useState` and RHF-without-schema respectively).
- `<SettingsForm>` shell extraction (depends on RHF migration).
- `<ClickableCard>` primitive (separate Plan D candidate; depends on hook-convention rollout).
