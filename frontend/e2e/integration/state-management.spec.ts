import { test, expect } from '../fixtures/db-setup';
import { testDataBuilders, gridConfig10 } from '../fixtures/test-data';

interface StudyResult {
    slug: string;
    id: string;
}

/**
 * Integration Testing: State Management Flows
 *
 * Verifies that study state transitions work correctly and
 * affect participant access appropriately.
 */

test.describe('State Management Flow Tests', () => {
    test('Draft -> Active -> Paused -> Active -> Closed flow', async ({
        page,
        testDb,
        authToken,
    }) => {
        // 1. Create study in draft state
        const study = (await testDb.createStudy(
            authToken,
            testDataBuilders.study({
                slug: `test-state-flow-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                statements: testDataBuilders.statements(10),
                grid_config: gridConfig10,
                state: 'draft',
            })
        )) as StudyResult;

        // 2. Verify participant cannot access draft study
        await page.goto(`/study/${study.slug}`);
        await expect(
            page.locator('text=not available', {
                hasText: /not.*available|unavailable/i,
            })
        ).toBeVisible();

        // 3. Activate study
        await testDb.updateStudyState(authToken, study.slug, 'active');

        // 4. Verify participant can now access
        await page.goto(`/study/${study.slug}`);
        await expect(page.getByRole('button', { name: 'Get Started' })).toBeVisible();

        // 5. Pause study
        await testDb.updateStudyState(authToken, study.slug, 'paused');

        // 6. Verify participant cannot access paused study
        await page.goto(`/study/${study.slug}`);
        await expect(
            page.locator('text=paused', {
                hasText: /paused|temporarily.*unavailable/i,
            })
        ).toBeVisible();

        // 7. Reactivate
        await testDb.updateStudyState(authToken, study.slug, 'active');
        await page.goto(`/study/${study.slug}`);
        await expect(page.getByRole('button', { name: 'Get Started' })).toBeVisible();

        // 8. Close study
        await testDb.updateStudyState(authToken, study.slug, 'closed');

        // 9. Verify participant cannot access closed study
        await page.goto(`/study/${study.slug}`);
        await expect(
            page.locator('text=closed', { hasText: /closed|ended/i }).first()
        ).toBeVisible();
    });

    test('Study state change in Admin reflects immediately in participant view', async ({
        context,
        testDb,
        authToken,
    }) => {
        const study = (await testDb.createStudy(
            authToken,
            testDataBuilders.study({
                slug: `test-state-sync-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                statements: testDataBuilders.statements(10),
                grid_config: gridConfig10,
                state: 'active',
            })
        )) as StudyResult;

        // Open two pages: Admin and Participant
        const adminPage = await context.newPage();
        const participantPage = await context.newPage();

        // Admin: Login and navigate directly to study
        const workspaceSlug = testDb.getWorkspaceSlug();
        await testDb.loginToAdminUI(adminPage);
        await adminPage.goto(`/app/${workspaceSlug}/studies/${study.slug}`);
        // Wait for study page to load by checking h1 (Title is "Overview" + Badge)
        await expect(adminPage.locator('h1')).toContainText('Overview');
        await expect(adminPage).toHaveURL(
            new RegExp(`/app/${workspaceSlug}/studies/${study.slug}`)
        );

        // Participant: Access study
        await participantPage.goto(`/study/${study.slug}`);
        await expect(participantPage.getByRole('button', { name: 'Get Started' })).toBeVisible();

        // Admin: Pause study
        await adminPage.getByRole('button', { name: 'Paused' }).click();
        await adminPage.getByRole('button', { name: 'Pause Study' }).click();

        // Wait for state to update in UI
        // dnd-kit mounts a global #DndLiveRegion-0 with role="status";
        // disambiguate with the testid on the study-status badge.
        await expect(adminPage.getByTestId('study-status')).toHaveText(/Paused/i);

        // Participant: Refresh and verify study is now paused
        await participantPage.reload();
        await expect(participantPage.locator('text=paused')).toBeVisible();

        await adminPage.close();
        await participantPage.close();
    });

    test('Study submission creates participant record', async ({ page, testDb, authToken }) => {
        const study = (await testDb.createStudy(
            authToken,
            testDataBuilders.study({
                slug: `test-submission-record-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                statements: testDataBuilders.statements(10),
                grid_config: gridConfig10,
                presort_config: { enabled: false, fields: {} },
                state: 'active',
            })
        )) as StudyResult;

        const apiUrl = process.env.API_BASE_URL || 'http://127.0.0.1:8000';
        const participantApiUrl = `${apiUrl}/api/admin/studies/${study.slug}/participants`;

        // Start
        await page.goto(`/study/${study.slug}`);
        await page.getByRole('button', { name: 'Get Started' }).click();

        await page.getByTestId('consent-checkbox').check();
        await page.getByTestId('consent-accept-btn').click();

        // Rough Sort: Distribute cards into piles (3-4-3)
        for (let i = 0; i < 10; i++) {
            await expect(page.locator('[data-testid^="card-"]').first()).toBeVisible();

            if (i < 3) {
                await page.getByTestId('rough-disagree-btn').click();
            } else if (i < 7) {
                await page.getByTestId('rough-neutral-btn').click();
            } else {
                await page.getByTestId('rough-agree-btn').click();
            }

            await page.waitForTimeout(250);
        }

        // Continue to fine sort
        await expect(page.getByTestId('rough-sort-next-btn')).toBeVisible();
        await page.getByTestId('rough-sort-next-btn').click();
        await expect(page).toHaveURL(/fine-sort/);

        // Fine Sort: place all cards from each pile into grid slots
        await expect(page.locator('[data-testid^="slot_"]').first()).toBeVisible();

        const piles = ['disagree', 'neutral', 'agree'];
        for (const pile of piles) {
            const pileTab = page.locator(`[data-testid="deck-${pile}"]`);
            await pileTab.click();
            await expect(pileTab).toHaveAttribute('aria-selected', 'true');

            const currentDeckArea = page.locator(`[data-testid="deck-area-${pile}"]`);

            while ((await currentDeckArea.locator('[data-testid^="card-"]').count()) > 0) {
                const card = currentDeckArea.locator('[data-testid^="card-"]').first();
                const slot = page
                    .locator('[data-testid^="slot_"]:not(:has([data-testid^="card-"]))')
                    .first();

                await card.click();
                await slot.click();
                await page.waitForTimeout(100);
            }
        }

        // Verify all cards placed and submit
        await expect(page.locator('[data-testid^="slot_"] [data-testid^="card-"]')).toHaveCount(10);
        await page.getByTestId('fine-sort-validate-btn').click();

        // Post-Sort
        await expect(page).toHaveURL(/post-sort/);

        // Post-sort has two steps: Step1_Feedback then Step2_Questionnaire.
        // Each "next" trigger has a stable testid; the role-based regex
        // collides with the header's "Continue later" button, so we drive
        // the wizard through testids directly.
        const submitButton = page.getByTestId('postsort-submit-btn');
        const step1Next = page.getByTestId('postsort-step1-next-btn');

        await expect(step1Next).toBeVisible({ timeout: 10000 });
        await step1Next.click();
        await expect(submitButton).toBeVisible({ timeout: 10000 });
        await submitButton.click();

        // Verify completion
        await expect(page.getByTestId('thank-you-message')).toBeVisible();

        // Verify submission was recorded in database. The endpoint returns
        // a PaginatedResponse<ParticipantRead> ({ items, total, limit, offset }),
        // not a bare array.
        const response = await fetch(participantApiUrl, {
            headers: { Authorization: `Bearer ${await testDb.login()}` },
        });
        const payload = (await response.json()) as {
            items: { status: string }[];
            total: number;
        };

        expect(payload.total).toBeGreaterThan(0);
        expect(payload.items[0].status).toBe('completed');
    });
});
