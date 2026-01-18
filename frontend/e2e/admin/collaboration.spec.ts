import { test, expect } from '../fixtures/db-setup';

test.describe('Collaboration Integration', () => {
    const apiUrl = process.env.API_BASE_URL || 'http://localhost:8000';
    const collabEmail = 'collab@example.com';
    const collabPassword = 'password123';

    test('Admin can invite existing user via full invitation flow', async ({
        page,
        testDb,
        authToken,
    }) => {
        // 1. Seed second user (User B)
        const seedResponse = await fetch(`${apiUrl}/api/test/seed`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user: {
                    email: collabEmail,
                    password: collabPassword,
                    is_superuser: false,
                },
                workspace: { name: 'Collab Workspace', slug: 'collab-ws' },
            }),
        });
        expect(seedResponse.ok).toBeTruthy();

        // 2. Admin (User A) creates invitation
        // 'test-workspace' is created by testDb fixture setup
        const workspaceSlug = testDb.getWorkspaceSlug();
        const inviteResponse = await fetch(
            `${apiUrl}/api/admin/workspaces/${workspaceSlug}/invitations`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${authToken}`,
                },
                body: JSON.stringify({
                    email: collabEmail, // Case insensitive check
                    role: 'researcher',
                }),
            }
        );

        expect(inviteResponse.ok).toBeTruthy();
        const inviteData = await inviteResponse.json();
        const token = inviteData.token;
        expect(token).toBeDefined();

        // 3. User B accepts invitation
        // First login programmatically to get User B's token
        const loginResponse = await fetch(`${apiUrl}/api/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                username: collabEmail,
                password: collabPassword,
            }),
        });
        const loginData = await loginResponse.json();
        const collabToken = loginData.access_token;

        // Call Accept Endpoint
        const acceptResponse = await fetch(`${apiUrl}/api/admin/invitations/accept`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${collabToken}`,
            },
            body: JSON.stringify({ token }),
        });
        expect(acceptResponse.ok).toBeTruthy();

        // 4. Verify Access via UI
        await page.goto('/login');
        await page.getByLabel(/email/i).fill(collabEmail);
        await page.getByLabel(/password/i).fill(collabPassword);
        await page.getByRole('button', { name: /sign in/i }).click();

        // Verify Access to Test Workspace
        await page.getByTestId('workspace-switcher').click();
        await expect(page.getByRole('menuitem', { name: /Test Workspace/i })).toBeVisible();
    });

    test('Already invited user handling (Idempotency)', async ({ page, testDb, authToken }) => {
        // Seed & Add Member first
        // Re-invite or Re-accept?
        // If we accept twice, it should be fine ("Already a member").
    });
});
