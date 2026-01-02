import { test, expect } from '@playwright/test';

test.describe('Auth Edge Cases & Hardening', () => {
    test.beforeEach(async ({ page }) => {
        page.on('console', (msg) => console.log(`[Browser]: ${msg.text()}`));
    });

    test('Registration: Handles Duplicate Email', async ({ page }) => {
        // Mock Verify Token (Valid)
        await page.route(/\/api\/auth\/verify-invite\/?/, async (route) => {
            const token = new URL(route.request().url()).searchParams.get('token');
            if (token === 'valid-token') {
                await route.fulfill({
                    json: { email: 'duplicate@example.com', study_id: 1, role: 'participant' },
                });
            } else {
                await route.continue();
            }
        });

        // Mock Register Endpoint -> 400 Duplicate
        // Mock Successful Verification
        await page.route(/\/api\/admin\/invitations\/verify\/?/, async (route) => {
            await route.fulfill({
                status: 200,
                body: JSON.stringify({ email: 'test@example.com', study_id: 1, role: 'viewer' }),
            });
        });

        await page.route(/\/api\/auth\/register\/?/, async (route) => {
            await route.fulfill({
                status: 400, // Bad Request
                body: JSON.stringify({ detail: 'Email already registered' }), // Explicit body string
            });
        });

        await page.goto('/register?token=valid-token');

        // Wait for verification to complete and form to load
        await expect(page.getByText('Create Account')).toBeVisible();

        await page
            .getByPlaceholder(/••••••••/i)
            .first()
            .fill('password123');
        await page
            .getByPlaceholder(/••••••••/i)
            .last()
            .fill('password123');

        await page.getByRole('button', { name: /complete registration/i }).click();

        // Verify Error Toast
        await expect(page.getByText('Email already registered')).toBeVisible();
    });

    test('Registration: Handles Expired/Invalid Token', async ({ page }) => {
        // Mock Verify Token -> 400 Bad Request
        await page.route(/\/api\/auth\/verify-invite\/?/, async (route) => {
            await route.fulfill({
                status: 400,
                body: JSON.stringify({ detail: 'Invalid or expired token' }),
            });
        });

        await page.goto('/register?token=expired-token');

        // Wait for verification to fail
        await expect(page.getByText('Verifying your invitation...')).not.toBeVisible();

        // Verify Error Card
        await expect(page.getByText('Invalid Invitation')).toBeVisible();
        await expect(
            page.getByText('This invitation link is invalid or has expired')
        ).toBeVisible();
    });

    test('Global Security: Auto-logout on 401', async ({ page }) => {
        // 1. Mock Login Success
        await page.route(/\/api\/token\/?/, async (route) => {
            await route.fulfill({ json: { access_token: 'valid-token', token_type: 'bearer' } });
        });
        await page.route(/\/api\/me\/?/, async (route) => {
            // Initial check
            await route.fulfill({
                json: { id: 1, is_superuser: true, email: 'admin@example.com' },
            });
        });

        // Login
        await page.goto('/login');
        await page.getByLabel(/email/i).fill('admin@example.com');
        await page.getByLabel(/password/i).fill('password');
        await page.getByRole('button', { name: /continue/i }).click();

        // Ensure we are in
        await expect(page).toHaveURL('/admin');

        // 2. Mock 401 on next request (e.g., refreshing list)
        await page.route(/\/api\/admin\/studies\/?/, async (route) => {
            await route.fulfill({
                status: 401,
                body: 'Unauthorized',
            });
        });

        // Trigger request (e.g. by navigating or reloading mainly, or clicking something that fetches)
        // Dashboard loads studies on mount. If we reload, it fetches.
        await page.reload();

        // Expect redirection to login
        await expect(page).toHaveURL(/.*\/login.*/);
    });
});
