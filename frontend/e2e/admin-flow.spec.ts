import { expect, test } from '@playwright/test';

// --- MOCK DATA & STATE ---

const MOCK_USER = {
    id: 1,
    email: 'admin@example.com',
    is_active: true,
    is_superuser: true,
};

let studiesStore: any[] = [];
let participantsStore: any[] = [];

test.describe('Admin Flow (Zero to Hero)', () => {
    test.beforeEach(async ({ page }) => {
        studiesStore = [];
        participantsStore = [];

        page.on('console', (msg) => {
            const text = msg.text();
            if (
                !text.includes('React Router Future Flag') &&
                !text.includes('Download the React DevTools')
            ) {
                console.log(`[Browser]: ${text}`);
            }
        });
        page.on('pageerror', (err) => console.error(`[Browser Error]: ${err.message}`));

        // AUTH
        await page.route('**/api/token', async (route) => {
            await route.fulfill({ json: { access_token: 'valid-jwt', token_type: 'bearer' } });
        });
        await page.route('**/api/me', async (route) => {
            await route.fulfill({ json: MOCK_USER });
        });

        // STUDIES
        await page.route('**/api/admin/studies', async (route) => {
            if (route.request().method() === 'POST') {
                const body = route.request().postDataJSON();
                const newStudy = {
                    id: studiesStore.length + 1,
                    slug: body.slug,
                    title: body.title,
                    state: 'draft',
                    created_at: new Date().toISOString(),
                    collaborators: [
                        { user_id: 1, role: 'owner', user: { email: MOCK_USER.email } },
                    ],
                    statements: [],
                    grid_config: [],
                    translations: [{ language_code: 'en', title: body.title }],
                };
                studiesStore.push(newStudy);
                await route.fulfill({ status: 201, json: newStudy });
            } else {
                await route.fulfill({ json: studiesStore });
            }
        });

        await page.route('**/api/admin/studies/*', async (route) => {
            const url = route.request().url();
            // Handle sub-resources manually since glob is broad
             if (url.includes('/state')) {
                const slug = url.match(/studies\/([\w-]+)\/state/)?.[1];
                const study = studiesStore.find((s) => s.slug === slug);
                if (!study) return route.fulfill({ status: 404 });

                const action = new URL(url).searchParams.get('action');
                if (action === 'activate') study.status = 'active';
                if (action === 'close') study.status = 'completed';
                return route.fulfill({ json: { ...study, state: study.status } });
            }

            if (url.includes('/stats')) {
                const slug = url.match(/studies\/([\w-]+)\/stats/)?.[1];
                const study = studiesStore.find((s) => s.slug === slug);
                return route.fulfill({
                    json: {
                        total_participants: participantsStore.length,
                        completed_participants: participantsStore.filter((p) => p.is_completed).length,
                        status: study?.status || 'draft',
                    },
                });
            }

            if (url.includes('/participants')) {
                 return route.fulfill({ json: participantsStore });
            }

            if (url.includes('/export/csv')) {
                 return route.fulfill({ status: 200, contentType: 'text/csv', body: 'p1,s1,2' });
            }

            // Fallback: Get Single Study
            const slug = url.split('/').pop()?.split('?')[0];
            const study = studiesStore.find((s) => s.slug === slug);
            if (study) {
                 return route.fulfill({ json: study });
            }

            // If we got here and it's not handled, continue (or 404)
            // But since the glob matches everything under studies/*, we must handle or fallback
            // For now, let's assume it's a get study if nothing else matches
            return route.fulfill({ status: 404, body: 'Not Found in Mock' });
        });

        await page.route(/\/api\/logs\/?/, async (route) => {
            await route.fulfill({ status: 204 });
        });

        // Catch-all for any other admin API requests to prevent 401s from real backend
        await page.route(/\/api\/admin\/.*/, async (route) => {
            console.log(`[Mock Catch-All] Intercepting unmocked admin request: ${route.request().url()}`);
            await route.fulfill({ status: 200, json: {} });
        });

        // Catch-all for any other API requests
        await page.route(/\/api\/.*/, async (route) => {
            console.log(`[Mock Catch-All] Intercepting unmocked request: ${route.request().url()}`);
            await route.fulfill({ status: 200, json: {} });
        });
    });

    test('Zero to Hero: Full Lifecycle', async ({ page, isMobile }) => {
        // 1. LOGIN
        await page.goto('/login');
        await page.getByLabel(/email/i).fill('admin@example.com');
        await page.getByLabel(/password/i).fill('password123');
        await page.getByRole('button', { name: /continue/i }).click();
        await expect(page).toHaveURL('/admin');

        // 2. CREATE STUDY
        if (isMobile) {
            // Use data attribute for more robust selection
            await page.locator('[data-sidebar="trigger"]').first().click();
        }

        await page.getByRole('button', { name: /no study selected|select study/i }).click();
        await page.getByRole('menuitem', { name: /add study/i }).click();
        await page.getByLabel(/study title/i).fill('Zero Hero Study');
        await page.getByLabel(/url slug/i).fill('zero-hero');

        const createResponsePromise = page.waitForResponse(
            (resp) => resp.url().includes('/api/admin/studies') && resp.status() === 201
        );
        await page.getByRole('button', { name: /create/i }).click();
        await createResponsePromise;

        // 3. MONITOR & CONFIGURE
        await expect(page).toHaveURL(/\/admin\/studies\/zero-hero/);
        await expect(page.getByRole('heading', { name: /zero-hero/i })).toBeVisible();

        // Navigate to Designer via Sidebar
        await page.getByRole('link', { name: /designer/i }).click();

        // Select Q-Sort tab
        await page.getByRole('tab', { name: /tri \(q-sort\)/i }).click();

        // Use Bulk Editor
        const textarea = page.getByPlaceholder(/paste your statements here/i);
        await textarea.fill(`S1\nS2\nS3`);
        await page.getByRole('button', { name: /process & replace/i }).click();
        await expect(page.getByText('S1').first()).toBeVisible();

        // 4. ACTIVATE
        await page.getByRole('link', { name: /overview/i }).click();
        await page.getByRole('button', { name: /launch study/i }).click();
        await page.getByRole('button', { name: /yes, launch now/i }).click();
        await expect(page.getByText('LIVE FIELDWORK')).toBeVisible();

        // 5. DATA SIMULATION
        participantsStore.push({
            id: 101,
            session_token: 'sess-12345678', // Longer token
            status: 'completed',
            progress: 100,
            is_completed: true,
            is_discarded: false,
            created_at: new Date().toISOString(),
            submitted_at: new Date().toISOString(),
            language: 'en',
        });

        // Wait for response after reload to ensure UI is hydrated
        const participantsRes = page.waitForResponse(
            /\/api\/admin\/studies\/zero-hero\/participants/
        );
        await page.reload();
        await participantsRes;

        // 6. MONITOR
        await expect(page.getByText('sess-123', { exact: false })).toBeVisible();

        // 7. EXPORT
        const csvBtn = page.getByRole('button', { name: /export universal csv/i });
        const downloadPromise = page.waitForEvent('download');
        await csvBtn.click();
        const download = await downloadPromise;
        expect(download.suggestedFilename()).toContain('.csv');

        // 8. CLOSE
        await page.getByRole('button', { name: /close fieldwork/i }).click();
        await page.getByRole('button', { name: /close study/i }).click();
        // Match the badge specifically by using exact text or the status role
        await expect(page.getByRole('status').getByText('Closed', { exact: true })).toBeVisible();

        // 9. LOGOUT
        await page.getByRole('button', { name: /admin/i }).first().click();
        // Wait for logout? Actually the menu is already there.
        // The current implementation of Logout in sidebar is in NavUser
        // Wait, NavUser doesn't show a logout button in the code I saw earlier.
        // It just shows the user info.
        // Let's check CommandMenu (Cmd+K) or just click the user block.

        // Actually, the user profile block in sidebar is just info.
        // I'll check how logout is triggered in the real app.
        // In AdminLayout.tsx there is a CommandMenu.

        // Let's try Cmd+K then "Logout"
        await page.keyboard.press('Control+k');
        await page.getByPlaceholder(/type a command/i).fill('logout');
        await page.keyboard.press('Enter');

        await expect(page).toHaveURL('/login');
    });
});
