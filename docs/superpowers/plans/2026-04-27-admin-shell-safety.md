# Admin Shell Safety Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix three Blocker-tier and two related Major-tier issues in the admin shell that surfaced in the multi-lens UX/React/HMI/Codex diagnostic of 2026-04-27 — the broken Profile link, two destructive actions still using `window.confirm()`, the raw study-slug shown in Focus Mode, the obsolete `/admin/w/` slug prefix in project settings, and the dead onboarding step 3.

**Architecture:** Six small, independent tasks each shipped as one commit, each with a failing test first (Vitest + `renderWithProviders` + `userEvent`). All changes localized to `frontend/`; no backend, schema, or migration churn. Each task ends with `make ci-fast` (~38s) green.

**Tech Stack:** React 19 + TypeScript, Vite, Tailwind, shadcn/Radix `AlertDialog`, Vitest, react-router-dom, react-i18next, react-hook-form (existing on ProjectSettings only).

**Out of scope (deliberately):** form-discipline standardisation, RHF+zod rollout, broader nav-config consolidation, hook-convention rollout, AnalysisPage/Lifecycle accuracy work — those are tracked as separate plans (B, C, D, E in the diagnostic synthesis).

**Worktree recommendation:** create an isolated worktree before starting:
```bash
cd /home/julien/tools/qualis
git worktree add ../qualis-admin-shell-safety -b feat/admin-shell-safety
cd ../qualis-admin-shell-safety
```

---

## File Map

**Modify:**
- `frontend/src/components/admin/AppSidebar.tsx` — thread `projectSlug` into `NavUser`; replace raw `params.studySlug` Badge in Focus Mode with the translated study title
- `frontend/src/pages/admin/GeneralSettingsPage.tsx` — replace `confirm()` in `handleDelete` with typed-confirmation `AlertDialog`
- `frontend/src/pages/admin/ProjectSettingsPage.tsx` — replace `confirm()` in `handleRemoveMember` with `AlertDialog`; fix `/admin/w/` prefix annotation to `/app/`
- `frontend/src/components/admin/AdminDashboard.tsx` — wire onboarding step 3 to the concourse list

**Create:**
- `frontend/src/components/admin/FocusModeHeader.tsx` — extracted, unit-testable Focus Mode sidebar header
- `frontend/src/components/admin/FocusModeHeader.test.tsx`
- `frontend/src/pages/admin/GeneralSettingsPage.delete-dialog.test.tsx`
- `frontend/src/pages/admin/ProjectSettingsPage.remove-member-dialog.test.tsx`
- `frontend/src/components/admin/AppSidebar.nav-user.test.tsx`
- `frontend/src/components/admin/AdminDashboard.onboarding.test.tsx`

**Translation files** (en, fr, fi) — add new keys for typed-confirmation copy.

---

## Task 1: Fix NavUser → Profile dead link

NavUser currently calls `navigate('/admin/profile')`, which hits `LegacyRedirect` in `App.tsx:102-106` and dead-ends. The real route is `/app/:projectSlug/profile`. AppSidebar already has `projectSlug` (line 211). Thread it through.

Severity: **Blocker** (every researcher who clicks Profile loses).

**Files:**
- Modify: `frontend/src/components/admin/AppSidebar.tsx:107` (`NavUser` signature) and `:173` (the navigate call)
- Modify: `frontend/src/components/admin/AppSidebar.tsx:503` and `:566` (call sites that pass `user={user}`)
- Test: `frontend/src/components/admin/AppSidebar.nav-user.test.tsx` (new)

---

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/admin/AppSidebar.nav-user.test.tsx`:

```tsx
import { renderWithProviders, screen, waitFor } from '@/test-utils/test-utils';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AppSidebar } from './AppSidebar';
import { SidebarProvider } from '@/components/ui/sidebar';

vi.mock('@/hooks/useAuth', () => ({
    useAuth: () => ({ user: { id: 1, email: 'r@x.io', full_name: 'Ada Lovelace' } }),
}));
vi.mock('@/api/generated', async () => {
    const actual = await vi.importActual<Record<string, unknown>>('@/api/generated');
    return {
        ...actual,
        useListStudiesApiAdminStudiesGet: () => ({ data: { items: [] } }),
    };
});

function ProbePage() {
    return <div data-testid="profile-page">profile</div>;
}

describe('AppSidebar NavUser → Profile', () => {
    it('navigates to /app/<projectSlug>/profile when Profile is clicked', async () => {
        renderWithProviders(
            <MemoryRouter initialEntries={['/app/demo/dashboard']}>
                <SidebarProvider>
                    <Routes>
                        <Route path="/app/:projectSlug/dashboard" element={<AppSidebar />} />
                        <Route path="/app/:projectSlug/profile" element={<ProbePage />} />
                    </Routes>
                </SidebarProvider>
            </MemoryRouter>
        );

        await userEvent.click(screen.getByRole('button', { name: /ada lovelace/i }));
        await userEvent.click(screen.getByRole('menuitem', { name: /profile/i }));

        await waitFor(() => expect(screen.getByTestId('profile-page')).toBeInTheDocument());
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd frontend && npx vitest run src/components/admin/AppSidebar.nav-user.test.tsx
```

Expected: FAIL — Profile click navigates to `/admin/profile` (`LegacyRedirect`), `profile-page` testid is never rendered.

- [ ] **Step 3: Add `projectSlug` prop to NavUser and use it**

In `frontend/src/components/admin/AppSidebar.tsx`, change the signature at line 107:

```tsx
function NavUser({
    user,
    projectSlug,
}: {
    // biome-ignore lint/suspicious/noExplicitAny: typed in plan B
    user: any;
    projectSlug?: string;
}) {
```

Replace the navigate call at line 173:

```tsx
<DropdownMenuItem
    onSelect={() =>
        navigate(projectSlug ? `/app/${projectSlug}/profile` : '/hub')
    }
>
```

Update both call sites (lines ~503 and ~566) to pass `projectSlug`:

```tsx
<NavUser user={user} projectSlug={projectSlug} />
```

(Inside `AppSidebar` the local `projectSlug` is already computed at line 211 — `const projectSlug = params.projectSlug || currentProject?.slug;` — just propagate it.)

- [ ] **Step 4: Run test to verify it passes**

```bash
cd frontend && npx vitest run src/components/admin/AppSidebar.nav-user.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Run inner-loop CI**

```bash
make ci-fast
```

Expected: PASS (lint + types + unit tests, ~38s).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/admin/AppSidebar.tsx \
        frontend/src/components/admin/AppSidebar.nav-user.test.tsx
git commit -m "fix(admin): route NavUser Profile link to /app/<projectSlug>/profile

The dropdown previously called navigate('/admin/profile'), which hits the
LegacyRedirect catch-all and dead-ends. Thread the active projectSlug into
NavUser and route to the real /app/:projectSlug/profile route, with a /hub
fallback when no project is active."
```

---

## Task 2: Replace `confirm()` with typed-confirmation AlertDialog for study delete

`GeneralSettingsPage.handleDelete` (line 90) gates a permanent, data-destroying action behind a native `window.confirm()` — unstylable, not screen-reader-friendly, and far cheaper than the parallel anonymisation flow on `DataLifecyclePage` (which uses a proper `AlertDialog`). Replace with the project's `AlertDialog` pattern AND require the user to type the study slug to enable the destructive button (mirrors the Norman irreversibility-surfacing principle the diagnostic flagged).

Severity: **Blocker** (data loss with too-cheap gate).

**Files:**
- Modify: `frontend/src/pages/admin/GeneralSettingsPage.tsx` — `handleDelete` and the existing "Delete study" button
- Modify: `frontend/public/locales/{en,fr,fi}/translation.json` — add typed-confirmation keys
- Test: `frontend/src/pages/admin/GeneralSettingsPage.delete-dialog.test.tsx` (new)

---

- [ ] **Step 1: Write the failing test**

Create `frontend/src/pages/admin/GeneralSettingsPage.delete-dialog.test.tsx`:

```tsx
import { renderWithProviders, screen, waitFor } from '@/test-utils/test-utils';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import GeneralSettingsPage from './GeneralSettingsPage';
import type { StudyRead } from '@/api/model';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const deleteStudy = vi.fn();
vi.mock('@/api/admin', () => ({
    AdminService: {
        deleteStudy: (...args: unknown[]) => deleteStudy(...args),
        updateStudyState: vi.fn(),
        updateStudy: vi.fn(),
    },
}));

const study: StudyRead = {
    id: 1,
    slug: 'climate-pilot',
    state: 'closed',
    project_id: 7,
    translations: [{ language: 'en', title: 'Climate Pilot', description: '' }],
    // biome-ignore lint/suspicious/noExplicitAny: minimal stub
} as any;

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
    return {
        ...actual,
        useLoaderData: () => ({ study, slug: 'climate-pilot' }),
        useParams: () => ({ projectSlug: 'demo', studySlug: 'climate-pilot' }),
        useNavigate: () => vi.fn(),
        useRevalidator: () => ({ revalidate: vi.fn() }),
    };
});

vi.mock('@/api/generated', async () => {
    const actual = await vi.importActual<Record<string, unknown>>('@/api/generated');
    return {
        ...actual,
        getStudyStorageUsageApiAdminStudiesSlugStorageUsageGet: vi.fn(),
        getListStudiesApiAdminStudiesGetQueryKey: () => ['studies'],
        getGetStudyApiAdminStudiesSlugGetQueryKey: () => ['study', 'climate-pilot'],
    };
});

describe('GeneralSettingsPage delete dialog', () => {
    beforeEach(() => deleteStudy.mockReset());

    it('opens an AlertDialog and disables the action until the slug is typed', async () => {
        renderWithProviders(<GeneralSettingsPage />);
        await userEvent.click(screen.getByRole('button', { name: /delete study/i }));

        const dialog = await screen.findByRole('alertdialog');
        const confirmBtn = await screen.findByRole('button', { name: /^delete permanently$/i });
        expect(confirmBtn).toBeDisabled();
        expect(deleteStudy).not.toHaveBeenCalled();

        const typedField = screen.getByLabelText(/type the study slug/i);
        await userEvent.type(typedField, 'climate-pilot');
        expect(confirmBtn).toBeEnabled();

        await userEvent.click(confirmBtn);
        await waitFor(() => expect(deleteStudy).toHaveBeenCalledWith('climate-pilot'));
        expect(dialog).not.toBeInTheDocument();
    });

    it('does not call deleteStudy when the typed slug is wrong', async () => {
        renderWithProviders(<GeneralSettingsPage />);
        await userEvent.click(screen.getByRole('button', { name: /delete study/i }));

        const typedField = screen.getByLabelText(/type the study slug/i);
        await userEvent.type(typedField, 'wrong-slug');
        const confirmBtn = await screen.findByRole('button', { name: /^delete permanently$/i });
        expect(confirmBtn).toBeDisabled();
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd frontend && npx vitest run src/pages/admin/GeneralSettingsPage.delete-dialog.test.tsx
```

Expected: FAIL — no `alertdialog` role appears (page still uses native `confirm`).

- [ ] **Step 3: Add the typed-confirmation i18n keys**

In `frontend/public/locales/en/translation.json`, under `admin.settings.danger`, add (place near the existing `delete_confirm` key):

```json
"delete_dialog_title": "Delete this study?",
"delete_dialog_intro": "All sorts, audio recordings, and analysis runs for this study will be permanently deleted. This cannot be undone.",
"delete_dialog_typed_label": "Type the study slug to confirm",
"delete_dialog_typed_placeholder": "{{slug}}",
"delete_dialog_action": "Delete permanently"
```

Mirror in `fr/translation.json`:

```json
"delete_dialog_title": "Supprimer cette étude ?",
"delete_dialog_intro": "Tous les tris, enregistrements audio et analyses de cette étude seront supprimés définitivement. Cette action est irréversible.",
"delete_dialog_typed_label": "Saisir le slug de l'étude pour confirmer",
"delete_dialog_typed_placeholder": "{{slug}}",
"delete_dialog_action": "Supprimer définitivement"
```

And in `fi/translation.json`:

```json
"delete_dialog_title": "Poistetaanko tämä tutkimus?",
"delete_dialog_intro": "Kaikki lajittelut, äänitallenteet ja analyysit poistetaan pysyvästi. Tätä ei voi kumota.",
"delete_dialog_typed_label": "Vahvista kirjoittamalla tutkimuksen slug",
"delete_dialog_typed_placeholder": "{{slug}}",
"delete_dialog_action": "Poista pysyvästi"
```

- [ ] **Step 4: Add AlertDialog imports and dialog state to GeneralSettingsPage**

At the top of `frontend/src/pages/admin/GeneralSettingsPage.tsx`, add the AlertDialog imports next to the existing UI imports:

```tsx
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
```

Inside the `GeneralSettingsPage` component (next to the existing `useState` calls around line 58-59), add:

```tsx
const [deleteOpen, setDeleteOpen] = useState(false);
const [typedSlug, setTypedSlug] = useState('');
```

Replace `handleDelete` (lines 88-113). Drop the `confirm()` line and wrap the existing success path so it can be invoked from the dialog:

```tsx
const handleDelete = async () => {
    if (!study || !slug) return;
    try {
        await AdminService.deleteStudy(slug);
        useAdminStore.getState().setActiveStudy(null);
        await queryClient.invalidateQueries({
            queryKey: getListStudiesApiAdminStudiesGetQueryKey(),
        });
        toast.success(t('admin.settings.delete_success'), {
            description: t('admin.settings.delete_success_desc'),
        });
        const targetHome = projectSlug
            ? `/app/${projectSlug}/dashboard`
            : `/app/${currentWorkspace?.slug}/dashboard`;
        navigate(targetHome);
    } catch (error) {
        const message = parseApiErrorSync(error, t('admin.settings.delete_error'));
        toast.error(t('admin.settings.delete_error'), { description: message });
    } finally {
        setDeleteOpen(false);
        setTypedSlug('');
    }
};
```

- [ ] **Step 5: Wire the existing "Delete study" button to open the dialog and add the dialog markup**

Find the existing destructive button in the Danger Zone (it currently calls `handleDelete` directly). Change its `onClick` to `() => setDeleteOpen(true)`. Then add the dialog at the end of the component's JSX, just before the outermost closing `</div>`:

```tsx
<AlertDialog open={deleteOpen} onOpenChange={(open) => {
    setDeleteOpen(open);
    if (!open) setTypedSlug('');
}}>
    <AlertDialogContent>
        <AlertDialogHeader>
            <AlertDialogTitle>
                {t('admin.settings.danger.delete_dialog_title', 'Delete this study?')}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2 text-left">
                <span className="block">
                    {t(
                        'admin.settings.danger.delete_dialog_intro',
                        'All sorts, audio recordings, and analysis runs for this study will be permanently deleted. This cannot be undone.'
                    )}
                </span>
            </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2 px-1">
            <Label htmlFor="delete-typed-slug" className="text-xs font-semibold text-slate-700">
                {t(
                    'admin.settings.danger.delete_dialog_typed_label',
                    'Type the study slug to confirm'
                )}
            </Label>
            <Input
                id="delete-typed-slug"
                value={typedSlug}
                onChange={(e) => setTypedSlug(e.target.value)}
                placeholder={slug}
                autoComplete="off"
                spellCheck={false}
            />
        </div>
        <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel', 'Cancel')}</AlertDialogCancel>
            <AlertDialogAction
                disabled={typedSlug !== slug}
                onClick={handleDelete}
                className="bg-red-600 hover:bg-red-700"
            >
                {t('admin.settings.danger.delete_dialog_action', 'Delete permanently')}
            </AlertDialogAction>
        </AlertDialogFooter>
    </AlertDialogContent>
</AlertDialog>
```

- [ ] **Step 6: Run the test to verify it passes**

```bash
cd frontend && npx vitest run src/pages/admin/GeneralSettingsPage.delete-dialog.test.tsx
```

Expected: PASS — both cases (typed-correctly enables; wrong slug stays disabled).

- [ ] **Step 7: Verify i18n key parity and inner-loop CI**

```bash
make ci-fast
cd frontend && npm run i18n-check
```

Expected: both PASS. (i18n-check ensures en/fr/fi keys are in sync.)

- [ ] **Step 8: Commit**

```bash
git add frontend/src/pages/admin/GeneralSettingsPage.tsx \
        frontend/src/pages/admin/GeneralSettingsPage.delete-dialog.test.tsx \
        frontend/public/locales/en/translation.json \
        frontend/public/locales/fr/translation.json \
        frontend/public/locales/fi/translation.json
git commit -m "feat(admin): typed-confirmation AlertDialog for study delete

Replace native window.confirm() in GeneralSettingsPage.handleDelete with a
shadcn AlertDialog that requires the user to type the study slug before the
destructive action becomes enabled. Mirrors the irreversibility-surfacing
pattern already in DataLifecyclePage and brings the highest-stakes admin
action up to the same safety budget."
```

---

## Task 3: Replace `confirm()` with AlertDialog for member removal

`ProjectSettingsPage.handleRemoveMember` (line 174) is the second `window.confirm()` site. Lower stakes than study delete (re-invite is recoverable), so no typed-confirmation needed — but still deserves the project's standard dialog pattern for keyboard, focus-trap, and screen-reader behaviour. Show the member's name + role for identity confirmation.

Severity: **Blocker** (parity with destructive-action pattern).

**Files:**
- Modify: `frontend/src/pages/admin/ProjectSettingsPage.tsx` — `handleRemoveMember` and the per-row "Remove" button
- Modify: `frontend/public/locales/{en,fr,fi}/translation.json` — add dialog copy keys
- Test: `frontend/src/pages/admin/ProjectSettingsPage.remove-member-dialog.test.tsx` (new)

---

- [ ] **Step 1: Write the failing test**

Create `frontend/src/pages/admin/ProjectSettingsPage.remove-member-dialog.test.tsx`:

```tsx
import { renderWithProviders, screen, waitFor } from '@/test-utils/test-utils';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ProjectSettingsPage from './ProjectSettingsPage';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const removeMember = vi.fn().mockResolvedValue({});
vi.mock('@/api/generated', async () => {
    const actual = await vi.importActual<Record<string, unknown>>('@/api/generated');
    return {
        ...actual,
        useGetProjectApiAdminProjectsSlugGet: () => ({
            data: { id: 1, slug: 'demo', title: 'Demo Project' },
            isLoading: false,
            refetch: vi.fn(),
        }),
        useListProjectMembersApiAdminProjectsSlugMembersGet: () => ({
            data: {
                items: [
                    { user_id: 11, full_name: 'Ada Lovelace', email: 'ada@x.io', role: 'researcher' },
                    { user_id: 12, full_name: 'Grace Hopper', email: 'grace@x.io', role: 'owner' },
                ],
            },
            refetch: vi.fn(),
        }),
        useRemoveProjectMemberApiAdminProjectsSlugMembersUserIdDelete: () => ({
            mutateAsync: removeMember,
            isPending: false,
        }),
        useUpdateProjectApiAdminProjectsSlugPut: () => ({ mutateAsync: vi.fn(), isPending: false }),
        useUpdateProjectMemberRoleApiAdminProjectsSlugMembersUserIdPatch: () => ({
            mutateAsync: vi.fn(),
            isPending: false,
        }),
        useInviteProjectMemberApiAdminProjectsSlugInvitationsPost: () => ({
            mutateAsync: vi.fn(),
            isPending: false,
        }),
    };
});

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
    return {
        ...actual,
        useLoaderData: () => ({ slug: 'demo' }),
        useNavigate: () => vi.fn(),
    };
});

vi.mock('@/store/useAuthStore', () => ({
    useAuthStore: (sel: (s: { user: { id: number } }) => unknown) =>
        sel({ user: { id: 12 } }), // current user is the owner Grace
}));

describe('ProjectSettingsPage remove-member dialog', () => {
    beforeEach(() => removeMember.mockReset().mockResolvedValue({}));

    it('opens an AlertDialog showing the member name and confirms removal', async () => {
        renderWithProviders(<ProjectSettingsPage />);

        const adaRow = (await screen.findByText(/ada lovelace/i)).closest('tr');
        if (!adaRow) throw new Error('member row not found');
        await userEvent.click(
            // biome-ignore lint/suspicious/noExplicitAny: Testing-Library narrowing
            (adaRow as any).querySelector('button[aria-label*="Remove" i]') as HTMLElement
        );

        const dialog = await screen.findByRole('alertdialog');
        expect(dialog).toHaveTextContent(/ada lovelace/i);
        expect(removeMember).not.toHaveBeenCalled();

        await userEvent.click(screen.getByRole('button', { name: /^remove$/i }));
        await waitFor(() =>
            expect(removeMember).toHaveBeenCalledWith({ slug: 'demo', userId: 11 })
        );
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd frontend && npx vitest run src/pages/admin/ProjectSettingsPage.remove-member-dialog.test.tsx
```

Expected: FAIL — page still uses `confirm()`, so no `alertdialog` role exists.

- [ ] **Step 3: Add i18n keys**

In `frontend/public/locales/en/translation.json` under `admin.projects.settings.team`, add:

```json
"remove_dialog_title": "Remove team member?",
"remove_dialog_body": "{{name}} will lose access to this project. They can be re-invited later.",
"remove_dialog_action": "Remove"
```

Mirror in `fr/translation.json`:

```json
"remove_dialog_title": "Retirer ce membre de l'équipe ?",
"remove_dialog_body": "{{name}} perdra l'accès à ce projet. Vous pourrez l'inviter à nouveau plus tard.",
"remove_dialog_action": "Retirer"
```

And in `fi/translation.json`:

```json
"remove_dialog_title": "Poistetaanko jäsen?",
"remove_dialog_body": "{{name}} menettää pääsyn tähän projektiin. Hänet voi kutsua uudelleen myöhemmin.",
"remove_dialog_action": "Poista"
```

- [ ] **Step 4: Refactor `handleRemoveMember` and add the dialog**

Add AlertDialog imports at the top of `frontend/src/pages/admin/ProjectSettingsPage.tsx`:

```tsx
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
```

Inside the component, add state next to other `useState`s:

```tsx
const [memberToRemove, setMemberToRemove] = useState<{
    userId: number;
    name: string;
} | null>(null);
```

Replace `handleRemoveMember` (lines 167-182):

```tsx
const requestRemoveMember = (userId: number, name: string) => {
    if (userId === currentUser?.id) {
        toast.error(
            t('admin.profile.personal.cannot_remove_self', 'You cannot remove yourself')
        );
        return;
    }
    setMemberToRemove({ userId, name });
};

const confirmRemoveMember = async () => {
    if (!memberToRemove) return;
    try {
        await removeMemberMutation.mutateAsync({ slug, userId: memberToRemove.userId });
        toast.success(t('admin.projects.settings.team.remove_success'));
        refetchMembers();
    } catch (err) {
        toast.error(parseApiErrorSync(err, t('admin.projects.settings.team.remove_error')));
    } finally {
        setMemberToRemove(null);
    }
};
```

Update the row's Remove button to call `requestRemoveMember(member.user_id, member.full_name || member.email)` instead of `handleRemoveMember(member.user_id)`. Add `aria-label={t('admin.projects.settings.team.remove_member_aria', 'Remove {{name}}', { name: member.full_name || member.email })}` so the test (and screen readers) can target it.

Add the dialog markup at the end of the component, just before the outermost closing `</div>`:

```tsx
<AlertDialog
    open={memberToRemove !== null}
    onOpenChange={(open) => !open && setMemberToRemove(null)}
>
    <AlertDialogContent>
        <AlertDialogHeader>
            <AlertDialogTitle>
                {t('admin.projects.settings.team.remove_dialog_title', 'Remove team member?')}
            </AlertDialogTitle>
            <AlertDialogDescription>
                {t(
                    'admin.projects.settings.team.remove_dialog_body',
                    '{{name}} will lose access to this project. They can be re-invited later.',
                    { name: memberToRemove?.name ?? '' }
                )}
            </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel', 'Cancel')}</AlertDialogCancel>
            <AlertDialogAction
                onClick={confirmRemoveMember}
                className="bg-red-600 hover:bg-red-700"
            >
                {t('admin.projects.settings.team.remove_dialog_action', 'Remove')}
            </AlertDialogAction>
        </AlertDialogFooter>
    </AlertDialogContent>
</AlertDialog>
```

- [ ] **Step 5: Run test + i18n parity + ci-fast**

```bash
cd frontend && npx vitest run src/pages/admin/ProjectSettingsPage.remove-member-dialog.test.tsx
cd .. && make ci-fast
cd frontend && npm run i18n-check
```

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/admin/ProjectSettingsPage.tsx \
        frontend/src/pages/admin/ProjectSettingsPage.remove-member-dialog.test.tsx \
        frontend/public/locales/en/translation.json \
        frontend/public/locales/fr/translation.json \
        frontend/public/locales/fi/translation.json
git commit -m "feat(admin): AlertDialog for project member removal

Replace native window.confirm() in ProjectSettingsPage.handleRemoveMember
with a shadcn AlertDialog that names the member being removed. Brings the
project-settings team-management flow to the same destructive-action
pattern used by DataLifecyclePage and the new study-delete dialog."
```

---

## Task 4: Show translated study title in Focus Mode header (extract `FocusModeHeader`)

`AppSidebar.tsx:404-406` shows `params.studySlug` as a Badge — a researcher who named their study "Flemish Climate Attitudes (Pilot 2024)" sees `flemish-climate-attitudes-pilot-2024` instead. The data is available: `useListStudiesApiAdminStudiesGet` is already called in this component, and `study.translations[0]?.title` is the title resolution pattern used in `AdminLayout.tsx:123,126`. Extract to a small `<FocusModeHeader />` component for unit-testability — that will also pay off in Plan C (nav consolidation).

Severity: **Major** (UX clarity in the most-used study-scope navigation surface).

**Files:**
- Create: `frontend/src/components/admin/FocusModeHeader.tsx`
- Create: `frontend/src/components/admin/FocusModeHeader.test.tsx`
- Modify: `frontend/src/components/admin/AppSidebar.tsx:392-408` — replace the inline Focus-Mode header block with `<FocusModeHeader />`

---

- [ ] **Step 1: Write the failing test for the new component**

Create `frontend/src/components/admin/FocusModeHeader.test.tsx`:

```tsx
import { renderWithProviders, screen } from '@/test-utils/test-utils';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { FocusModeHeader } from './FocusModeHeader';
import type { StudyRead } from '@/api/model';

const back = vi.fn();
vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
    return { ...actual, useNavigate: () => back };
});

const studyWithEnTitle = {
    id: 1,
    slug: 'flemish-climate-attitudes-pilot-2024',
    project_id: 7,
    translations: [
        { language: 'en', title: 'Flemish Climate Attitudes (Pilot 2024)', description: '' },
    ],
    // biome-ignore lint/suspicious/noExplicitAny: minimal stub
} as any as StudyRead;

describe('FocusModeHeader', () => {
    it('renders the translated study title in the badge, not the slug', () => {
        renderWithProviders(
            <MemoryRouter>
                <FocusModeHeader
                    projectSlug="demo"
                    projectTitle="Demo Project"
                    study={studyWithEnTitle}
                    studySlug={studyWithEnTitle.slug}
                />
            </MemoryRouter>
        );
        expect(screen.getByText('Flemish Climate Attitudes (Pilot 2024)')).toBeInTheDocument();
        expect(
            screen.queryByText('flemish-climate-attitudes-pilot-2024')
        ).not.toBeInTheDocument();
    });

    it('falls back to the slug when the study has no translations yet', () => {
        renderWithProviders(
            <MemoryRouter>
                <FocusModeHeader
                    projectSlug="demo"
                    projectTitle="Demo Project"
                    study={undefined}
                    studySlug="my-new-study"
                />
            </MemoryRouter>
        );
        expect(screen.getByText('my-new-study')).toBeInTheDocument();
    });

    it('back button navigates to /app/<projectSlug>/dashboard', async () => {
        const { default: userEvent } = await import('@testing-library/user-event');
        renderWithProviders(
            <MemoryRouter>
                <FocusModeHeader
                    projectSlug="demo"
                    projectTitle="Demo Project"
                    study={studyWithEnTitle}
                    studySlug={studyWithEnTitle.slug}
                />
            </MemoryRouter>
        );
        await userEvent.click(screen.getByRole('button', { name: /demo project/i }));
        expect(back).toHaveBeenCalledWith('/app/demo/dashboard');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd frontend && npx vitest run src/components/admin/FocusModeHeader.test.tsx
```

Expected: FAIL — module `./FocusModeHeader` does not exist.

- [ ] **Step 3: Create the component**

Create `frontend/src/components/admin/FocusModeHeader.tsx`:

```tsx
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import type { StudyRead } from '@/api/model';

interface FocusModeHeaderProps {
    projectSlug: string | undefined;
    projectTitle: string | undefined;
    study: StudyRead | undefined;
    studySlug: string;
}

function resolveStudyTitle(study: StudyRead | undefined, fallbackSlug: string): string {
    return study?.translations?.[0]?.title || fallbackSlug;
}

export function FocusModeHeader({
    projectSlug,
    projectTitle,
    study,
    studySlug,
}: FocusModeHeaderProps) {
    const navigate = useNavigate();
    const { t } = useTranslation();
    const title = resolveStudyTitle(study, studySlug);

    return (
        <div className="flex flex-col gap-2">
            <button
                type="button"
                onClick={() => navigate(`/app/${projectSlug}/dashboard`)}
                className="flex items-center gap-2 px-2 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
                <ArrowLeft className="h-4 w-4" />
                <span>{projectTitle || t('admin.sidebar.project')}</span>
            </button>
            <div className="px-2">
                <Badge variant="outline" className="font-semibold" title={title}>
                    {title}
                </Badge>
            </div>
        </div>
    );
}
```

- [ ] **Step 4: Run the new component test to verify it passes**

```bash
cd frontend && npx vitest run src/components/admin/FocusModeHeader.test.tsx
```

Expected: all 3 cases PASS.

- [ ] **Step 5: Replace the inline block in AppSidebar with `<FocusModeHeader />`**

In `frontend/src/components/admin/AppSidebar.tsx`:

1. Add import:
   ```tsx
   import { FocusModeHeader } from './FocusModeHeader';
   ```

2. Just before `if (isNewArchitecture)` (line ~388), compute the focus study:
   ```tsx
   const focusStudy =
       isFocusMode && params.studySlug
           ? studies?.find(
                 (s) =>
                     s.slug === params.studySlug && s.project_id === currentProject?.id
             )
           : undefined;
   ```

3. Replace the inline Focus Mode header block (lines 392-408) with:
   ```tsx
   {isFocusMode && params.studySlug ? (
       <FocusModeHeader
           projectSlug={projectSlug}
           projectTitle={currentProject?.title}
           study={focusStudy}
           studySlug={params.studySlug}
       />
   ) : (
       <ProjectSwitcher />
   )}
   ```

- [ ] **Step 6: Run inner-loop CI**

```bash
make ci-fast
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/admin/FocusModeHeader.tsx \
        frontend/src/components/admin/FocusModeHeader.test.tsx \
        frontend/src/components/admin/AppSidebar.tsx
git commit -m "feat(admin): show translated study title in Focus Mode header

Extract the Focus Mode sidebar header into a unit-tested FocusModeHeader
component. Replace the raw studySlug Badge with study.translations[0].title,
falling back to the slug when no translation exists. Restores
human-readable identity in the most-used study-scope navigation surface."
```

---

## Task 5: Fix `/admin/w/` slug-prefix annotation in ProjectSettings

`ProjectSettingsPage.tsx:272` shows `/admin/w/` as a left-aligned annotation in the slug input — this is the legacy "workspace" path; the live URL is `/app/<slug>/dashboard`. A user renaming a project gets a wrong mental model of the resulting URL.

Severity: **Major** (gulf of evaluation).

**Files:**
- Modify: `frontend/src/pages/admin/ProjectSettingsPage.tsx:272` — change the annotation; widen the input padding accordingly
- Test: extend `ProjectSettingsPage.remove-member-dialog.test.tsx` (Task 3) with a fresh assertion, OR add a small dedicated test file. We'll add a small dedicated file to keep tests focused.

Create: `frontend/src/pages/admin/ProjectSettingsPage.slug-prefix.test.tsx`

---

- [ ] **Step 1: Write the failing test**

Create `frontend/src/pages/admin/ProjectSettingsPage.slug-prefix.test.tsx`:

```tsx
import { renderWithProviders, screen } from '@/test-utils/test-utils';
import { describe, it, expect, vi } from 'vitest';
import ProjectSettingsPage from './ProjectSettingsPage';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/api/generated', async () => {
    const actual = await vi.importActual<Record<string, unknown>>('@/api/generated');
    return {
        ...actual,
        useGetProjectApiAdminProjectsSlugGet: () => ({
            data: { id: 1, slug: 'demo', title: 'Demo' },
            isLoading: false,
            refetch: vi.fn(),
        }),
        useListProjectMembersApiAdminProjectsSlugMembersGet: () => ({
            data: { items: [] },
            refetch: vi.fn(),
        }),
        useRemoveProjectMemberApiAdminProjectsSlugMembersUserIdDelete: () => ({
            mutateAsync: vi.fn(),
            isPending: false,
        }),
        useUpdateProjectApiAdminProjectsSlugPut: () => ({ mutateAsync: vi.fn(), isPending: false }),
        useUpdateProjectMemberRoleApiAdminProjectsSlugMembersUserIdPatch: () => ({
            mutateAsync: vi.fn(),
            isPending: false,
        }),
        useInviteProjectMemberApiAdminProjectsSlugInvitationsPost: () => ({
            mutateAsync: vi.fn(),
            isPending: false,
        }),
    };
});
vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
    return {
        ...actual,
        useLoaderData: () => ({ slug: 'demo' }),
        useNavigate: () => vi.fn(),
    };
});

describe('ProjectSettingsPage slug input prefix', () => {
    it('renders the live URL prefix /app/ — not the legacy /admin/w/', async () => {
        renderWithProviders(<ProjectSettingsPage />);
        expect(await screen.findByText('/app/')).toBeInTheDocument();
        expect(screen.queryByText('/admin/w/')).not.toBeInTheDocument();
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd frontend && npx vitest run src/pages/admin/ProjectSettingsPage.slug-prefix.test.tsx
```

Expected: FAIL — page still renders `/admin/w/`.

- [ ] **Step 3: Update the annotation**

In `frontend/src/pages/admin/ProjectSettingsPage.tsx`, change the prefix block (currently around line 271-273):

```tsx
<div className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 select-none border-r pr-3 mr-3 h-4 flex items-center">
    /app/
</div>
```

The trailing `/dashboard` is implied by the route — keep the annotation short. The input's existing `pl-32` padding remains visually correct because `/app/` is shorter than `/admin/w/`.

- [ ] **Step 4: Run test + ci-fast**

```bash
cd frontend && npx vitest run src/pages/admin/ProjectSettingsPage.slug-prefix.test.tsx
cd .. && make ci-fast
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/admin/ProjectSettingsPage.tsx \
        frontend/src/pages/admin/ProjectSettingsPage.slug-prefix.test.tsx
git commit -m "fix(admin): show /app/ prefix in project slug input

The slug field showed the legacy /admin/w/ workspace prefix while the live
URL is /app/<slug>/dashboard. Update the annotation so a user renaming a
project sees the URL they're actually creating."
```

---

## Task 6: Wire onboarding step 3 to the concourse list

`AdminDashboard.tsx:217-225` defines step 3 "Select the Q-set" with no `action` and no `actionLabel` — steps 2 and 4 have buttons, step 3 stalls the novice. Q-set selection happens inside the concourse detail page (you "promote" items to the Q-set), so the right destination is the concourse list where the user can pick which concourse to work in.

Severity: **Minor (general) / Blocker (novice flow)**.

**Files:**
- Modify: `frontend/src/components/admin/AdminDashboard.tsx:217-225` — add `action` + `actionLabel`
- Modify: `frontend/public/locales/{en,fr,fi}/translation.json` — add `admin.dashboard.go_to_qset`
- Test: `frontend/src/components/admin/AdminDashboard.onboarding.test.tsx` (new)

---

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/admin/AdminDashboard.onboarding.test.tsx`:

```tsx
import { renderWithProviders, screen } from '@/test-utils/test-utils';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import AdminDashboard from './AdminDashboard';

vi.mock('@/api/generated', async () => {
    const actual = await vi.importActual<Record<string, unknown>>('@/api/generated');
    return {
        ...actual,
        useListStudiesApiAdminStudiesGet: () => ({
            data: { items: [] },
            isLoading: false,
        }),
    };
});
vi.mock('@/store/useAuthStore', () => ({
    useAuthStore: () => ({ currentProject: { id: 1, slug: 'demo', title: 'Demo' } }),
}));

function ConcoursePage() {
    return <div data-testid="concourse-list">concourses</div>;
}

describe('AdminDashboard onboarding step 3', () => {
    it('navigates to the concourse list when "Open Q-set" is clicked', async () => {
        renderWithProviders(
            <MemoryRouter initialEntries={['/app/demo/dashboard']}>
                <Routes>
                    <Route path="/app/:projectSlug/dashboard" element={<AdminDashboard />} />
                    <Route path="/app/:projectSlug/concourses" element={<ConcoursePage />} />
                </Routes>
            </MemoryRouter>
        );

        const button = await screen.findByRole('button', { name: /q-set|qset|q‑set/i });
        await userEvent.click(button);
        expect(await screen.findByTestId('concourse-list')).toBeInTheDocument();
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd frontend && npx vitest run src/components/admin/AdminDashboard.onboarding.test.tsx
```

Expected: FAIL — step 3 has no button (`getByRole('button', { name: /q-set/i })` does not match).

- [ ] **Step 3: Add i18n key**

In `frontend/public/locales/en/translation.json` under `admin.dashboard`, add:

```json
"go_to_qset": "Open Q-set"
```

In `fr/translation.json`:

```json
"go_to_qset": "Ouvrir le Q-set"
```

In `fi/translation.json`:

```json
"go_to_qset": "Avaa Q-setti"
```

- [ ] **Step 4: Wire the action**

In `frontend/src/components/admin/AdminDashboard.tsx`, change the step 3 block (lines 217-225) from:

```tsx
<OnboardingStep
    step={3}
    done={false}
    title={t('admin.dashboard.step_qset', 'Select the Q-set')}
    description={t(
        'admin.dashboard.step_qset_desc',
        'Review and accept the items that will form your Q-set.'
    )}
/>
```

to:

```tsx
<OnboardingStep
    step={3}
    done={false}
    title={t('admin.dashboard.step_qset', 'Select the Q-set')}
    description={t(
        'admin.dashboard.step_qset_desc',
        'Review and accept the items that will form your Q-set.'
    )}
    action={() => navigate(`/app/${projectSlug}/concourses`)}
    actionLabel={t('admin.dashboard.go_to_qset', 'Open Q-set')}
/>
```

(Both `navigate` and `projectSlug` are already in scope inside the component — they're used for steps 2 and 4 in this same JSX block.)

- [ ] **Step 5: Run test + i18n parity + ci-fast**

```bash
cd frontend && npx vitest run src/components/admin/AdminDashboard.onboarding.test.tsx
cd .. && make ci-fast
cd frontend && npm run i18n-check
```

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/admin/AdminDashboard.tsx \
        frontend/src/components/admin/AdminDashboard.onboarding.test.tsx \
        frontend/public/locales/en/translation.json \
        frontend/public/locales/fr/translation.json \
        frontend/public/locales/fi/translation.json
git commit -m "feat(admin): wire onboarding step 3 to concourse list

Steps 2 and 4 of the AdminDashboard onboarding flow had action buttons;
step 3 (\"Select the Q-set\") had only descriptive text and stalled novice
researchers. Route step 3 to the concourse list, where Q-set promotion
happens, so the first-run flow has no dead-end."
```

---

## Task 7: Final verification

- [ ] **Step 1: Run the full local CI**

```bash
make ci
```

Expected: PASS (lint + check + test + build, ~3-5 min).

- [ ] **Step 2: Manual smoke test in dev server**

```bash
make dev   # or npm --prefix frontend run dev + make backend-dev
```

In a browser at `http://localhost:5173`:
1. Log in as a researcher with at least one project.
2. From `/hub`, open a project → click the user dropdown (bottom-left) → click **Profile**. Verify the URL becomes `/app/<projectSlug>/profile` and the page renders.
3. Open any study (Focus Mode). Verify the sidebar Badge shows the **human title** (not the slug).
4. Go to study **Settings** → **Delete study**. Verify the AlertDialog appears, the destructive button stays disabled until the slug is typed, and Cancel closes the dialog cleanly.
5. Go to project **Settings** → click **Remove** on a member. Verify the AlertDialog names the member and Cancel returns to the table.
6. In project **Settings** → **General**, click into the slug input. Verify the `/app/` prefix is shown.
7. Create an empty project (`/app/projects/new`). On its dashboard, verify the onboarding card has 4 actionable steps including "Open Q-set" on step 3.

- [ ] **Step 3: Push the branch and open a PR**

```bash
git push -u origin feat/admin-shell-safety
gh pr create --title "feat(admin): admin shell safety — Profile link, AlertDialogs, Focus Mode title, slug prefix, onboarding step 3" --body "$(cat <<'EOF'
## Summary
- Fixes `/admin/profile` dead-link in NavUser (route now `/app/:projectSlug/profile`).
- Replaces native `confirm()` with shadcn `AlertDialog` + typed-confirmation for study delete; adds `AlertDialog` for project member removal.
- Restores translated study title in Focus Mode sidebar header (extracted unit-tested `FocusModeHeader`).
- Updates project slug-input annotation `/admin/w/` → `/app/`.
- Wires onboarding step 3 to the concourse list so the novice flow has no dead-end.

Diagnostic: docs/superpowers/plans/2026-04-27-admin-shell-safety.md

## Test plan
- [x] make ci-fast green per task
- [x] make ci green at end
- [x] manual smoke (Profile nav, Focus Mode title, both AlertDialogs, slug prefix, step-3 button)
EOF
)"
```

---

## Self-review checklist

**Spec coverage:** Each of the 5 problems flagged as Blocker/Major in the diagnostic synthesis is mapped to a task:
- Profile dead link → Task 1
- `confirm()` for study delete → Task 2
- `confirm()` for member remove → Task 3
- Raw studySlug Badge → Task 4
- Slug prefix `/admin/w/` → Task 5
- Onboarding step 3 → Task 6

**Placeholder scan:** No "TBD", "implement later", or "add error handling" generics. Every step shows code or commands.

**Type consistency:** `FocusModeHeader` props (`projectSlug`, `projectTitle`, `study`, `studySlug`) are used identically in component, test, and AppSidebar call site. `memberToRemove: { userId; name } | null` shape matches across `requestRemoveMember`, `confirmRemoveMember`, and the dialog body. NavUser's added prop `projectSlug?: string` is consistent across the signature change and both call sites at lines 503 and 566.

**Out-of-scope guards:** No backend/migration changes. No form-discipline refactor (Plan B). No nav-config consolidation (Plan C). No hook-extraction (Plan D). No long-running-action progress (Plan E).
