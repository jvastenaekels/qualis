# Admin UX Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the 30 defects found in the 2026-07-26 admin-space UX audit — from data mislabelling that misleads researchers, down to alignment and typography inconsistencies.

**Architecture:** Six independent phases, ordered by harm. Phase 1 fixes what actively misinforms the researcher; Phase 2 removes developer-facing text from the product; Phase 3 makes the admin keyboard- and screen-reader-usable; Phases 4–5 collapse four ad-hoc visual/verbal systems into one; Phase 6 is pixel finish. Each phase ships on its own and can be reviewed, merged, and released without the others.

**Tech Stack:** React 19, TypeScript, Vite, Tailwind CSS, Radix UI, TanStack Table v8, Recharts, react-i18next, Vitest + Testing Library.

## Global Constraints

Every task inherits these. They come from `CLAUDE.md` and are non-negotiable.

- **Inner loop:** run `make ci-fast` after every change (~38 s). Run `make ci` before pushing (~3–5 min). Never push on a failing `make ci`.
- **No `any` in TypeScript.** Use `unknown` or a specific type. `// biome-ignore` only when genuinely unavoidable.
- **Avoid non-null assertions (`!`).** Handle null explicitly.
- **All user-facing strings** go through `useTranslation()` / `t()` with a key **and** an English fallback: `t('key', 'Fallback')`.
- **The fallback string in `t(key, 'Fallback')` must match the canonical English label** in `frontend/public/locales/en/admin.json` character-for-character. Divergence is a defect (see Task 5.1).
- **Locale parity:** participant namespace is strict (mandatory parity), admin is best-effort (warning only). Run `npm run i18n-check` and `npm run check-interpolations` after touching any locale file.
- **Frontend tests:** Vitest with the `renderWithStore` helper; use `waitFor` for async state assertions. Hook logic tests live in `frontend/src/hooks/<area>/use<Name>.test.ts`.
- **Formatting:** `npm run lint:fix` (frontend) auto-fixes. Do not hand-format.
- **Admin header policy** (`CLAUDE.md` → "Admin header policy"): breadcrumb is the single source of truth for hierarchy; L2 page header carries the page's *function*, never the project/study title, except on entity entry-point pages.
- **Naming canon:** one label per section, propagated to exactly three keys — `admin.sidebar.<s>`, `admin.breadcrumbs.<s>`, `admin.<s>.title`.
- **Commit style:** conventional commits (`fix:`, `feat:`, `refactor:`, `style:`), one commit per task.

---

## File Structure

No new modules. Three new files, everything else is modification.

**Create:**
- `frontend/src/lib/datetime.ts` — the single date/time formatting surface for the admin (Task 4.3). Owns every `Date` → string conversion so no component calls `toLocaleDateString()` directly.
- `frontend/src/lib/datetime.test.ts` — its tests.
- `frontend/src/components/ui/slug-input.tsx` — the prefixed-slug input, measuring its own prefix instead of guessing padding (Task 6.1).

**Modify (by phase):**

| Phase | Files |
|---|---|
| 1 — Correctness | `components/admin/dashboard/InteractiveDataView.columns.tsx`, `components/admin/dashboard/InteractiveDataView.tsx`, `pages/admin/ProjectMembersPage.tsx`, `pages/admin/ConcourseDetailPage.tsx`, `pages/admin/AnalysisPage.tsx`, `App.tsx` |
| 2 — Text leaks | `public/locales/en/admin.json`, `components/admin/analysis/FactorVoicesPanel.tsx`, `pages/admin/ProjectMembersPage.tsx` |
| 3 — Accessibility | `pages/admin/ConcourseDetailPage.tsx`, `components/admin/AdminDashboard.tsx`, `pages/admin/StudyDesignPage.tsx` (lock overlay), `pages/admin/RecruitmentPage.tsx`, `pages/LoginPage.tsx` |
| 4 — Tokens | `pages/admin/*.tsx` (primary-button sweep), `lib/datetime.ts`, `public/locales/en/admin.json` |
| 5 — Vocabulary | `public/locales/en/admin.json`, `public/locales/fr/admin.json`, sidebar/breadcrumb config in `components/admin/AdminLayout.tsx` |
| 6 — Visual finish | `components/ui/slug-input.tsx`, `pages/admin/ProjectSettingsPage.tsx`, `pages/admin/CreateProjectPage.tsx`, `pages/admin/RecruitmentPage.tsx`, `pages/admin/DataPrivacyPage.tsx`, `styles/typography.css`, misc. |

---

# PHASE 1 — Correctness

Five defects that make the UI state or the data wrong. Nothing else matters until these are gone.

### Task 1.1: Responses table — headers misaligned with data

**The defect:** the responses table renders **6 `<th>` for 7 `<td>`**. The `language` column's cells render but its header never does, so every value from column 2 onward sits under the wrong label: `Status → en`, `Consent → Completed`, `Duration → —`, `Submitted → 10m 19s`, and the actual submission date has no header at all. Verified live on 18 rows; the skew survives a re-render (clicking sort does not fix it).

**Root cause is not yet established.** The production build strips React's dev warnings, so a duplicate-key warning — the leading hypothesis — is invisible there. The test below reproduces it in dev, where the warning will surface. Use superpowers:systematic-debugging.

**Files:**
- Test: `frontend/src/components/admin/dashboard/InteractiveDataView.test.tsx`
- Modify: `frontend/src/components/admin/dashboard/InteractiveDataView.columns.tsx:263-293` (conditional `language` column)
- Modify: `frontend/src/components/admin/dashboard/InteractiveDataView.tsx:774-795` (thead render)

**Interfaces:**
- Consumes: `buildColumns({ t, currentLocale, duplicateIpGroups, showLanguageColumn, statusFilter, consentFilters, qualityFilter, stepFilter, stepLabels, toggleConsent, setStatusFilter, setStepFilter, setConsentFilters, setQualityFilter })` from `InteractiveDataView.columns.tsx`.
- Produces: no signature change. The contract this task establishes is structural: `thead th count === tbody tr td count`, asserted by the test below.

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/src/components/admin/dashboard/InteractiveDataView.test.tsx
it('renders one header cell per data cell when the study is multilingual', async () => {
    // A two-translation study is what turns showLanguageColumn on.
    renderWithStore(<InteractiveDataView {...propsForStudyWithTranslations(['en', 'fr'])} />);

    const table = await screen.findByRole('table');
    const headerCells = within(table).getAllByRole('columnheader');
    const firstBodyRow = within(table).getAllByRole('row')[1];
    const bodyCells = within(firstBodyRow).getAllByRole('cell');

    expect(headerCells).toHaveLength(bodyCells.length);
});

it('labels the language column', async () => {
    renderWithStore(<InteractiveDataView {...propsForStudyWithTranslations(['en', 'fr'])} />);
    expect(await screen.findByRole('columnheader', { name: /lang/i })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/components/admin/dashboard/InteractiveDataView.test.tsx -t 'header cell per data cell'`
Expected: FAIL — `expected length 6 to be 7`. Watch the captured stderr: a React `Encountered two children with the same key` warning here confirms hypothesis (a).

- [ ] **Step 3: Diagnose, in this order**

(a) **Duplicate header key.** `InteractiveDataView.tsx:782` uses `key={header.id}`. If two columns resolve to the same id, React drops one `<th>` and the body — keyed by `cell.id` — keeps both. Log `table.getHeaderGroups()[0].headers.map(h => h.id)` and compare against `columns.map(c => c.id)`.

(b) **Header returns nullish.** `flexRender` at `InteractiveDataView.tsx:787` renders nothing when `columnDef.header` is undefined — but the `<TableHead>` wrapper would still emit a `<th>`, so this explains an *empty* header, not a *missing* one. Rule it out by counting, not by looking.

(c) **Column identity.** `columnHelper.accessor('language', …)` at `columns.tsx:265` — confirm `language` exists on the row type and that its generated id collides with nothing.

Fix at the source the diagnosis points to. If it is (a), give the column an explicit stable `id` in `columns.tsx`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/admin/dashboard/InteractiveDataView.test.tsx`
Expected: PASS, both tests.

- [ ] **Step 5: Verify in the running app**

With the demo stack up, open `/app/example-project/studies/bioeconomy-futures/data` and confirm the header row reads `Participant | Lang | Status | Consent | Flags | Duration | Submitted` and that `en`/`fr` sits under **Lang**, `Completed` under **Status**, `10m 19s` under **Duration**.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/admin/dashboard/InteractiveDataView.columns.tsx \
        frontend/src/components/admin/dashboard/InteractiveDataView.tsx \
        frontend/src/components/admin/dashboard/InteractiveDataView.test.tsx
git commit -m "fix(data): render the language column header so table values match their labels"
```

---

### Task 1.2: Member role select renders empty for owners

**The defect:** `<SelectContent>` at `ProjectMembersPage.tsx:248-267` offers only `member` and `viewer`. When `member.role === 'owner'`, Radix's `<SelectValue />` finds no matching item and renders nothing — the owner sees a disabled, empty grey box where "Owner" belongs.

**Files:**
- Test: `frontend/src/pages/admin/ProjectMembersPage.test.tsx`
- Modify: `frontend/src/pages/admin/ProjectMembersPage.tsx:236-267`

**Interfaces:**
- Consumes: `ProjectRole` (`'owner' | 'member' | 'viewer'`), `handleRoleChange(userId: number, role: ProjectRole): Promise<void>` — both already in this file.
- Produces: no signature change.

- [ ] **Step 1: Write the failing test**

```tsx
it('shows the Owner role label for the project owner', async () => {
    renderWithStore(<ProjectMembersPage />, {
        preloadedMembers: [{ user_id: 1, role: 'owner', user: { email: 'owner@example.com' } }],
    });
    expect(await screen.findByText('Owner')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/pages/admin/ProjectMembersPage.test.tsx -t 'Owner role label'`
Expected: FAIL — "Unable to find an element with the text: Owner".

- [ ] **Step 3: Render the owner's role as a static badge**

> **Corrected after CI.** This step originally prescribed adding a `<SelectItem value="owner" disabled>` so `<SelectValue />` would have something to render. That is wrong: `SelectContent` is one shared JSX block instantiated per row, so the item appears in **every** row's dropdown — and the repo encodes the opposite as a deliberate invariant in two E2E tests (`e2e/admin/roles.spec.ts:405` and `:419`, "owner role is never offered in dropdowns"). CI caught it. The task's own review had flagged the phantom item and proposed the badge; it was deferred as visual noise. It was not.

Ownership transfer is not a dropdown action — a project has exactly one owner, and the owner row's `<Select>` is already unconditionally disabled (`ProjectMembersPage.tsx:231-235`). So render the value, don't offer it:

- When `member.role === 'owner'`, render a static badge carrying `t('admin.project.roles.owner', 'Owner')` instead of the `<Select>`, styled to match the existing owner pill (`bg-indigo-50 text-indigo-700`).
- Leave `<SelectContent>` offering only `member` and `viewer`.
- Leave the member/viewer rows untouched.

This fixes the empty label, keeps `owner` out of every listbox, and removes a permanently-disabled combobox from the tab order.

The key `admin.project.roles.owner` already exists in all nine locales — do not re-add it.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/pages/admin/ProjectMembersPage.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/admin/ProjectMembersPage.tsx \
        frontend/src/pages/admin/ProjectMembersPage.test.tsx \
        frontend/public/locales/en/admin.json
git commit -m "fix(members): show the Owner label instead of an empty role select"
```

---

### Task 1.3: Curation bar contradicts its own counter

**The defect:** `ConcourseDetailPage.tsx:474-475` computes `progress = ((acceptedCt + rejectedCt) / totalCount) * 100` — 33/36 = 91.67 % — while line 486 displays `acceptedCt` (25) over `totalCount` (36) = 69 %. The number and the bar measure different things. On the demo data the bar reads nearly full next to a counter reading two-thirds.

**Decision:** the bar tracks *reviewed* progress (accepted + rejected), which is the meaningful curation signal. So the **label** is what must change to match it, not the bar. Show both quantities explicitly rather than one silently.

**Files:**
- Test: `frontend/src/pages/admin/ConcourseDetailPage.test.tsx`
- Modify: `frontend/src/pages/admin/ConcourseDetailPage.tsx:477-540`
- Modify: `frontend/public/locales/en/admin.json`

**Interfaces:**
- Consumes: `concourse.items: Array<{ status: 'accepted' | 'rejected' | 'proposed' }>` — already in scope in the IIFE at line 463.
- Produces: no signature change.

- [ ] **Step 1: Write the failing test**

```tsx
it('states reviewed count and progress width consistently', () => {
    // 25 accepted + 8 rejected + 3 proposed = 36
    renderWithStore(<ConcourseDetailPage />, { preloadedConcourse: concourseWith(25, 8, 3) });

    // The headline number is what the bar measures: 33 reviewed of 36.
    expect(screen.getByText('33')).toBeInTheDocument();
    expect(screen.getByTestId('curation-progress')).toHaveStyle({ width: '91.66666666666666%' });
    // The Q-set size stays visible, but as its own labelled figure.
    expect(screen.getByText(/25 accepted/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/pages/admin/ConcourseDetailPage.test.tsx -t 'reviewed count and progress'`
Expected: FAIL — the headline currently renders `25`, and the bar has no test id.

- [ ] **Step 3: Make the label describe the bar**

Replace the `<p>` block at `ConcourseDetailPage.tsx:483-492` with:

```tsx
<p className="text-sm font-bold text-emerald-900">
    {t('admin.concourse.qset_title', 'Curation')}
    <span className="ml-2 text-lg font-black">{acceptedCt + rejectedCt}</span>
    <span className="text-emerald-600 font-normal text-xs ml-1">
        / {totalCount} {t('admin.concourse.items_label', 'items')}{' '}
        {t('admin.concourse.qset_reviewed', 'reviewed')}
    </span>
</p>
<p className="text-xs text-emerald-700 mt-0.5">
    {t('admin.concourse.qset_accepted', '{{count}} accepted', { count: acceptedCt })}
    {proposedCt > 0 && (
        <>
            {' · '}
            {t('admin.concourse.qset_pending', '{{count}} items still to review', {
                count: proposedCt,
            })}
        </>
    )}
</p>
```

Add `data-testid="curation-progress"` to the inner bar `<div>` at line 536.

Add to `frontend/public/locales/en/admin.json` under `admin.concourse`:

```json
"qset_reviewed": "reviewed",
"qset_accepted": "{{count}} accepted"
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/pages/admin/ConcourseDetailPage.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/admin/ConcourseDetailPage.tsx \
        frontend/src/pages/admin/ConcourseDetailPage.test.tsx \
        frontend/public/locales/en/admin.json
git commit -m "fix(concourse): make the curation counter describe what the progress bar measures"
```

---

### Task 1.4: "Viewing run… / Back to current" shows on the current run

**The defect:** after "Commit and interpret", the amber banner (`AnalysisPage.tsx:1073`) announces you are viewing a past run and offers "Back to current" (`:1095`), while the history entry 40 px above tags that very run **CURRENT**. The banner's visibility condition does not exclude the case where the selected run *is* the current one.

**Files:**
- Test: `frontend/src/pages/admin/AnalysisPage.test.tsx`
- Modify: `frontend/src/pages/admin/AnalysisPage.tsx:1060-1100`

**Interfaces:**
- Consumes: the selected-run id from the `runId` search param and the run list already loaded by the interpret-phase hook (`frontend/src/hooks/admin/useInterpretPhase.ts`).
- Produces: no signature change.

- [ ] **Step 1: Write the failing test**

```tsx
it('hides the historical-run banner when the selected run is the current one', async () => {
    renderWithStore(<AnalysisPage />, {
        route: '?phase=interpret&runId=1',
        preloadedRuns: [{ id: 1, is_current: true }],
    });
    await waitFor(() => expect(screen.queryByText(/viewing run from/i)).not.toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /back to current/i })).not.toBeInTheDocument();
});

it('shows the banner when an older run is selected', async () => {
    renderWithStore(<AnalysisPage />, {
        route: '?phase=interpret&runId=1',
        preloadedRuns: [{ id: 1, is_current: false }, { id: 2, is_current: true }],
    });
    expect(await screen.findByText(/viewing run from/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the tests to verify the first fails**

Run: `cd frontend && npx vitest run src/pages/admin/AnalysisPage.test.tsx -t 'historical-run banner'`
Expected: FAIL — the banner renders for the current run.

- [ ] **Step 3: Gate the banner on the run actually being historical**

Find the JSX condition wrapping the banner at `AnalysisPage.tsx:1060-1073` and require the selected run to differ from the current one — e.g. `selectedRun && !selectedRun.is_current && (…)`. Use whichever current-run flag the interpret hook already exposes; do not introduce a second source of truth for "which run is current".

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/pages/admin/AnalysisPage.test.tsx`
Expected: PASS, both tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/admin/AnalysisPage.tsx frontend/src/pages/admin/AnalysisPage.test.tsx
git commit -m "fix(analysis): stop flagging the current run as a historical one"
```

---

### Task 1.5: Unknown URLs fall through to React Router's debug screen

**The defect:** any unmatched path under `/app/` renders React Router's unstyled default boundary — *"Unexpected Application Error! 404 Not Found — 💿 Hey developer 👋 You can provide a way better UX than this…"* — in Times, with no navigation. Reproduced on `/app/example-project/nonexistent-page` and `/app/admin/users`. `errorElement` exists at `App.tsx:192`, but a route that matches *nothing* never instantiates that layout, so the 404 surfaces at the router root, which has no boundary and no catch-all.

**Files:**
- Test: `frontend/src/App.routing.test.tsx` (create)
- Modify: `frontend/src/App.tsx:83-360` (router array)

**Interfaces:**
- Consumes: `ErrorPage` from `@/pages/ErrorPage` — already exists and is already styled.
- Produces: no signature change.

- [ ] **Step 1: Write the failing test**

```tsx
it('renders the styled error page for an unknown admin URL', async () => {
    renderWithStore(<RouterProvider router={router} />, { route: '/app/example-project/nope' });
    expect(await screen.findByRole('heading', { name: /not found/i })).toBeInTheDocument();
    expect(screen.queryByText(/Hey developer/i)).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/App.routing.test.tsx`
Expected: FAIL — "Hey developer" is present.

- [ ] **Step 3: Add a root catch-all**

As the **last** entry of the `createBrowserRouter([...])` array in `App.tsx`:

```tsx
{
    path: '*',
    element: (
        <PublicPageLayout>
            <ErrorPage />
        </PublicPageLayout>
    ),
},
```

Import `ErrorPage` alongside the other page imports. Keep it last — an earlier `path: '*'` would shadow every route below it.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/App.routing.test.tsx`
Expected: PASS.

- [ ] **Step 5: Verify the real routes still resolve**

Run: `make ci-fast`, then with the stack up visit `/app/example-project/dashboard`, `/hub`, and `/study/bioeconomy-futures` to confirm the catch-all did not swallow them.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/App.tsx frontend/src/App.routing.test.tsx
git commit -m "fix(routing): serve the styled error page for unknown URLs"
```

---

# PHASE 2 — Developer text in the product

Three strings written for developers, shipped to researchers.

### Task 2.1: Remove the API-status note from Account settings

**The defect:** `admin.json:264` reads *"Email changes via the API are coming soon to this page; backend support is live."* — implementation status, in the product. The researcher does not know or care what the backend supports.

**Files:**
- Modify: `frontend/public/locales/en/admin.json:264`
- Modify: `frontend/public/locales/fr/admin.json` (same key)

- [ ] **Step 1: Rewrite the string to describe the user's situation**

```json
"email_locked": "Your email address can't be changed here yet. Contact your administrator to update it."
```

Translate the French key to match: `"Votre adresse e-mail ne peut pas encore être modifiée ici. Contactez votre administrateur pour la mettre à jour."`

- [ ] **Step 2: Check parity**

Run: `cd frontend && npm run i18n-check && npm run check-interpolations`
Expected: no new warnings.

- [ ] **Step 3: Commit**

```bash
git add frontend/public/locales/en/admin.json frontend/public/locales/fr/admin.json
git commit -m "fix(i18n): replace the API-status note on Account settings with user-facing copy"
```

---

### Task 2.2: Stop showing the raw question key in Factor voices

**The defect:** `FactorVoicesPanel.tsx:104` renders `{rec.question_key}` — a database identifier (`question_q_voice`) — as the label above each audio player, three times per factor.

> **Superseded by the Phase 2 fix wave.** The static key→label table prescribed in Step 3 shipped, then was removed: it had one entry, it existed only because of the demo seeder, and it disagreed with the label the same recording carries on the participant Post-Sort tab. `FactorVoicesPanel` now resolves the researcher's own `postsort_config.questions[<id>].label` through the shared `resolveAudioQuestionLabel` helper. No props signature change was needed — the panel already receives `slug`.

**Files:**
- Test: `frontend/src/components/admin/analysis/FactorVoicesPanel.test.tsx`
- Modify: `frontend/src/components/admin/analysis/FactorVoicesPanel.tsx:104`
- Modify: `frontend/public/locales/en/admin.json`

**Interfaces:**
- Consumes: `rec.question_key: string` — the post-sort question identifier, already on the record.
- Produces: no signature change.

- [ ] **Step 1: Write the failing test**

```tsx
it('never renders the raw question key', () => {
    renderWithStore(<FactorVoicesPanel {...propsWithRecording('question_q_voice')} />);
    expect(screen.queryByText('question_q_voice')).not.toBeInTheDocument();
});

it('labels the recording with its human question label', () => {
    renderWithStore(<FactorVoicesPanel {...propsWithRecording('question_q_voice')} />);
    expect(screen.getByText('Spoken comment')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/admin/analysis/FactorVoicesPanel.test.tsx -t 'question key'`
Expected: FAIL — the raw key is in the document.

- [ ] **Step 3: Map key → label, with a safe default**

Replace line 104 with a lookup that falls back to a generic label rather than to the key:

```tsx
{t(`admin.analysis.voices.question.${rec.question_key}`, t('admin.analysis.voices.question_default', 'Spoken comment'))}
```

Add to `admin.json` under `admin.analysis.voices`:

```json
"question_default": "Spoken comment",
"question": { "question_q_voice": "Spoken comment on the Q-sort" }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/admin/analysis/FactorVoicesPanel.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/admin/analysis/FactorVoicesPanel.tsx \
        frontend/src/components/admin/analysis/FactorVoicesPanel.test.tsx \
        frontend/public/locales/en/admin.json
git commit -m "fix(analysis): label recordings with a human question name, not the DB key"
```

---

### Task 2.3: Replace the "No Name" fallback

**The defect:** `Team members` prints the literal string "No Name" in bold as a user's name. The email is right there and is a better identifier.

**Files:**
- Test: `frontend/src/pages/admin/ProjectMembersPage.test.tsx`
- Modify: `frontend/src/pages/admin/ProjectMembersPage.tsx` (the name cell, near the avatar block ending at line 221)

- [ ] **Step 1: Write the failing test**

```tsx
it('falls back to the email when the member has no full name', () => {
    renderWithStore(<ProjectMembersPage />, {
        preloadedMembers: [{ user_id: 2, role: 'member', user: { email: 'nn@example.com', full_name: null } }],
    });
    expect(screen.queryByText(/no name/i)).not.toBeInTheDocument();
    expect(screen.getByText('nn@example.com')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/pages/admin/ProjectMembersPage.test.tsx -t 'no full name'`
Expected: FAIL — "No Name" renders.

- [ ] **Step 3: Use the email as the display name**

The removal handler at line 281 already does `member.user.full_name || member.user.email`. Apply the same expression in the name cell, and drop the "No Name" key from `admin.json`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/pages/admin/ProjectMembersPage.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/admin/ProjectMembersPage.tsx \
        frontend/src/pages/admin/ProjectMembersPage.test.tsx \
        frontend/public/locales/en/admin.json
git commit -m "fix(members): show the email instead of a 'No Name' placeholder"
```

---

### Task 2.4: The same raw-key leak on the participant detail page

**The defect:** found by Task 2.2's review. `ParticipantDetailContent.tsx:565-591` renders `question_key` directly for any key that is not one of `card_N`, `missing_statement`, or `general_comment` — the identical defect Task 2.2 fixed in `FactorVoicesPanel`. Since `question_key` is researcher-generated (`q_<Date.now()>`, `QuestionBuilder.tsx:964`), every custom post-sort question on this screen prints its raw identifier.

**Files:**
- Modify: `frontend/src/components/admin/dashboard/ParticipantDetailContent.tsx:565-591`
- Test: `frontend/src/components/admin/dashboard/ParticipantDetailContent.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
it('never renders a raw question key', () => {
    renderWithProviders(<ParticipantDetailContent {...propsWithAnswer('q_1737849283000')} />);
    expect(screen.queryByText('q_1737849283000')).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run it, confirm it fails with the raw key present**

- [ ] **Step 3: Apply the same safe-default lookup Task 2.2 established**

Reuse `admin.analysis.factor_voices.question_default` if the label fits, or add a sibling default in this screen's own namespace. The rule is the one from Task 2.2: an unmapped key falls back to a generic human label, never to the identifier.

- [ ] **Step 4: Run the test, confirm it passes**

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/admin/dashboard/ParticipantDetailContent.tsx \
        frontend/src/components/admin/dashboard/ParticipantDetailContent.test.tsx
git commit -m "fix(participants): stop rendering raw question keys on the detail page"
```

---

# PHASE 3 — Accessibility and interaction

### Task 3.1: Row actions are invisible but tabbable

**The defect:** each concourse row carries four 32×32 buttons (History, Comments, Edit, Delete). Three sit at `opacity: 0`, revealed by `group-hover` only, and are undiscoverable on touch, where there is no hover at all. "Edit" is permanently visible but at `text-slate-300` — **1.49:1** against white, against a 4.5:1 AA threshold; the mobile variant of the same control is 2.56:1.

> **Audit correction.** The original finding claimed ~108 invisible tab stops and "no visible focus anywhere". That was wrong: the pre-fix source already carried `focus-visible:opacity-100` on all three hover-only buttons, so keyboard focus did reveal the focused button. The measurement behind the claim read resting opacity and never exercised focus. What this task adds is that the whole cluster reveals together on focus, matching hover — an improvement, not a rescue. The contrast defect is the real accessibility failure here, and it was worse than first described.

**Files:**
- Test: `frontend/src/pages/admin/ConcourseDetailPage.test.tsx`
- Modify: `frontend/src/pages/admin/ConcourseDetailPage.tsx` (row action group)

- [ ] **Step 1: Write the failing test**

```tsx
it('reveals row actions on keyboard focus, not only on hover', async () => {
    const user = userEvent.setup();
    renderWithStore(<ConcourseDetailPage />, { preloadedConcourse: concourseWith(1, 0, 0) });

    const edit = screen.getAllByRole('button', { name: /edit/i })[0];
    await user.tab();
    // Walk focus to the row action and assert the group is no longer transparent.
    edit.focus();
    expect(edit.closest('[data-row-actions]')).not.toHaveClass('opacity-0');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/pages/admin/ConcourseDetailPage.test.tsx -t 'keyboard focus'`
Expected: FAIL.

- [ ] **Step 3: Reveal on focus, and raise the resting contrast**

On the desktop action group (`hidden sm:flex items-center gap-1 flex-shrink-0`), add `data-row-actions` and pair every `group-hover:opacity-100` with `group-focus-within:opacity-100`. Raise the resting state of the always-visible Edit button from `opacity-50` + `text-slate-400` to `text-slate-500` at full opacity (4.6:1 — clears AA).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/pages/admin/ConcourseDetailPage.test.tsx`
Expected: PASS.

- [ ] **Step 5: Verify by keyboard in the app**

Tab through the concourse list. Every focused control must be visible at the moment it takes focus.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/admin/ConcourseDetailPage.tsx frontend/src/pages/admin/ConcourseDetailPage.test.tsx
git commit -m "fix(a11y): reveal concourse row actions on keyboard focus"
```

---

### Task 3.2: The Design lock overlay is a trap

**The defect:** the "This study is active. Switch to draft mode to edit." overlay has no close button, does not respond to Escape, and offers a single action whose side effect is heavy — moving a live study to draft suspends collection. Structurally it is a plain `<div>` (`absolute inset-0 z-50 bg-white/60 backdrop-blur-md … pt-24`) with no `role="dialog"`, no `aria-modal`, and an orphan `<h3>`. Its icon is a green globe, which signals neither locking nor caution. Net effect: a researcher cannot *read* their own configuration without suspending data collection.

**Files:**
- Test: `frontend/src/pages/admin/StudyDesignPage.test.tsx`
- Modify: `frontend/src/pages/admin/StudyDesignPage.tsx` (the overlay renders here, not in `components/admin/designer/`)
- Modify: `frontend/public/locales/en/admin.json:1544-1545`

- [ ] **Step 1: Write the failing tests**

```tsx
it('exposes the lock notice as a dialog', () => {
    renderWithStore(<StudyDesignPage />, { preloadedStudy: activeStudy });
    expect(screen.getByRole('dialog')).toHaveAccessibleName(/active/i);
});

it('can be dismissed to read the configuration read-only', async () => {
    const user = userEvent.setup();
    renderWithStore(<StudyDesignPage />, { preloadedStudy: activeStudy });
    await user.click(screen.getByRole('button', { name: /view read-only/i }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run -t 'lock notice'`
Expected: FAIL — no dialog role, no dismiss affordance.

- [ ] **Step 3: Make it a real dialog with two ways out**

Use the existing Radix `Dialog` primitive rather than a hand-rolled overlay: it brings `role="dialog"`, `aria-modal`, focus trapping, Escape handling and a labelled close button for free. Give it two buttons — a secondary **"View read-only"** that dismisses the overlay and leaves the (non-editable) configuration legible, and the existing **"Draft mode"** as the deliberate, destructive-ish action. Swap the green globe for a lock icon in amber; keep the heading text.

Add to `admin.json` under the designer lock section:

```json
"view_read_only": "View read-only"
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run -t 'lock notice'`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/admin/StudyDesignPage.tsx \
        frontend/src/pages/admin/StudyDesignPage.test.tsx \
        frontend/public/locales/en/admin.json
git commit -m "fix(a11y): make the design lock a dismissible dialog with a read-only escape"
```

---

### Task 3.3: Clickable cards that the keyboard cannot reach

**The defect:** `AdminDashboard.tsx:381` and `:513` are `<Card className="group cursor-pointer" onClick={…}>` — divs. The concourse card next to them is a real `<button>`. So on one dashboard, one card is keyboard-operable and its neighbour is not.

**Files:**
- Test: `frontend/src/components/admin/AdminDashboard.test.tsx`
- Modify: `frontend/src/components/admin/AdminDashboard.tsx:381-382`, `:513-514`

- [ ] **Step 1: Write the failing test**

```tsx
it('exposes study cards as keyboard-operable controls', async () => {
    const user = userEvent.setup();
    renderWithStore(<AdminDashboard />, { preloadedStudies: [demoStudy] });

    const card = screen.getByRole('button', { name: /bioeconomy futures/i });
    card.focus();
    await user.keyboard('{Enter}');
    expect(mockNavigate).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/components/admin/AdminDashboard.test.tsx -t 'keyboard-operable'`
Expected: FAIL — no button with that name.

- [ ] **Step 3: Give the cards button semantics**

Wrap the card content in a `<button type="button">` (as the concourse card at line 667 already does), or add `role="button"`, `tabIndex={0}` and an `onKeyDown` handling Enter and Space. Prefer the real element. Keep the visual result identical.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/admin/AdminDashboard.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/admin/AdminDashboard.tsx frontend/src/components/admin/AdminDashboard.test.tsx
git commit -m "fix(a11y): make dashboard study cards keyboard-operable"
```

---

### Task 3.4: Unlabelled switches

**The defect — retracted.** The original finding claimed both switches in `Access → Access rules` returned an empty accessible name. That was wrong, on two counts:

- `<button>` is a **labelable element** (WHATWG HTML §4.10.2, which lists it first), so the existing `<Label htmlFor="password-toggle">` / `<Switch id="password-toggle">` pairing names them legitimately. The claim in this task's original text that "`htmlFor`/`<label>` association does not apply to buttons" is simply false.
- The measurement behind it read the absent `aria-label` **attribute** and mistook it for the computed accessible **name**. Verified two ways: live Chromium, and the project's own happy-dom test environment (which implements `HTMLButtonElement.labels`), both resolve the names pre-fix.

What shipped is therefore **hardening, not a bug fix**: an explicit `aria-labelledby` so the name no longer depends on a single `id`/`htmlFor` pairing that a future edit could silently break. Keep it, but do not cite this task as having fixed a silent control.

**Files:**
- Modify: `frontend/src/pages/admin/RecruitmentPage.tsx:376-390`, `:465-…`

- [ ] **Step 1: Write the failing test**

```tsx
it('gives every access-rule switch an accessible name', () => {
    renderWithStore(<RecruitmentPage />, { preloadedStudy: activeStudy });
    expect(screen.getByRole('switch', { name: /require a password/i })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: /limit collection window/i })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/pages/admin/RecruitmentPage.test.tsx -t 'accessible name'`
Expected: FAIL.

- [ ] **Step 3: Wire the labels**

Each `<Label htmlFor="password-toggle">` / `htmlFor="window-toggle"` already exists and the ids match — but Radix's `Switch` renders a `<button>`, which `htmlFor` does not label. Add an explicit `aria-labelledby` on each `Switch` pointing at its `Label`'s `id`, or add `aria-label` with the same string the label shows.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/pages/admin/RecruitmentPage.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/admin/RecruitmentPage.tsx frontend/src/pages/admin/RecruitmentPage.test.tsx
git commit -m "fix(a11y): give access-rule switches accessible names"
```

---

### Task 3.5: Heading hierarchy and the Login form

**The defect:** on the Dashboard the outline runs `h1 → h3` (Concourse) `→ h2` (Studies) `→ h3` — a skipped level and an out-of-order heading. On Login, the visible "Sign in" is a plain `div` while the real `h1` is visually hidden, so the visual title is not a heading; the submit button says "Continue" under a title reading "Sign in"; there is no link to `/register`, which exists; and the password placeholder is `••••••••`, which mimics a filled field.

**Files:**
- Modify: `frontend/src/components/admin/AdminDashboard.tsx` (Concourse card heading level)
- Modify: `frontend/src/pages/LoginPage.tsx`
- Test: `frontend/src/pages/LoginPage.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
it('uses the visible title as the page heading', () => {
    renderWithStore(<LoginPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
});

it('labels the submit button with the action it performs', () => {
    renderWithStore(<LoginPage />);
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
});

it('offers a route to registration', () => {
    renderWithStore(<LoginPage />);
    expect(screen.getByRole('link', { name: /create an account/i })).toHaveAttribute('href', '/register');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/pages/LoginPage.test.tsx`
Expected: FAIL on all three.

- [ ] **Step 3: Fix both surfaces**

*Login:* promote the visible "Sign in" to the `h1` and delete the hidden duplicate; relabel the button `t('auth.login.submit', 'Sign in')`; add a "Create an account" link to `/register` under the form; clear the password placeholder (an empty field should look empty).

*Dashboard:* raise the Concourse card title from `h3` to `h2` so it sits at the same level as "Studies", keeping document order `h1 → h2 → h2 → h3`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/pages/LoginPage.test.tsx src/components/admin/AdminDashboard.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/LoginPage.tsx frontend/src/pages/LoginPage.test.tsx \
        frontend/src/components/admin/AdminDashboard.tsx frontend/public/locales/en/admin.json
git commit -m "fix(a11y): repair heading hierarchy and login form affordances"
```

---

### Task 3.6: Controls that genuinely have no accessible name

**The defect:** found while retracting Task 3.4. Six controls have **no `id`, no `htmlFor`, and no `aria-label`** anywhere near them — unlike the Access switches, these are real, unambiguous accessible-name gaps, confirmed by reading each one:

- `frontend/src/components/admin/designer/PostSortConfigEditor.tsx:386`, `:446`, `:512`
- `frontend/src/components/admin/designer/QuestionBuilder.tsx:380`
- `frontend/src/pages/admin/ConcourseDetailPage.tsx:655`, `:696`

A screen-reader user hears "switch" or "checkbox" with nothing to identify it.

**Do not blanket-fix every switch in the codebase.** Task 3.4's retraction exists precisely because a control that looks unlabelled in source may be correctly labelled through `<label for>`. `QuestionBuilder.tsx:346` (`req-${id}`) is one such false positive — it has a matching pair. Verify each candidate's computed accessible name before changing it.

**Files:**
- Modify: the six sites above
- Test: the corresponding test files

- [ ] **Step 1: Confirm each one is genuinely unnamed**

```tsx
it('names every settings toggle', () => {
    renderWithProviders(<PostSortConfigEditor {...props} />);
    // getByRole computes the real accessible name — an unnamed control will not match.
    expect(screen.getByRole('switch', { name: /allow audio/i })).toBeInTheDocument();
});
```

Run it first: it must fail because the name does not resolve, not because the element is absent.

- [ ] **Step 2: Add the label association**

Prefer a visible `<Label htmlFor>` pointing at an `id` on the control — that names it *and* gives a click target. Use `aria-label` only where no visible text exists to point at.

- [ ] **Step 3: Confirm the tests pass, and that no control gained a name that differs from its visible text**

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/admin/designer frontend/src/pages/admin/ConcourseDetailPage.tsx
git commit -m "fix(a11y): name the designer and concourse controls that had none"
```

---

# PHASE 4 — Design tokens

### Task 4.1: One primary button colour

**The defect:** four primary fills coexist — `bg-indigo-600` ×32, `bg-amber-500` ×6, `bg-slate-900` ×4, `bg-emerald-600` ×1. The sharpest case: inside one card on `Access`, "New access link" is indigo and the empty-state "Create access link" is near-black, for the same action.

**Decision:** `indigo-600` is the primary (32 of 43 uses). `amber` survives **only** as the warning/destructive-adjacent variant on the design lock and archive actions; `slate-900` and `emerald-600` as primary fills go away.

**Files:**
- Modify: every file matched by the sweep below.

- [ ] **Step 1: Inventory before touching anything**

```bash
cd frontend/src && grep -rn "bg-slate-900\|bg-emerald-600\|bg-amber-500" --include=*.tsx pages/admin components/admin
```

Record each hit and decide: primary → `Button` default variant; warning → keep amber; destructive → the destructive variant.

- [ ] **Step 2: Write the guard test**

```tsx
// frontend/src/components/ui/button.test.tsx
it('renders the default variant with the single primary fill', () => {
    render(<Button>Go</Button>);
    expect(screen.getByRole('button')).toHaveClass('bg-indigo-600');
});
```

- [ ] **Step 3: Replace ad-hoc fills with variants**

Route every primary action through `<Button>`'s default variant instead of a hand-written `className`. In particular, make the empty-state "Create access link" on `RecruitmentPage` use the same variant as "New access link".

- [ ] **Step 4: Verify no stray primaries remain**

```bash
cd frontend/src && grep -rn "bg-slate-900\|bg-emerald-600" --include=*.tsx pages/admin components/admin
```
Expected: no hits, or only documented non-button uses.

- [ ] **Step 5: Run the full check and commit**

```bash
make ci-fast
git add frontend/src
git commit -m "style(admin): collapse four primary button fills into one"
```

---

### Task 4.2: One capitalisation rule

**The defect:** "Add Item" and "Bulk Import" (Title Case) sit beside "Create study", "Import study", "Add study" (sentence case).

**Decision:** sentence case everywhere — it is the majority and it reads better at 13 px.

**Files:**
- Modify: `frontend/public/locales/en/admin.json`

- [ ] **Step 1: Find every Title-Cased action label**

```bash
cd frontend/public/locales/en && python3 -c "
import json, re
d = json.load(open('admin.json'))
def walk(o, p=''):
    if isinstance(o, dict):
        for k, v in o.items(): walk(v, f'{p}.{k}')
    elif isinstance(o, str) and re.match(r'^([A-Z][a-z]+ )+[A-Z][a-z]+$', o):
        print(f'{p}: {o}')
walk(d)"
```

- [ ] **Step 2: Rewrite each to sentence case**

"Add Item" → "Add item", "Bulk Import" → "Bulk import", "Draft Mode" → "Draft mode". Leave proper nouns and acronyms alone ("Export CSV", "Setup 2FA" → "Set up 2FA" — that one is also a grammar fix).

- [ ] **Step 3: Mirror in French, then check parity**

Run: `cd frontend && npm run i18n-check && npm run check-interpolations`

- [ ] **Step 4: Commit**

```bash
git add frontend/public/locales
git commit -m "style(i18n): use sentence case for every action label"
```

---

### Task 4.3: One date/time format

**The defect:** four formats ship today — `1 minute ago`, `7/26/2026` (from a bare `toLocaleDateString()` at `ProjectMembersPage.tsx:271`), `Jul 26, 17:25` (24 h) and `Jul 26, 2026, 05:38 PM` (12 h). The last two appear on the same Analysis screen.

**Decision:** one module, three functions, 24-hour clock, locale-aware via the active i18n language rather than the browser's.

**Files:**
- Create: `frontend/src/lib/datetime.ts`, `frontend/src/lib/datetime.test.ts`
- Modify: `pages/admin/ProjectMembersPage.tsx:271`, `pages/admin/AnalysisPage.tsx`, `components/admin/dashboard/InteractiveDataView.columns.tsx`, `components/admin/dashboard/RecentActivityCard.tsx`

- [ ] **Step 1: Write the failing tests**

```ts
import { formatDate, formatDateTime, formatRelative } from './datetime';

describe('datetime', () => {
    const d = new Date('2026-07-26T17:25:00Z');

    it('formats a date without a clock', () => {
        expect(formatDate(d, 'en')).toBe('26 Jul 2026');
    });

    it('formats date and time on a 24-hour clock', () => {
        expect(formatDateTime(d, 'en')).toBe('26 Jul 2026, 17:25');
    });

    it('formats a relative time for the recent past', () => {
        expect(formatRelative(new Date(Date.now() - 60_000), 'en')).toBe('1 minute ago');
    });

    it('follows the active app locale, not the browser', () => {
        expect(formatDate(d, 'fr')).toBe('26 juil. 2026');
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/lib/datetime.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the module**

```ts
// frontend/src/lib/datetime.ts
type Locale = string;

export function formatDate(value: Date | string, locale: Locale): string {
    return new Intl.DateTimeFormat(locale, {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    }).format(typeof value === 'string' ? new Date(value) : value);
}

export function formatDateTime(value: Date | string, locale: Locale): string {
    return new Intl.DateTimeFormat(locale, {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }).format(typeof value === 'string' ? new Date(value) : value);
}

export function formatRelative(value: Date | string, locale: Locale): string {
    const date = typeof value === 'string' ? new Date(value) : value;
    const seconds = Math.round((date.getTime() - Date.now()) / 1000);
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
    const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
        ['year', 31_536_000],
        ['month', 2_592_000],
        ['day', 86_400],
        ['hour', 3_600],
        ['minute', 60],
    ];
    for (const [unit, size] of units) {
        if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
    }
    return rtf.format(Math.round(seconds), 'second');
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/lib/datetime.test.ts`
Expected: PASS.

- [ ] **Step 5: Replace every call site**

```bash
cd frontend/src && grep -rn "toLocaleDateString\|toLocaleTimeString\|toLocaleString" --include=*.tsx pages components
```

Replace each with `formatDate` / `formatDateTime`, passing the active i18n language (`i18n.language`). Keep `formatRelative` for the "N minutes ago" surfaces on the dashboard and study overview.

- [ ] **Step 6: Run the full check and commit**

```bash
make ci-fast
git add frontend/src
git commit -m "refactor(admin): route every date through one 24-hour, locale-aware formatter"
```

---

# PHASE 5 — Vocabulary and naming canon

### Task 5.1: One word per concept

**The defect:** four words for people (*Team members*, *collaborators*, *researchers*, *users* — all four on the Team members screen alone); five names for the access screen (sidebar *Access*, route `/recruitment`, card *Recruitment links*, button *New access link*, empty state *Create access link*); three for collection state (*Active*, *Collecting responses*, *COLLECTING DATA*); and *Locale breakdown* as a heading over a *Language* column.

**Decision — the canonical terms:**

| Concept | Canonical | Retire |
|---|---|---|
| A person with project access | **member** | collaborator, researcher, user |
| The access-configuration screen | **Access** | Recruitment (UI copy only — the route stays) |
| A shareable participation link | **access link** | recruitment link |
| A study collecting responses | **Active** | Collecting responses, Collecting data |
| Language of a response | **Language** | Locale |

**Files:**
- Modify: `frontend/public/locales/en/admin.json`, `frontend/public/locales/fr/admin.json`

- [ ] **Step 1: Find every occurrence of a retired term**

```bash
cd frontend/public/locales/en && grep -n "collaborator\|researcher\|Locale\|Recruitment\|Collecting" admin.json
```

- [ ] **Step 2: Rewrite to the canonical term**

Work key by key. Do not change route paths, API fields, or component names — copy only.

- [ ] **Step 3: Check that no retired term survives in the UI**

```bash
cd frontend/public/locales/en && grep -n "collaborator\|Locale breakdown\|Collecting data" admin.json
```
Expected: no hits.

- [ ] **Step 4: Mirror in French, check parity, commit**

```bash
cd frontend && npm run i18n-check && npm run check-interpolations
git add frontend/public/locales
git commit -m "style(i18n): one canonical term per concept across the admin"
```

---

### Task 5.2: Restore the naming canon across sidebar, breadcrumb and title

**The defect:** the project settings page shows sidebar "Project settings" / breadcrumb "**Settings**" / H1 "Project settings"; the study settings page shows sidebar "Study settings" / breadcrumb "**Settings**" / H1 "**Settings**". Two different pages therefore carry an identical breadcrumb leaf. `CLAUDE.md` requires all three keys to carry the same label.

**Files:**
- Modify: `frontend/public/locales/en/admin.json` (`admin.sidebar.*`, `admin.breadcrumbs.*`, `admin.*.title`)
- Modify: `frontend/src/components/admin/AdminLayout.tsx` (breadcrumb `mapping` table)
- Test: `frontend/src/components/admin/AdminLayout.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
it('uses the same label in sidebar, breadcrumb and page title', () => {
    renderWithStore(<AdminLayout />, { route: '/app/example-project/settings' });
    expect(screen.getByRole('navigation', { name: /breadcrumb/i })).toHaveTextContent('Project settings');
});

it('distinguishes study settings from project settings in the breadcrumb', () => {
    renderWithStore(<AdminLayout />, { route: '/app/example-project/studies/s/settings' });
    expect(screen.getByRole('navigation', { name: /breadcrumb/i })).toHaveTextContent('Study settings');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/admin/AdminLayout.test.tsx -t 'same label'`
Expected: FAIL — both breadcrumbs read "Settings".

- [ ] **Step 3: Align the three keys per section**

For each admin section, set `admin.sidebar.<s>`, `admin.breadcrumbs.<s>` and `admin.<s>.title` to the same string. Project settings → "Project settings"; study settings → "Study settings". Update the `mapping` table in `AdminLayout.tsx` so the `settings` segment resolves by context rather than to a bare "Settings".

- [ ] **Step 4: Audit every fallback against the JSON**

The code fallback must equal the canonical English label. Sweep for mismatches:

```bash
cd frontend/src && grep -rno "t('admin\.[a-z_.]*', *'[^']*'" --include=*.tsx . | head -60
```

Fix each mismatch by making the fallback match the JSON.

**Also sweep for the opposite defect — `t()` calls with no fallback at all**, which the grep above cannot surface by construction (it only matches calls that already have one). `InteractiveDataView.columns.tsx` alone has 11, including `admin.data.table.lang` at line 273:

```bash
cd frontend/src && grep -rnoE "t\('admin\.[a-z_.]*'\)" --include=*.tsx . | head -60
```

Add the canonical English label as the fallback for each.

**Most important: resolve every `t()` key against the locale JSON.** Phase 2's whole-branch review found **twelve `t()` calls whose keys exist in neither `en/admin.json` nor `en/participant.json`** — i18next then renders the raw dotted key path as UI text, which is the purest instance of the defect class Phase 2 set out to remove. Confirmed sites include:

- `components/auth/RequireAdmin.tsx:53-54` — the full-screen access-denied gate renders `common.errors.access_denied.title` and `…message`
- `components/admin/dashboard/InteractiveDataView.tsx:809` — the destructive confirm button of "clear all participants" reads `common.confirm_delete`
- `pages/admin/ProjectMembersPage.tsx:87,96` — changing a member's role toasts `admin.projects.settings.team.role_update_success` / `…role_update_error`
- `hooks/admin/useStudyDesignPage.ts:484`, `pages/ErrorPage.helpers.ts:43,44,87,88`, `pages/RegistrationPage.tsx:151`, `hooks/participant/useFineSort.ts:464` (a participant-facing `window.confirm`)

Note the `t('key') || 'Fallback'` guard used at ~17 sites (e.g. `PostSortConfigEditor.tsx:504-604`) is **inert**: `t()` returns the key itself on a miss, which is truthy, so `||` never fires. Write the check as a script that loads the locale JSON and asserts every key referenced in source resolves — then wire it into `npm run i18n-check` so this cannot regress.

*(The `ConcourseDetailPage.tsx:484` `'Q-set'` / `'Curation'` divergence originally listed here was already retired by Phase 1 Task 1.3.)*

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/admin/AdminLayout.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/admin/AdminLayout.tsx \
        frontend/src/components/admin/AdminLayout.test.tsx \
        frontend/public/locales
git commit -m "fix(admin): restore the sidebar/breadcrumb/title naming canon"
```

---

### Task 5.3: Remove duplicated actions and titles

**The defect:** "Create study" (page header) and "Add study" (section header) are the same action 160 px apart, in different button styles. "Team members" is the H1 *and* the card title below it, with the same icon. The study title renders twice, stacked, on `Design` — which also violates the admin header policy, since the L2 header should carry the page's function ("Design"), not the study name already in the breadcrumb. And `Study settings` states "Study must be archived before deletion" twice, 60 px apart.

**Files:**
- Modify: `components/admin/AdminDashboard.tsx` (drop one of the two study-creation buttons)
- Modify: `pages/admin/ProjectMembersPage.tsx` (drop the redundant card title)
- Modify: the Design page header (L2 header → "Design")
- Modify: `pages/admin/GeneralSettingsPage.tsx` (drop the duplicated archive-before-delete note and its stray `*`)

- [ ] **Step 1: Write the failing tests**

```tsx
it('offers exactly one study-creation action', () => {
    renderWithStore(<AdminDashboard />, { preloadedStudies: [demoStudy] });
    expect(screen.getAllByRole('button', { name: /(create|add) study/i })).toHaveLength(1);
});

it('does not repeat the page title as a card title', () => {
    renderWithStore(<ProjectMembersPage />);
    expect(screen.getAllByText('Team members')).toHaveLength(1);
});

it('states the archive precondition once', () => {
    renderWithStore(<GeneralSettingsPage />, { preloadedStudy: activeStudy });
    expect(screen.getAllByText(/must be archived before deletion/i)).toHaveLength(1);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run -t 'exactly one study-creation'`
Expected: FAIL.

- [ ] **Step 3: Remove the duplicates**

Keep the page-header "Create study" and drop the section-level "Add study" (the page header is the established home for primary actions). Drop the "Team members" card title, keeping the H1 and the descriptive sub-line. On `Design`, set the L2 header to the page function per the header policy. Delete the duplicated deletion note under the button.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run -t 'exactly one study-creation'`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src
git commit -m "fix(admin): remove duplicated actions, titles and notices"
```

---

# PHASE 6 — Visual finish

### Task 6.1: A slug input that measures its own prefix

**The defect:** the same prefixed-input pattern ships with two hard-coded paddings, and both are wrong. `ProjectSettingsPage.tsx:177` and `CreateProjectPage.tsx:167` use `pl-32` (128 px) for an `/app/` prefix ~60 px wide, leaving a 68 px gap. `RecruitmentPage.tsx:266` uses `pl-14` (56 px) for a `/study` prefix exactly 56 px wide, so the text collides with the prefix and reads `/studybioeconomy-futures`.

**Files:**
- Create: `frontend/src/components/ui/slug-input.tsx`, `frontend/src/components/ui/slug-input.test.tsx`
- Modify: `pages/admin/ProjectSettingsPage.tsx:177`, `pages/admin/CreateProjectPage.tsx:167`, `pages/admin/RecruitmentPage.tsx:266`

**Interfaces:**
- Produces: `SlugInput` — props `{ prefix: string; value: string; onChange: (v: string) => void; disabled?: boolean; className?: string; id?: string }`. Consumed by all three pages above.

- [ ] **Step 1: Write the failing test**

```tsx
it('keeps a gutter between the prefix and the value', () => {
    render(<SlugInput prefix="/app/" value="example-project" onChange={() => {}} />);
    const input = screen.getByRole('textbox');
    const prefix = screen.getByText('/app/');
    // The input's text must start after the prefix, with breathing room.
    const gap = input.getBoundingClientRect().left + parseFloat(getComputedStyle(input).paddingLeft)
              - prefix.getBoundingClientRect().right;
    expect(gap).toBeGreaterThanOrEqual(8);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/components/ui/slug-input.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement, measuring rather than guessing**

Render the prefix in an absolutely-positioned span, measure it with a ref + `ResizeObserver`, and set the input's `paddingLeft` to `prefixWidth + 12`. No `pl-*` class. jsdom reports zero-width layout, so also assert the computed style is driven by the measured value rather than a constant.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npx vitest run src/components/ui/slug-input.test.tsx`
Expected: PASS.

- [ ] **Step 5: Adopt it at all three call sites, then verify in the browser**

Confirm `/app/ example-project` and `/study/ bioeconomy-futures` both read with one clean gutter, at 1440 px and 768 px.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/ui/slug-input.tsx frontend/src/components/ui/slug-input.test.tsx \
        frontend/src/pages/admin/ProjectSettingsPage.tsx \
        frontend/src/pages/admin/CreateProjectPage.tsx \
        frontend/src/pages/admin/RecruitmentPage.tsx
git commit -m "fix(ui): measure the slug prefix instead of hard-coding its padding"
```

---

### Task 6.2: Align the two access-rule switches

**The defect:** the two settings rows in `Access → Access rules` are built differently, so their switches sit 17 px apart horizontally and their labels use different weights. Row 1 (`RecruitmentPage.tsx:358`): `flex items-center justify-between gap-4 p-4 bg-slate-50/50 rounded-xl border border-slate-100`, label `font-bold`, description `text-slate-500`. Row 2 (`:447`): `flex items-start justify-between gap-4`, no padding, no surface, label `font-black`, description `text-slate-400 font-medium`.

**Files:**
- Modify: `frontend/src/pages/admin/RecruitmentPage.tsx:356-391`, `:446-465`

- [ ] **Step 1: Write the failing test**

```tsx
it('renders both access-rule rows with the same container treatment', () => {
    renderWithStore(<RecruitmentPage />, { preloadedStudy: activeStudy });
    const rows = screen.getAllByTestId('access-rule-row');
    expect(rows).toHaveLength(2);
    expect(rows[0].className).toBe(rows[1].className);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/pages/admin/RecruitmentPage.test.tsx -t 'same container treatment'`
Expected: FAIL — classes differ.

- [ ] **Step 3: Give both rows one shape**

Apply row 1's treatment to both — it is the more legible of the two — with `data-testid="access-rule-row"`, `items-center`, label `font-bold text-slate-700`, description `text-xs text-slate-500`. Extract a small local `AccessRuleRow` component so the two cannot drift again.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npx vitest run src/pages/admin/RecruitmentPage.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/admin/RecruitmentPage.tsx frontend/src/pages/admin/RecruitmentPage.test.tsx
git commit -m "style(access): align both access-rule rows on one row component"
```

---

### Task 6.3: Fix the orphaned tile and the stat-tile split

**The defect:** `DataPrivacyPage.tsx:401` lays 4 tiles into `grid-cols-2 sm:grid-cols-3`, so "Anonymised" drops alone onto a second row beside two empty cells. Its `0` is indigo while the three neighbouring zeros are black, with no semantic reason. Line 461 puts 2 tiles into `grid-cols-2`, making them 390 px wide against 253 px above — same component, different size. Separately, `Data privacy` labels tiles in UPPERCASE while `Data` and `Overview` use sentence case with an icon.

**Files:**
- Modify: `frontend/src/pages/admin/DataPrivacyPage.tsx:401`, `:461`, and the tile component
- Test: `frontend/src/pages/admin/DataPrivacyPage.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
it('lays the four participant tiles on one row at desktop width', () => {
    renderWithStore(<DataPrivacyPage />, { preloadedStudy: activeStudy });
    expect(screen.getByTestId('participants-snapshot')).toHaveClass('sm:grid-cols-4');
});

it('does not colour a zero differently from its neighbours', () => {
    renderWithStore(<DataPrivacyPage />, { preloadedStudy: activeStudy });
    const values = screen.getAllByTestId('stat-value');
    const colours = new Set(values.map((v) => v.className.match(/text-\w+-\d+/)?.[0]));
    expect(colours.size).toBe(1);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/pages/admin/DataPrivacyPage.test.tsx`
Expected: FAIL on both.

- [ ] **Step 3: Fix grid, colour and label case**

Change line 401 to `grid grid-cols-2 sm:grid-cols-4 gap-4`. Drop the indigo on the "Anonymised" value so all four read the same. Give the "Audio storage" grid the same tile width as the snapshot grid rather than stretching two tiles across the full row. Switch the tile labels from uppercase to the sentence-case-with-icon treatment used on `Data` and `Overview`, so one stat tile exists in the product rather than two.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/pages/admin/DataPrivacyPage.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/admin/DataPrivacyPage.tsx frontend/src/pages/admin/DataPrivacyPage.test.tsx
git commit -m "style(privacy): unify the stat tiles and stop orphaning the fourth"
```

---

### Task 6.4: Raise the typographic floor

**The defect:** `--font-size-2xs` resolves to 10–11 px and is used **235 times**. Alongside it sit 16 arbitrary values outside the scale: `text-[9px]` ×10 (including the "Recently completed" status badge), `text-[10px]` ×3, `text-[8px]` ×1, `text-[13px]` ×2. The scale itself is well built — it is simply being bypassed.

**Files:**
- Modify: `frontend/src/styles/typography.css:7`
- Modify: every file with a bracketed font size

- [ ] **Step 1: Inventory**

```bash
cd frontend/src && grep -rn "text-\[[0-9]*px\]" --include=*.tsx . | sort
```

- [ ] **Step 2: Raise the floor**

In `typography.css:7`, lift `--font-size-2xs` to `clamp(0.6875rem, 0.66rem + 0.16vw, 0.75rem)` — 11 px to 12 px. That keeps the fluid behaviour and puts the smallest text in the product at the readability floor rather than below it.

- [ ] **Step 3: Replace every bracketed size with a scale step**

`text-[8px]`, `text-[9px]`, `text-[10px]` → `text-2xs`. `text-[13px]` → `text-sm`. No bracketed font size survives.

- [ ] **Step 4: Verify nothing overflows at the larger size**

```bash
make ci-fast
```
Then check the densest surfaces at 1440 px and 768 px: the concourse list, the responses table, the participant metadata rows. Badges must not wrap.

- [ ] **Step 5: Commit**

```bash
git add frontend/src
git commit -m "style(type): raise the smallest text to 11px and remove off-scale sizes"
```

---

### Task 6.5: Raise the contrast floor

**The defect:** `text-slate-400` (2.85:1 on white) ×200 and `text-slate-300` (1.68:1) ×35 — both below the 4.5:1 AA threshold for body text. They carry real content: participant metadata, the responses table's `—` values, the "36 / 36 items" counter, the slug-change warning on project settings.

**Files:**
- Modify: files matched by the sweep

- [ ] **Step 1: Inventory by role**

```bash
cd frontend/src && grep -rn "text-slate-300\|text-slate-400" --include=*.tsx pages/admin components/admin
```

Sort each hit into **text** (must reach 4.5:1) or **decorative icon** (3:1 is acceptable for non-text).

- [ ] **Step 2: Promote the text hits**

`text-slate-400` → `text-slate-500` (4.6:1). `text-slate-300` on text → `text-slate-500`. Leave purely decorative icon strokes alone, but never let an icon be the sole carrier of information — the 10 px `lucide-monitor` glyph between two `·` separators on the study overview and data rows is `aria-hidden` and unlabelled, so either give it a visible text label or remove it and its orphan separators.

- [ ] **Step 3: Verify the important small print**

The slug-change warning ("Changing the slug will update all your research dashboard links") is consequential copy currently rendered in the page's most discreet style. Give it the same weight as other inline warnings.

- [ ] **Step 4: Run the full check and commit**

```bash
make ci
git add frontend/src
git commit -m "style(a11y): raise muted text to the AA contrast threshold"
```

---

### Task 6.6: The frozen clear-date button on Access

**The defect:** found by the Phase 1 whole-branch review and machine-verified by recompiling with `babel-plugin-react-compiler`. `RecruitmentPage.tsx:514` and `:552` have the same React Compiler exposure that caused Phase 1's Task 1.1 defect: `accessForm` is a react-hook-form `UseFormReturn`, a `useRef`-backed object with stable identity that RHF mutates in place — structurally identical to a TanStack `table`. The whole "Collection window" section compiles into one memo block keyed on `accessForm`, `isArchived`, `showWindowPickers` and `t`, none of which change when a form field does:

```js
if ($[187] !== accessForm || $[188] !== isArchived || $[189] !== showWindowPickers || $[190] !== t) {
    t75 = showWindowPickers && <>… {accessForm.watch("startDate") && !isArchived && <button …/>} …</>;
```

So on **Access → Access rules**, enabling the collection window and typing a start date leaves the clear-✕ button frozen at whatever it last evaluated to — absent when it should appear, or lingering after the date is cleared. Both dates, both directions.

**The fix is NOT `'use no memo'`.** Hoist the watched values to the component body, where the compiler emits un-memoized reads that the JSX can then key on:

```tsx
const startDate = accessForm.watch('startDate');
const endDate = accessForm.watch('endDate');
```

(Verified: `slugForm.formState.isSubmitting || !slugForm.formState.isDirty` in the same file compiles to a plain `const` recomputed every render, which is why the Save buttons never had this problem.) `useWatch({ control, name })` works equally well.

**Files:**
- Modify: `frontend/src/pages/admin/RecruitmentPage.tsx:514`, `:552`
- Test: `frontend/src/pages/admin/RecruitmentPage.test.tsx`

- [ ] **Step 1: Reproduce**

With the demo stack up, open Access → Access rules, enable "Limit collection window", and type a start date. The clear-✕ does not appear.

- [ ] **Step 2: Write the failing test**

```tsx
it('shows the clear button once a start date is entered', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RecruitmentPage />);
    await user.click(await screen.findByRole('switch', { name: /limit collection window/i }));
    await user.type(screen.getByLabelText(/start date/i), '2026-08-01');
    expect(await screen.findByRole('button', { name: /clear start date/i })).toBeVisible();
});
```

Note Vitest does not run the React Compiler pass, so this test will not reproduce the compiler freeze — it guards the behaviour, not the mechanism. Reproduce the mechanism in E2E (`playwright.config.ts` starts `npm run dev`, which does run the compiler), as Task 1.1 did.

- [ ] **Step 3: Hoist the watched values**

- [ ] **Step 4: Verify in the browser** — both dates, both directions (appearing and clearing).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/admin/RecruitmentPage.tsx frontend/src/pages/admin/RecruitmentPage.test.tsx
git commit -m "fix(access): unfreeze the clear-date buttons under React Compiler memoization"
```

---

### Task 6.7: A lint gate for accessible names

**Why:** Phase 3's whole-branch review called this *"the highest-leverage follow-up in the whole remediation"*. Biome's a11y rules are clearly enabled (the repo carries `biome-ignore lint/a11y/*` comments), but **nothing enforces that an interactive control has an accessible name**. That is why the class kept regrowing: Phase 3 named 12 controls by hand, and a sweep immediately found ~76 more.

Without a gate, every later phase re-introduces the defect at whatever rate new controls are written. With one, the 22 icon-only buttons below would have been caught mechanically, on the commit that created them.

**Files:**
- Modify: `frontend/biome.json` (or the equivalent lint config)
- Modify: whatever the rule then flags

- [ ] **Step 1: Turn the rule on and count the damage**

Enable Biome's `a11y/useButtonType`, `a11y/useAriaPropsForRole`, and above all the rules covering accessible names on interactive elements. Run `npm run lint` and record the count — the review's own enumeration put it at ~76 unnamed controls out of ~465.

- [ ] **Step 2: Fix by cluster, highest impact first**

The review enumerated these; verify each before changing it (Task 3.4's retraction exists because a control that *looks* unnamed in source may be correctly named by `<label for>`):

1. **`InteractiveDataView.columns.tsx:504, 516, 531, 636, 652, 664, 676`** — seven `<TooltipTrigger>` without `asChild`. Radix renders each as a real focusable `<button>` containing only a `<div>` and an icon; the descriptive text lives in `TooltipContent`, wired as `aria-describedby` only while open. That is **up to seven unnamed tab stops per participant row** on the Data table — the single largest instance of this defect in the product.
2. **22 icon-only `<Button>`s**, several destructive: delete a survey question (`QuestionBuilder.tsx:300`), delete a choice option (`:808`), delete a process step (`ProcessStepEditor.tsx:121`), delete a methodology tip (`InterfaceEditor.tsx:346`), delete a tag (`ConcourseDetailPage.tsx:1648`), remove a partner (`BrandingEditor.tsx:304`), save/cancel inline statement edit (`QSortEditor.tsx:179, 187`), copy TOTP secret (`AccountSettingsPage.tsx:338`), copy invite link (`ProjectMembersPage.tsx:572`), play/pause participant audio (`AudioPlayer.tsx:106`), table paging (`InteractiveDataView.tsx:932, 944`), and the six accent-colour swatches at `BrandingEditor.tsx:135`, which currently announce identically to each other.
3. **`StudyDesignPage.tsx:188`** — the designer's language switcher. Its only text sits in a `<span className="hidden sm:inline">`, so **below the `sm` breakpoint it has no accessible name at all**.
4. **~40 `<Input>`/`<Textarea>`** with a visually adjacent `<Label>` carrying no `htmlFor` — systemic across `ConcourseDetailPage` (11), `QuestionBuilder` (5), `QSortEditor` (3), `InterfaceEditor` (4), `ProcessStepEditor` (4), `BrandingEditor` (2), the memo module, and `ProjectMembersPage.tsx:508` (the invite form's only field).
5. **`ImportFromConcourseDialog.tsx:262`** — the one unnamed `<Checkbox>` left in the admin.

- [ ] **Step 3: Also ban `text-slate-300` on interactive elements**

Task 3.1 fixed the contrast on one file. `text-slate-300` (1.45:1 on white) still sits on interactive controls in `QuestionBuilder.tsx:209, 273, 303, 811`, `ProcessStepEditor.tsx:80, 124`, `InterfaceEditor.tsx:357`, `QSortEditor.tsx:139, 290`, `BrandingEditor.tsx:313` — several of them delete buttons.

- [ ] **Step 4: Commit**

```bash
git add frontend/biome.json frontend/src
git commit -m "fix(a11y): enforce accessible names with a lint gate and clear the backlog"
```

---

### Task 6.7b: Burn down the label backlog

**The work:** 40 `noLabelWithoutControl` errors held behind 13 dated file-level suppressions that Task 6.7a landed. Each is a `<Label>` with no `htmlFor`, sitting beside a control with no `id` — so the control has no accessible name, and clicking the label does nothing.

Distribution, measured: `QuestionBuilder` 9, `ConcourseDetailPage` 8, `ProcessStepEditor` 4, `IntroductionEditor` 4, `InterfaceEditor` 3, `RecruitmentPage` 2, `ProjectMembersPage` 2, `Step1_Feedback` 2, `ImportStudyDialog` 2, `QSortEditor` 1, `PostSortConfigEditor` 1, `ImportFromConcourseDialog` 1, `BrandingEditor` 1.

> **The standing rule, because the gate cannot tell the difference:** never add a bare `id` without the matching `htmlFor` in the same hunk. Task 6.7a's first gate silenced its checker on any `id`; that hole is closed, but the discipline is what makes the fix real rather than the count going down.

**Expected side effect:** several of the 9 remaining unnamed `<SelectTrigger>` findings resolve for free. Verified in Chromium that `<label for="b1">Role</label><button id="b1" role="combobox">Member</button>` yields the accessible name "Role" — so labelling the field names the trigger.

**Out of scope:** the five `<SelectTrigger>` that already carry `<SelectValue placeholder={t(…)} />` — they have a real translated name and are not in the backlog.

**Files:** the 13 above, plus `frontend/a11y-baseline.json` as counts drop, minus each `biome-ignore-all` line as its file reaches zero.

- [ ] **Step 1: Work file by file, committing per file or per small group**

For each `<Label>` without `htmlFor`: give the control an `id`, point the label at it in the same edit. Prefer the control's existing `name`/field key for the id so it stays stable.

- [ ] **Step 2: Remove that file's suppression as it reaches zero**

The gate re-lints suppressed files, so a stale suppression fails as "baseline still records N". That is the burn-down working — re-run with `--update` and confirm the count dropped by what you fixed, not more.

- [ ] **Step 3: Verify the label actually labels**

```tsx
it('names the field and lets its label focus it', async () => {
    const user = userEvent.setup();
    renderWithProviders(<QuestionBuilder {...props} />);
    const field = screen.getByRole('textbox', { name: /question text/i });
    await user.click(screen.getByText(/question text/i));
    expect(field).toHaveFocus();
});
```

The focus assertion is what distinguishes a real pairing from an `id` that satisfies a linter.

- [ ] **Step 4: Commit**

```bash
git commit -m "fix(a11y): pair every label with its control"
```

---

### Task 6.7c: Name the 37 controls the gate still records

**The work:** the baseline at `frontend/a11y-baseline.json` records **37** controls with no accessible name after Task 6.7b: `<Button>`, `<TooltipTrigger>`, `<SelectTrigger>` and bare `<button>`. Run `cd frontend && node scripts/check-a11y-names.mjs --list` for the live set — do not work from a copied list, it moves.

The largest single cluster is `InteractiveDataView.columns.tsx` — seven `<TooltipTrigger>` without `asChild`, each rendering a focusable Radix `<button>` whose only content is a `<div>` and an icon, with the descriptive text in `TooltipContent` wired as `aria-describedby` only while open. That is up to **seven unnamed tab stops per participant row** on the Data table.

**Prefer `asChild`** where a `TooltipTrigger` wraps a control that can carry the name itself. Otherwise `aria-label`, through `t()`, in all nine admin locales.

**The standing rule still applies:** never add a bare `id` without the matching `htmlFor` in the same hunk.

- [ ] **Step 1: `node scripts/check-a11y-names.mjs --list`, group by mechanism**
- [ ] **Step 2: Name them, asserting the computed name** — `getByRole(role, { name })`, never an attribute check
- [ ] **Step 3: Re-baseline; confirm the drop equals what you fixed**
- [ ] **Step 4: Commit** — `fix(a11y): name the controls the gate records as anonymous`

---

### Task 6.7d: Contrast and role hygiene

**The work, both measured:**

1. **13 interactive controls at 1.45:1** (`text-slate-300` on white, against a 4.5:1 threshold), recorded in the baseline. Task 3.1 fixed one file; these are the rest — `QuestionBuilder.tsx:209, 273, 303, 811`, `ProcessStepEditor.tsx:80, 124`, `InterfaceEditor.tsx:357`, `QSortEditor.tsx:139, 290`, `BrandingEditor.tsx:313` and siblings. Several are delete buttons.
2. **`role="button"` + `tabIndex={0}` divs** at `ImageUploadInput.tsx:194`, `ImportFromConcourseDialog.tsx:248`, `StudyStatusControl.tsx:115`, `QSortEditor.tsx:200` — the pattern Task 3.3 replaced with native `<button>` on the dashboard.

`text-slate-500` is 4.6:1 and is the token Task 3.1 settled on.

**If you enable `useSemanticElements` to catch the divs, use line-level suppressions for the dnd-kit exceptions, not file-level ones** — Phase 3 learned that file-scoped suppressions blind the largest files, and Biome 2.5.5 has no unused-suppression rule to force their removal.

- [ ] **Step 1: Fix the contrast; confirm the baseline's low-contrast count drops to 0**
- [ ] **Step 2: Convert the four divs to native `<button>`, preserving layout** (Task 3.3's `AdminDashboard` conversion is the worked example, including the stretched `::after` for whole-area clicking)
- [ ] **Step 3: Commit** — `fix(a11y): raise interactive contrast and drop the clickable divs`

---

### Task 6.7f: Translate the hardcoded accessible names

**The work:** 9 accessible names are hardcoded English string literals rather than `t()` calls — including `dialog.tsx:47`'s `<span className="sr-only">Close</span>`, which every dialog in the product renders. A French researcher's screen reader announces them in English.

Independent of 6.7c and 6.7d; touches no file they touch, so it can run in parallel.

- [ ] **Step 1: Find them** — `grep -rn 'sr-only\|aria-label="' frontend/src --include=*.tsx | grep -v "t("`
- [ ] **Step 2: Route each through `t('key', 'Fallback')`**, fallback matching `en/admin.json` character-for-character, keys in all nine admin locales, register per `frontend/scripts/i18n/glossaries/<code>.yaml` (there is no `fr.yaml`)
- [ ] **Step 3: `npm run i18n-check && npm run check-interpolations`**
- [ ] **Step 4: Commit** — `fix(i18n): translate the accessible names that were hardcoded`

---

### Task 6.7h: Teach the gate to see role-bearing divs

**Why:** the gate's contrast and name checks are **tag-based** (`CONTRAST_BEARING`, `NAME_BEARING` in `check-a11y-names.mjs`), so a `<div>` made interactive by a spread — `{...attributes} {...listeners}` from dnd-kit, which injects `role="button"` and `tabIndex={0}` — is invisible to it.

Task 6.7d hit this concretely: three drag handles sat at 1.45:1 contrast, forty pixels from delete buttons the same task was fixing, and the gate reported zero. They were only found because a reviewer read the files by hand.

This is the third shape of the same structural problem, and it is worth naming as a class:
- `<input>` is not in `NAME_BEARING` — an unnamed audio seek slider survived Task 6.7c
- a **named** button is axe-clean — the Data table's phantom tab stops survive Task 6.7g
- a **role-bearing div** is in neither set — the drag handles survived Task 6.7d

Each time, the instrument certified a surface it could not see.

**The work:** make the checker resolve a control's *effective role* rather than its tag — matching `role="button"`, a `tabIndex` attribute, or a spread that is known to inject them — and add `<input>` to the name-bearing set. Then re-baseline and report what the wider net catches.

- [ ] **Step 1: Extend the matching, and count what appears**
- [ ] **Step 2: Triage the new findings** — expect false positives; the retraction in Task 3.4 exists because a control that looks unnamed in source may be correctly named
- [ ] **Step 3: Fix or baseline each, with the baseline entry explaining why anything is left**
- [ ] **Step 4: Add a test per new matcher** to `check-a11y-names.test.mjs`
- [ ] **Step 5: Commit** — `fix(a11y): match controls by effective role, not by tag`

---

### Task 6.7g: The Data table's status chips should not be buttons at all

**The defect, and why no automated check will find it.** Task 6.7c named the seven per-row indicator `TooltipTrigger`s in `InteractiveDataView.columns.tsx` — a strict improvement over seven anonymous tab stops. But naming them was the wrong end state: **they are pure status indicators, and activating them does nothing.** Seven focusable buttons × 25 rows is up to **175 phantom tab stops per page**, each announcing a fact the researcher cannot act on.

Critically, **Task 6.7e will not catch this** — a named button is axe-clean — and the static gate counts them as fixed. This is a defect that only a human reading the tab order will find, which is why it is written down here rather than left to a check.

**Why `asChild` is not the fix** (established in 6.7c, worth not relearning): Radix injects no `tabIndex` under `asChild` — `grep tabIndex node_modules/@radix-ui/react-tooltip/dist/index.mjs` returns nothing. Wrapping a bare `<div>` in `asChild` removes the tab stop *and* the accessible name, and the gate exempts `asChild` unconditionally (`check-a11y-names.mjs:330`), so the counter would read zero while keyboard users lost access entirely.

**The end state:** `<span role="img" aria-label={…}>` inside the `<td>`, with the Radix tooltip dropped or reduced to `title` for mouse users. Zero tab stops; the fact still read during table navigation, under the column header that names it. Do **not** move the text to `aria-describedby` on the `<tr>` — row descriptions are announced inconsistently across screen readers and divorce the fact from the column that gives it meaning.

**Files:** `frontend/src/components/admin/dashboard/InteractiveDataView.columns.tsx` (7 sites), and `ParticipantCell` at `:147`, whose OS/browser-icon tooltip uses `asChild` over a nameless `<div>` and is therefore **unreachable by keyboard at all** today.

- [ ] **Step 1: Confirm the current tab order** — count focusable elements in one participant row before the change
- [ ] **Step 2: Convert the seven to `role="img"` with their existing names**
- [ ] **Step 3: Assert the count of focusable controls per row drops to what a user can actually act on**
- [ ] **Step 4: Handle `ParticipantCell` — it needs the name it never had, whichever shape you choose**
- [ ] **Step 5: Commit** — `fix(a11y): make the Data table's status chips indicators, not buttons`

---

### Task 6.7e: Extend the axe spec to the admin

**The work:** Task 6.7a wired `Accessibility Smoke` into CI, but the spec itself covers **two public pages**. The admin — where every defect in this remediation lived — is not covered by it at all.

Extend it to the admin surfaces: dashboard, concourse, study design, data, analysis, access, settings. It needs an authenticated session; `frontend/e2e/fixtures/db-setup.ts`'s `loginToAdminUI` injects `admin-auth-storage` into `sessionStorage`, which is how the admin specs already do it.

Run at **375px as well as desktop** — Task 6.7a found a language switcher whose only text is in a `hidden sm:inline` span, so it has no accessible name at all below that breakpoint, and a desktop-only run would never see it.

**This is the check that would have caught most of this remediation on its own.** axe computes the rendered accessible name: it sees through `asChild`, resolves `<SelectValue placeholder>`, honours `display:none`, and computes real contrast ratios rather than matching a banned class string.

- [ ] **Step 1: Add admin routes to the spec with an authenticated fixture**
- [ ] **Step 2: Enable the name rules and `color-contrast`; run at both widths**
- [ ] **Step 3: Confirm it fails on a deliberately unnamed control, then passes** — a spec that cannot fail is not a check
- [ ] **Step 4: Commit** — `test(a11y): run axe against the admin at both breakpoints`

---

### Task 6.7i: Finish the Data table's tab order

**Two findings from Task 6.7g's review, one of them the more serious of the pair.**

**1. The row's real action is mouse-only.** `InteractiveDataView.tsx:844-851` renders `<TableRow onClick={() => handleViewParticipant(...)}>` with `cursor-pointer` but **no `tabIndex`, no `onKeyDown`, no `role`**. Opening a participant — the primary action of the Data screen — cannot be done from the keyboard at all.

Task 6.7g made this starker rather than causing it: the row now holds one focusable control that does nothing, and zero focusable paths to what it actually does. No task covered this; it was found by a reviewer reading the tab order.

The dashboard card conversion (Task 3.3) is the worked example, including the stretched `::after` that preserves whole-area clicking. Mind the interaction: a row containing its own controls cannot simply become a `<button>`.

**2. Two more inert tab stops per row.** The duplicate-IP badge (`columns.tsx:185`) and the `submitted_at` date tooltip (`:749`) are the same defect 6.7g fixed seven times over — `TooltipTrigger` rendering a focusable `<button>` that does nothing on activation. 6.7g's "8 → 1" is fixture-specific; a duplicate-IP row still carries two.

Convert them the way 6.7g did — `role="img"` with the existing name, `title` for mouse users — so the per-row count reaches what a researcher can actually act on.

- [ ] **Step 1: Count focusable controls in a duplicate-IP row** — the fixture must trip the badge, or the count will look already-correct
- [ ] **Step 2: Convert the two chips**
- [ ] **Step 3: Give the row a keyboard path to `handleViewParticipant`**, and assert focus → Enter → the participant opens
- [ ] **Step 4: Confirm mouse click-through, sorting, filtering and the `is_discarded` styling still work**
- [ ] **Step 5: Commit** — `fix(a11y): give the Data table's rows a keyboard path and drop the last inert stops`

---

### Task 6.8: Charts mounting at zero size

**The defect:** loading the `Data` screen logs the Recharts warning *"The width(-1) and height(-1) of chart should be greater than 0"* five times — charts are mounting inside collapsed containers. Harmless today, but it is console noise that will mask a real warning later.

**Files:**
- Modify: `frontend/src/components/admin/dashboard/charts/QuestionDistributionCharts.tsx`

- [ ] **Step 1: Reproduce**

Open `/app/example-project/studies/bioeconomy-futures/data` with the console open and confirm the warnings.

- [ ] **Step 2: Give the responsive container a floor**

Set an explicit `minWidth` / `minHeight` on the chart's `ResponsiveContainer`, or defer mounting until its accordion section is actually open.

- [ ] **Step 3: Verify a clean console**

Reload the page. Expected: no Recharts warnings.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/admin/dashboard/charts/QuestionDistributionCharts.tsx
git commit -m "fix(charts): stop mounting charts into zero-size containers"
```

---

## Deferred — needs a design decision, not a fix

These came out of the audit but are judgement calls, not defects with an obvious right answer. Each needs your call before it becomes a task.

1. **Red/green factor scores** (`Analysis`). In Q-methodology −1.78 means "strongly disagree", not "bad". Red/green imports a value judgement the method does not make, and it is the worst pairing for colour blindness (~8 % of men). A diverging blue↔orange scale would carry the same sign information without the moral overtone — but this changes how every published figure from Qualis looks.
2. **Unexplained `⚠` and `D` markers** (`Analysis` → Preview range, Statements). Both need a legend; the question is whether that is a tooltip, a footnote, or a legend row.
3. **The Kaiser criterion line** is the least salient element of the scree plot, competing with four gridlines of similar weight — a decision rule should out-rank its own gridlines.
4. **The interpretive narrative field** (`F1 narrative`) is an italic grey placeholder with no border. It is the central function of the interpret screen and looks like static text; making it look editable is a small change with a real effect on whether the feature gets used.
5. **Truncated public URL** on `Overview` (`http://localhost:3000/study/b:`). The field is too narrow to read the link it exists to share.
6. **The native `<audio>` player** in Factor voices is the only unstyled control in the product, while `components/admin/AudioPlayer.tsx` exists. Adopting it is straightforward; whether the custom player is good enough to carry research audio is your call.
7. **Sidebar at 768 px** stays expanded at 255 px, taking a third of the viewport. Auto-collapsing below `lg` is the obvious move but changes the tablet experience.
8. **No read-only mode for an active study's design.** Task 3.2 adds an escape hatch from the lock overlay; a genuine read-only rendering of the design is the larger, better fix.

---

## Self-Review

**Spec coverage.** Every audit finding maps to a task: A1→1.1, A2→1.2, A3→1.4, A4→1.5, A5→1.3; B (three text leaks)→2.1–2.3; C (primary colours→4.1, capitalisation→4.2, vocabulary→5.1, naming canon→5.2, dates→4.3, card widths and H1 icon treatments→noted in 6.3's tile unification and 5.3's header work); D (slug prefixes→6.1, switch alignment→6.2, privacy grid→6.3, typography→6.4, contrast→6.5, duplications→5.3); E (row actions→3.1, design lock→3.2, clickable cards→3.3, switch labels→3.4, headings and login→3.5). The Recharts warnings found during planning became 6.7, and the React Compiler defect on Access — found by Phase 1's whole-branch review — became 6.6. Eight items with no single right answer are parked in "Deferred" rather than pretended into tasks.

**Two gaps I am naming rather than hiding.** The three differing card widths (1095 / 895 / 745 px across Access, Study settings, Account settings) and the three H1 icon treatments (bare, grey square, blue square) are real inconsistencies with no task of their own — they want a single page-shell decision, which belongs with the deferred design calls above. Fold them in once the shell is decided.

**Placeholders.** None. Task 1.1 is the only task that does not name its fix, and deliberately so: the production build hides the diagnostic signal, so the task ships a reproduction test plus three ordered hypotheses instead of a guess dressed as an answer.

**Type consistency.** `formatDate` / `formatDateTime` / `formatRelative` (Task 4.3) keep the same signatures at every call site. `SlugInput`'s prop names (Task 6.1) match its three adoptions. `buildColumns`' parameter object (Task 1.1) is quoted from the current source.

---

### Task 6.9: The Recent Activity row's vertical rhythm at 320px

**Found while verifying 6.4.** Task 6.4's badge fix is a containment fix: at 320px the
"Recently completed" pill now grows to two lines instead of letting its text paint
outside itself. Nothing spills, but the row does not look *deliberate*:

- the completed row measures 93.88px and the in-progress row 77.27px — a 16.61px mismatch
  that reads as "one row happened to grow", not as a list with two row sizes;
- the duration ("5m 0s") is vertically centred against a 26px pill, so it floats with
  visible air above and below and the pair reads as misaligned.

Second, independent instance of the same shrinking-flex mechanism, found in the same pass:
at 320px in Spanish, the in-progress row's label ("Clasificación preliminar") squeezes the
progress bar down to a ~4px dot.

**The lever is the row, not the badge.** Either top-align the duration with the pill, or
give the row a fixed min-height so both variants match. Do not re-clamp the badge — that
was the defect 6.4 fixed, and it is verified by measurement.

**Files:** `frontend/src/components/admin/dashboard/RecentActivityCard.tsx`

**Verify:** measure both row heights at 320px in EN *and* ES, and check the progress bar
keeps a usable width in the long-locale case. English is the SHORT case on this surface —
validating only in English is what let 6.4's defect through in the first place.

---

### Task 6.10: `ConcourseDetailPage` tag badges clamp user-supplied labels

**Found while verifying 6.4**, unrelated to that diff. Three tag badges render
`{tag.name}` — user-supplied, multi-word, unbounded — inside an `h-5` **hard clamp**
(20px, ~3.4px of headroom over a 16.6px line box). A wrap escapes the pill by ~13px.

- `ConcourseDetailPage.tsx:1026` — **priority.** Its container is `flex gap-1 mt-2` with
  **no `flex-wrap`**, so several tags compete for one line and each shrinks to its longest
  word. Structurally identical to the 6.4 badge-A failure. Two findings here: the clamp,
  and the missing `flex-wrap`.
- `ConcourseDetailPage.tsx:972` and `:1847` — inside `flex flex-wrap gap-2`, so items wrap
  to new lines rather than competing. Residual risk is a single tag whose name exceeds the
  container width; lower, but real at 320px.

**Fix:** `min-h-5` rather than `h-5` (the 6.4 precedent — a floor, not a clamp), plus
`flex-wrap` on the `:1026` container.

**Verify by measurement, with a deliberately long multi-word tag name in the fixture.**
Not with a short one — the whole class of defect only appears when the label outgrows the
box.

**Explicitly NOT in scope:** the rest of the `h-5 text-2xs` family was measured and is
safe. `InteractiveDataView.columns.tsx:449,464` are multi-word but sit inside the table's
`overflow-x-auto` container, so nothing squeezes them (the ES step badge measures 151px
inside a 320px viewport). `AdminDashboard.tsx:724`, `ItemDetailSheet.tsx:135` and
`AppSidebar.tsx:337,376` carry numeric counts or a single `⌘K` token — min-content equals
max-content, so no wrap is possible. Leave all six alone.
