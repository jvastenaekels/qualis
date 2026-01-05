import { test } from '@playwright/test';
import { setupAdminMocks, resetStores } from '../fixtures/admin-mocks';
import { AdminPage } from '../pages/AdminPage';

// Initialize mocks
test.beforeEach(async ({ page }) => {
    resetStores();
    await setupAdminMocks(page);
});

test.describe('Admin Flow (Zero to Hero) [Refactored]', () => {
    let adminPage: AdminPage;

    test.beforeEach(async ({ page }) => {
        adminPage = new AdminPage(page);

        // 1. LOGIN
        await adminPage.login();
    });

    test('Zero to Hero: Full Lifecycle', async ({ page }) => {
        // 2. CREATE STUDY
        await adminPage.createStudy('Zero Hero Study', 'zero-hero');

        // 3. CONFIGURE
        await adminPage.configureQSort(['S1', 'S2', 'S3']);

        // 4. ACTIVATE
        await adminPage.launchStudy();

        // 5. DATA SIMULATION & MONITOR
        // Logic for checking participants involves mocking specific endpoints which are handled in setupAdminMocks
        // But we need to verify the table shows up.
        // The original test mocked data simulation dynamically.
        // Our setupAdminMocks uses `participantsStore`.
        // We need to inject data into `participantsStore`.
        const { getParticipantsStore } = await import('../fixtures/admin-mocks');
        getParticipantsStore().push({
            id: 101,
            session_token: 'sess-12345678',
            status: 'completed',
            progress: 100,
            is_completed: true,
            is_discarded: false,
            created_at: new Date().toISOString(),
            submitted_at: new Date().toISOString(),
            language_used: 'en',
        });

        // Reload to see data
        const participantsRes = page.waitForResponse(
            /\/api\/admin\/studies\/zero-hero\/participants/
        );
        await page.reload();
        await participantsRes;

        // Verify participant visible (using exact false to match partial token or ID)
        await adminPage.verifyParticipant(/sess-123/);

        // 6. EXPORT
        await adminPage.exportCSV();

        // 7. CLOSE
        await adminPage.closeStudy('zero-hero');

        // 8. LOGOUT
        await adminPage.logout();
    });
});
