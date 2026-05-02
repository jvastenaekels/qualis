/**
 * E2E: roles-and-quotas
 *
 * Covers Task 14 of the project-roles-refactor plan
 * (docs/superpowers/plans/2026-05-02-project-roles-refactor.md). The spec
 * exercises role-gated UI/API behaviour (owner / member / viewer) and
 * quota enforcement (member quota, owned-project quota).
 *
 * Quota scenarios are skipped under SKIP_QUOTA_E2E because the existing
 * Playwright `webServer` block boots one backend per CI run with default
 * quotas (MAX_*_PROJECT/OWNER = 0, i.e. unlimited). Re-running with
 * MAX_MEMBERS_PER_PROJECT=2 + E2E_MAX_MEMBERS=2 (or
 * MAX_PROJECTS_AS_OWNER=N + E2E_MAX_OWNED=N) and SKIP_QUOTA_E2E unset
 * exposes them.
 *
 * The legacy-researcher rejection scenario hits the public
 * `POST /admin/projects/{slug}/invitations` endpoint with `role=researcher`,
 * exercising the Pydantic enum gate (422). Forging a JWT with the legacy
 * role string would require the backend SECRET_KEY and is covered by the
 * backend test suite.
 */

import { test, expect } from '../fixtures/db-setup';
import type { Page } from '@playwright/test';

const API_BASE = process.env.API_BASE_URL || 'http://127.0.0.1:8000';

// ───────────────────────── helpers ──────────────────────────

interface SeededIdentity {
    email: string;
    password: string;
    userId: number;
    projectId: number;
    projectSlug: string;
}

/**
 * Seed an isolated user + project pair via the test router. The user is
 * the owner of the project. Returns the identity bundle so that we can
 * later add this user as a member/viewer to a different project.
 */
async function seedIdentity(suffix: string): Promise<SeededIdentity> {
    const testId = `${Date.now()}-${suffix}-${Math.random().toString(36).slice(2, 8)}`;
    const email = `roles-${testId}@example.com`;
    const password = 'testpassword';
    const projectSlug = `roles-${testId}`;

    const res = await fetch(`${API_BASE}/api/test/seed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            user: { email, password, is_superuser: false },
            project: { name: `Roles Test ${testId}`, slug: projectSlug },
        }),
    });
    if (!res.ok) {
        throw new Error(`seedIdentity failed: ${res.status} ${await res.text()}`);
    }
    const data = (await res.json()) as { user_id: number; project_id: number };
    return {
        email,
        password,
        userId: data.user_id,
        projectId: data.project_id,
        projectSlug,
    };
}

/** Add a user as `member` or `viewer` to an existing project. */
async function addProjectMember(
    email: string,
    projectSlug: string,
    role: 'member' | 'viewer'
): Promise<void> {
    const res = await fetch(`${API_BASE}/api/test/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, project_slug: projectSlug, role }),
    });
    if (!res.ok) {
        throw new Error(`addProjectMember failed: ${res.status} ${await res.text()}`);
    }
}

/** Login via /api/token, returning the bearer token. */
async function login(email: string, password: string): Promise<string> {
    const res = await fetch(`${API_BASE}/api/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ username: email, password }),
    });
    if (!res.ok) {
        throw new Error(`login failed: ${res.status} ${await res.text()}`);
    }
    const data = (await res.json()) as { access_token: string };
    return data.access_token;
}

/**
 * Resolve the numeric `project_id` for an existing slug by re-issuing the
 * idempotent `/api/test/seed` call. The endpoint returns the existing id
 * when the slug already exists. Used because `TestDatabase` keeps the id
 * private after `setup()`.
 */
async function resolveProjectId(ownerEmail: string, projectSlug: string): Promise<number> {
    const res = await fetch(`${API_BASE}/api/test/seed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            user: { email: ownerEmail, password: 'testpassword', is_superuser: true },
            project: { name: 'Owner Project', slug: projectSlug },
        }),
    });
    if (!res.ok) {
        throw new Error(`resolveProjectId failed: ${res.status} ${await res.text()}`);
    }
    const data = (await res.json()) as { project_id: number; user_id: number };
    return data.project_id;
}

/**
 * Inject auth state for a user with the given role on a target project,
 * then navigate to that project's dashboard. Mirrors the seeding shape
 * used by `TestDatabase.loginToAdminUI` but allows arbitrary
 * user_role / project pairs.
 */
async function loginAsRole(
    page: Page,
    opts: {
        token: string;
        userId: number;
        email: string;
        projectId: number;
        projectSlug: string;
        projectTitle: string;
        role: 'owner' | 'member' | 'viewer';
        isSuperuser?: boolean;
    }
): Promise<void> {
    await page.addInitScript(
        ({ token, user, project }) => {
            window.sessionStorage.setItem(
                'admin-auth-storage',
                JSON.stringify({
                    state: {
                        token,
                        user,
                        projects: [project],
                        currentProject: project,
                    },
                    version: 2,
                })
            );
        },
        {
            token: opts.token,
            user: {
                id: opts.userId,
                email: opts.email,
                is_superuser: opts.isSuperuser ?? false,
            },
            project: {
                id: opts.projectId,
                slug: opts.projectSlug,
                title: opts.projectTitle,
                user_role: opts.role,
            },
        }
    );

    await page.goto(`/app/${opts.projectSlug}/dashboard`);
    await page.waitForURL(/\/app\//);
}

// ──────────────────── test suites ───────────────────────────

test.describe('owner can manage team', () => {
    test('owner invites a new member', async ({ page, testDb }) => {
        await testDb.loginToAdminUI(page);
        const projectSlug = testDb.getWorkspaceSlug();

        await page.goto(`/app/${projectSlug}/members`);
        await expect(page.getByRole('heading', { name: /team members/i })).toBeVisible();

        // Open invite modal
        await page.getByRole('button', { name: /invite collaborator/i }).click();

        // Fill email (label isn't bound via htmlFor; target the textbox by placeholder).
        const dialog = page.getByRole('dialog');
        await dialog
            .getByPlaceholder(/researcher@university\.edu/i)
            .fill(`invitee-${Date.now()}@example.com`);

        await dialog.getByRole('button', { name: /create.*send invitation/i }).click();

        // Success indicator: invite-link panel shown inside the dialog. The
        // same message also appears as a toast — scope to the dialog so the
        // strict-mode locator stays unambiguous.
        await expect(dialog.getByText(/invitation link generated/i)).toBeVisible();
    });

    test('owner changes a member role', async ({ page, testDb }) => {
        await testDb.loginToAdminUI(page);
        const projectSlug = testDb.getWorkspaceSlug();

        // Seed a real second user and add them as a member.
        const member = await seedIdentity('rolechange');
        await addProjectMember(member.email, projectSlug, 'member');

        await page.goto(`/app/${projectSlug}/members`);

        // Find the row for our seeded member by email and switch their role.
        const memberRow = page.getByRole('row').filter({ hasText: member.email });
        await expect(memberRow).toBeVisible();

        // The role select trigger inside the row currently shows "Member".
        await memberRow.getByRole('combobox').click();
        await page.getByRole('option', { name: /^viewer$/i }).click();

        // Re-read row and assert new value (the role_update_success toast key
        // has no en translation yet, so we don't wait for the toast string).
        await expect(memberRow.getByRole('combobox')).toContainText(/viewer/i);
    });

    test('owner removes a member', async ({ page, testDb }) => {
        await testDb.loginToAdminUI(page);
        const projectSlug = testDb.getWorkspaceSlug();

        const removed = await seedIdentity('toremove');
        await addProjectMember(removed.email, projectSlug, 'member');

        await page.goto(`/app/${projectSlug}/members`);
        const row = page.getByRole('row').filter({ hasText: removed.email });
        await expect(row).toBeVisible();

        // The trash button has aria-label "Remove {name}" (admin.projects.settings.team.remove_member_aria).
        await row.getByRole('button', { name: /remove/i }).click();

        // Confirm in AlertDialog (label: "Remove")
        await page
            .getByRole('alertdialog')
            .getByRole('button', { name: /^remove$/i })
            .click();

        await expect(page.getByText(/member removed successfully/i)).toBeVisible();
        await expect(page.getByRole('row').filter({ hasText: removed.email })).toHaveCount(0);
    });
});

test.describe('member cannot manage team', () => {
    test('invite controls are absent or disabled for a member', async ({ page, testDb }) => {
        // Owner identity created via testDb; Member identity is added as 'member'.
        const ownerSlug = testDb.getWorkspaceSlug();
        const ownerEmail = testDb.getUserEmail();
        const ownerProjectId = await resolveProjectId(ownerEmail, ownerSlug);

        const memberIdentity = await seedIdentity('member');
        await addProjectMember(memberIdentity.email, ownerSlug, 'member');

        const memberToken = await login(memberIdentity.email, memberIdentity.password);

        await loginAsRole(page, {
            token: memberToken,
            userId: memberIdentity.userId,
            email: memberIdentity.email,
            projectId: ownerProjectId,
            projectSlug: ownerSlug,
            projectTitle: 'Owner Project',
            role: 'member',
        });

        await page.goto(`/app/${ownerSlug}/members`);
        await expect(page.getByRole('heading', { name: /team members/i })).toBeVisible();

        // Wait for the members list to render at least the member's own row.
        const ownRow = page.getByRole('row').filter({ hasText: memberIdentity.email });
        await expect(ownRow).toBeVisible();

        // Invite button must be disabled for non-owners.
        const inviteBtn = page.getByRole('button', { name: /invite collaborator/i });
        await expect(inviteBtn).toBeDisabled();

        // Role selects in every data row should be disabled — the page gates
        // them on `!isOwner || self`. With a member viewing, both gates are
        // true.
        const roleSelects = page.getByRole('combobox');
        const count = await roleSelects.count();
        expect(count).toBeGreaterThan(0);
        for (let i = 0; i < count; i++) {
            await expect(roleSelects.nth(i)).toBeDisabled();
        }

        // Remove buttons (Trash icons exposed via aria-label "Remove …").
        const removeButtons = page.getByRole('button', { name: /^remove/i });
        const removeCount = await removeButtons.count();
        expect(removeCount).toBeGreaterThan(0);
        for (let i = 0; i < removeCount; i++) {
            await expect(removeButtons.nth(i)).toBeDisabled();
        }
    });

    test('direct invitation API call returns 403 for member', async ({ request, testDb }) => {
        const ownerSlug = testDb.getWorkspaceSlug();

        const memberIdentity = await seedIdentity('memberapi');
        await addProjectMember(memberIdentity.email, ownerSlug, 'member');
        const memberToken = await login(memberIdentity.email, memberIdentity.password);

        const res = await request.post(`${API_BASE}/api/admin/projects/${ownerSlug}/invitations`, {
            headers: {
                Authorization: `Bearer ${memberToken}`,
                'Content-Type': 'application/json',
            },
            data: { email: 'rejected@example.com', role: 'member' },
        });
        expect(res.status()).toBe(403);
    });
});

test.describe('viewer is fully read-only', () => {
    test('concourse detail has no edit controls for viewer', async ({
        page,
        testDb,
        authToken,
    }) => {
        const ownerSlug = testDb.getWorkspaceSlug();
        const ownerEmail = testDb.getUserEmail();
        const ownerProjectId = await resolveProjectId(ownerEmail, ownerSlug);

        // Owner creates a concourse so there is something to view.
        const concourseRes = await fetch(`${API_BASE}/api/admin/concourses`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${authToken}`,
                'X-Project-ID': String(ownerProjectId),
            },
            body: JSON.stringify({
                title: `Viewer-RO Concourse ${Date.now()}`,
                description: 'Read-only test fixture',
            }),
        });
        if (!concourseRes.ok) {
            throw new Error(
                `concourse create failed: ${concourseRes.status} ${await concourseRes.text()}`
            );
        }
        const concourse = (await concourseRes.json()) as { id: number };

        const viewerIdentity = await seedIdentity('viewer');
        await addProjectMember(viewerIdentity.email, ownerSlug, 'viewer');
        const viewerToken = await login(viewerIdentity.email, viewerIdentity.password);

        await loginAsRole(page, {
            token: viewerToken,
            userId: viewerIdentity.userId,
            email: viewerIdentity.email,
            projectId: ownerProjectId,
            projectSlug: ownerSlug,
            projectTitle: 'Owner Project',
            role: 'viewer',
        });

        await page.goto(`/app/${ownerSlug}/concourses/${concourse.id}`);
        await expect(page.getByRole('heading', { name: /concourse/i }).first()).toBeVisible();

        // Edit controls are gated behind canEdit; viewers must NOT see Add Item
        // or Bulk Import.
        await expect(page.getByRole('button', { name: /add item/i })).toHaveCount(0);
        await expect(page.getByRole('button', { name: /bulk import/i })).toHaveCount(0);

        // Read-only affordances remain visible (Export CSV button is always rendered).
        await expect(page.getByRole('button', { name: /export csv/i })).toBeVisible();
    });

    test('viewer cannot mutate via API (403 on study create)', async ({ request, testDb }) => {
        const ownerSlug = testDb.getWorkspaceSlug();
        const ownerEmail = testDb.getUserEmail();
        const ownerProjectId = await resolveProjectId(ownerEmail, ownerSlug);

        const viewerIdentity = await seedIdentity('viewerapi');
        await addProjectMember(viewerIdentity.email, ownerSlug, 'viewer');
        const viewerToken = await login(viewerIdentity.email, viewerIdentity.password);

        const res = await request.post(`${API_BASE}/api/admin/studies`, {
            headers: {
                Authorization: `Bearer ${viewerToken}`,
                'Content-Type': 'application/json',
                'X-Project-ID': String(ownerProjectId),
            },
            data: {
                project_id: ownerProjectId,
                slug: `viewer-block-${Date.now()}`,
                translations: [
                    {
                        language_code: 'en',
                        title: 'Should be blocked',
                    },
                ],
                grid_config: [],
                statements: [],
            },
        });
        expect(res.status()).toBe(403);
    });
});

test.describe('owner role is never offered in dropdowns', () => {
    test('invite role dropdown excludes owner', async ({ page, testDb }) => {
        await testDb.loginToAdminUI(page);
        const projectSlug = testDb.getWorkspaceSlug();

        await page.goto(`/app/${projectSlug}/members`);
        await page.getByRole('button', { name: /invite collaborator/i }).click();

        // Open the role select inside the dialog. Two combobox elements exist
        // (the Radix portal duplicates them) — the visible trigger is first.
        const dialog = page.getByRole('dialog');
        await dialog.getByRole('combobox').first().click();

        // Listbox is portalled; assert against role=option globally.
        await expect(page.getByRole('option', { name: /^member$/i })).toBeVisible();
        await expect(page.getByRole('option', { name: /^viewer$/i })).toBeVisible();
        await expect(page.getByRole('option', { name: /^owner$/i })).toHaveCount(0);
    });

    test('change-role dropdown excludes owner', async ({ page, testDb }) => {
        await testDb.loginToAdminUI(page);
        const projectSlug = testDb.getWorkspaceSlug();

        const member = await seedIdentity('dropdown');
        await addProjectMember(member.email, projectSlug, 'member');

        await page.goto(`/app/${projectSlug}/members`);
        const row = page.getByRole('row').filter({ hasText: member.email });
        await row.getByRole('combobox').click();

        await expect(page.getByRole('option', { name: /^member$/i })).toBeVisible();
        await expect(page.getByRole('option', { name: /^viewer$/i })).toBeVisible();
        await expect(page.getByRole('option', { name: /^owner$/i })).toHaveCount(0);
    });
});

test.describe('owner cannot self-remove', () => {
    test('owner self-remove API returns 4xx', async ({ request, testDb, authToken }) => {
        const ownerSlug = testDb.getWorkspaceSlug();
        const ownerEmail = testDb.getUserEmail();

        // Resolve owner user_id via the seed endpoint (idempotent).
        const seedRes = await fetch(`${API_BASE}/api/test/seed`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user: { email: ownerEmail, password: 'testpassword', is_superuser: true },
                project: { name: 'Owner Project', slug: ownerSlug },
            }),
        });
        const { user_id } = (await seedRes.json()) as { user_id: number };

        const res = await request.delete(
            `${API_BASE}/api/admin/projects/${ownerSlug}/members/${user_id}`,
            { headers: { Authorization: `Bearer ${authToken}` } }
        );
        // 400 (cannot remove self / cannot remove owner) or 403 are both acceptable.
        expect([400, 403]).toContain(res.status());
    });

    test('owner row in UI exposes a disabled remove button', async ({ page, testDb }) => {
        await testDb.loginToAdminUI(page);
        const projectSlug = testDb.getWorkspaceSlug();
        const ownerEmail = testDb.getUserEmail();

        await page.goto(`/app/${projectSlug}/members`);
        const ownerRow = page.getByRole('row').filter({ hasText: ownerEmail });
        await expect(ownerRow).toBeVisible();

        // Owner's own remove button is disabled (gated by `member.user_id === currentUser?.id`).
        const removeBtn = ownerRow.getByRole('button', { name: /remove/i });
        await expect(removeBtn).toBeDisabled();
    });
});

test.describe('member quota blocks invite at limit', () => {
    test.skip(
        Boolean(process.env.SKIP_QUOTA_E2E) || !process.env.E2E_MAX_MEMBERS,
        'Set MAX_MEMBERS_PER_PROJECT and E2E_MAX_MEMBERS to a low value (e.g. 2) and unset SKIP_QUOTA_E2E to run this test'
    );

    test('invite button disabled and counter visible at quota', async ({ page, testDb }) => {
        await testDb.loginToAdminUI(page);
        const projectSlug = testDb.getWorkspaceSlug();
        const limit = Number(process.env.E2E_MAX_MEMBERS || '2');

        // Fill the project up to the limit (we already have the owner = 1).
        for (let i = 1; i < limit; i++) {
            const fillIdentity = await seedIdentity(`quota-${i}`);
            await addProjectMember(fillIdentity.email, projectSlug, 'member');
        }

        await page.goto(`/app/${projectSlug}/members`);
        await expect(
            page.getByText(new RegExp(`${limit}\\s*/\\s*${limit}\\s*seats used`, 'i'))
        ).toBeVisible();
        await expect(page.getByRole('button', { name: /invite collaborator/i })).toBeDisabled();
    });
});

test.describe('owner-project quota blocks creation', () => {
    test.skip(
        Boolean(process.env.SKIP_QUOTA_E2E) || !process.env.E2E_MAX_OWNED,
        'Set MAX_PROJECTS_AS_OWNER and E2E_MAX_OWNED and unset SKIP_QUOTA_E2E to run this test'
    );

    test('create button disabled when owned-project quota is full', async ({ page, testDb }) => {
        await testDb.loginToAdminUI(page);
        await page.goto(`/admin/projects/new`);

        const createBtn = page.getByRole('button', { name: /create/i }).last();
        await expect(createBtn).toBeDisabled();
    });
});

test.describe('legacy researcher token rejected', () => {
    test('invitation create with role=researcher returns 422', async ({
        request,
        testDb,
        authToken,
    }) => {
        // The legacy `researcher` value is gone from the ProjectRole enum.
        // The create-invitation endpoint validates the role via Pydantic, so
        // a forged payload returns a 422 (unprocessable) without ever reaching
        // the database. This is the only legacy-rejection scenario that doesn't
        // require the backend SECRET_KEY (the JWT-forging path is covered by
        // the backend test suite).
        const projectSlug = testDb.getWorkspaceSlug();
        const res = await request.post(
            `${API_BASE}/api/admin/projects/${projectSlug}/invitations`,
            {
                headers: {
                    Authorization: `Bearer ${authToken}`,
                    'Content-Type': 'application/json',
                },
                data: { email: 'legacy@example.com', role: 'researcher' },
            }
        );
        expect(res.status()).toBe(422);
    });
});
