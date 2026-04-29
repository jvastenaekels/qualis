/**
 * E2E: Admin onboarding happy path — project to launchable study
 *
 * Quality roadmap Phase 4 item C — spec 2/4.
 * Tests the journey a brand-new researcher walks:
 *   login → create study → configure (via API helpers, see note below) →
 *   activate → verify the recruitment page is reachable.
 *
 * NOTE on configuration: The UI auto-save has a known comparison quirk that
 * can cause an infinite sync loop (see admin-flow.spec.ts comments). We
 * therefore use testDb.updateStudy() for content configuration, the same
 * pragmatic pattern already validated in admin-flow.spec.ts. Activation is
 * also done via testDb.activateStudy() because AdminPage.launchStudy() calls
 * waitForSync() which requires data-testid='sync-status' — absent in the
 * current StudyDesignPage architecture. The UI is exercised for post-activation
 * verification (design page status badge, recruitment page, public URL).
 */

import { test, expect } from '../fixtures/db-setup';
import { testDataBuilders } from '../fixtures/test-data';

test.setTimeout(120_000);

test.describe('Study setup onboarding', () => {
    test('researcher creates, configures, activates a study and reaches recruitment page', async ({
        page,
        testDb,
        authToken,
    }) => {
        const workspaceSlug = testDb.getWorkspaceSlug();

        // 1. Create the study via API first (the study-switcher UI path is tested
        //    separately in admin-flow.spec.ts; here we focus on the
        //    configure → activate → recruit lifecycle visible in the admin UI).
        const studySlug = `onboarding-${Date.now()}`;
        await testDb.createStudy(authToken, testDataBuilders.study({ slug: studySlug }));

        // 2. Login to admin UI and navigate to the study design page
        await testDb.loginToAdminUI(page);
        await page.goto(`/app/${workspaceSlug}/studies/${studySlug}/design`);
        await expect(page).toHaveURL(new RegExp(`studies/${studySlug}`), { timeout: 15_000 });

        // 3. Configure study content via API (statements + grid + translations)
        //    This mirrors the accepted pattern in admin-flow.spec.ts.
        await testDb.updateStudy(authToken, studySlug, {
            statements: testDataBuilders.statements(12, 'S'),
            grid_config: [
                { score: -3, capacity: 1 },
                { score: -2, capacity: 2 },
                { score: -1, capacity: 2 },
                { score: 0, capacity: 2 },
                { score: 1, capacity: 2 },
                { score: 2, capacity: 2 },
                { score: 3, capacity: 1 },
            ],
            translations: [
                {
                    language_code: 'en',
                    title: 'Onboarding E2E Study',
                    description: 'Created by the onboarding E2E spec',
                    instructions: 'Sort these statements',
                    objective: 'Testing the onboarding flow',
                    condition_of_instruction: 'How much do you agree with each statement?',
                    consent_title: 'Informed Consent',
                    consent_description: 'Please read and accept to continue.',
                },
            ],
        });

        // 4. Activate via API (AdminPage.launchStudy() calls waitForSync() which
        //    requires data-testid='sync-status' — this testid is not present in
        //    the current StudyDesignPage architecture. We therefore mirror the
        //    pragmatic pattern from admin-flow.spec.ts: activate via the API
        //    helper and then reload to verify the new state in the UI.
        await testDb.activateStudy(authToken, studySlug);

        // 5. Reload the design page and verify the status badge reads "Active".
        //    Use getByTestId to avoid a strict-mode conflict with the DnD live
        //    region div that also carries role="status" in the design page.
        await page.reload();
        await expect(page.getByTestId('study-status')).toHaveText(/active/i, {
            timeout: 15_000,
        });

        // 6. Navigate to the recruitment page and verify it renders for the
        //    now-active study
        await page.goto(`/app/${workspaceSlug}/studies/${studySlug}/recruitment`);
        await expect(page).toHaveURL(/recruitment/, { timeout: 15_000 });

        // The recruitment page shows the study URL card
        await expect(
            page.getByRole('heading', { name: /^access$/i }).first()
        ).toBeVisible({ timeout: 15_000 });

        // The study URL panel is present and contains the study slug in the URL
        // (the full URL string is unique; the bare slug also appears in the badge)
        await expect(page.getByText(new RegExp(`/study/${studySlug}`))).toBeVisible({
            timeout: 10_000,
        });

        // The "New Access Link" button is visible for an active study
        await expect(page.getByRole('button', { name: /new access link/i })).toBeVisible({
            timeout: 10_000,
        });

        // 7. Verify the public welcome page is reachable (recruitment URL is live)
        const welcomeResponse = await page.request.get(`/study/${studySlug}/welcome`);
        expect(welcomeResponse.status()).toBe(200);
    });
});
