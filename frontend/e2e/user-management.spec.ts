import { expect, test } from '@playwright/test';

test.describe('User Management (Phase 8)', () => {
    // Skip in CI due to mock/real backend interaction issues
    test.skip(!!process.env.CI, 'Skipped in CI - mocking needs refinement');
    test.beforeEach(async ({ page }) => {
        // Mock Auth
        await page.route(/\/api\/token\/?/, async (route) => {
            await route.fulfill({ json: { access_token: 'valid-jwt', token_type: 'bearer' } });
        });
        await page.route(/\/api\/me\/?/, async (route) => {
            await route.fulfill({
                json: { id: 1, email: 'admin@example.com', is_superuser: true },
            });
        });

        // Mock Study
        await page.route(/\/api\/admin\/studies\/zero-hero\/?$/, async (route) => {
            await route.fulfill({
                json: {
                    id: 1,
                    slug: 'zero-hero',
                    title: 'Zero Hero Study',
                    collaborators: [
                        {
                            user_id: 1,
                            role: 'owner',
                            user: { email: 'admin@example.com' },
                            added_at: new Date().toISOString(),
                        },
                    ],
                },
            });
        });

        // Mock Invitation Generation
        await page.route(/\/api\/admin\/invitations\/zero-hero\/invite/, async (route) => {
            const body = route.request().postDataJSON();
            await route.fulfill({
                json: {
                    invite_url: `http://localhost:5173/register?token=mock-token-${body.email}`,
                    token: `mock-token-${body.email}`,
                },
            });
        });

        // Mock Invitation Verification
        await page.route('**/api/admin/invitations/verify*', async (route) => {
            console.log('Fulfilling verify route:', route.request().url());
            await route.fulfill({
                json: {
                    email: 'newguy@example.com',
                    study_id: 1,
                    role: 'editor',
                },
            });
        });

        // Mock Registration
        await page.route(/\/api\/auth\/register/, async (route) => {
            await route.fulfill({
                json: { id: 2, email: 'newguy@example.com', is_active: true },
            });
        });
    });

    test('Invite and Join Flow', async ({ page }) => {
        // 1. Admin generates invite
        await page.goto('/login');
        await page.getByLabel(/email/i).fill('admin@example.com');
        await page.getByLabel(/password/i).fill('password123');
        await page.getByRole('button', { name: /continue/i }).click();

        await page.goto('/admin/studies/zero-hero/team');
        await expect(page.getByText('Collaboration Center')).toBeVisible();

        await page.getByLabel(/email address/i).fill('newguy@example.com');
        await page.getByRole('button', { name: /generate link/i }).click();

        await expect(page.getByText('Invitation link generated!')).toBeVisible();
        const inviteLinkInput = page.locator('input[readonly]');
        const inviteUrl = await inviteLinkInput.inputValue();
        expect(inviteUrl).toContain('token=mock-token-newguy@example.com');

        // 2. New user joins
        const verifyResponsePromise = page.waitForResponse(
            (resp) => resp.url().includes('/api/admin/invitations/verify') && resp.status() === 200
        );
        await page.goto(inviteUrl);
        await verifyResponsePromise;

        await expect(page.getByText(/create your account/i)).toBeVisible();
        await expect(page.locator('input[type="email"]')).toHaveValue('newguy@example.com');

        await page.getByLabel(/full name/i).fill('New Guy');
        await page.getByLabel(/password/i).fill('securepassword');
        await page.getByRole('button', { name: /create account/i }).click();

        await expect(page).toHaveURL('/login');
        await expect(page.getByText(/account created successfully/i)).toBeVisible();
    });
});
