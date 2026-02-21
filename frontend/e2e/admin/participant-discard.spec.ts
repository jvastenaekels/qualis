import { test, expect } from '../fixtures/db-setup';
import { testDataBuilders } from '../fixtures/test-data';

test.describe('Participant Discard E2E Tests (Real Backend)', () => {
    let studySlug: string;

    test.beforeEach(async ({ testDb, authToken }) => {
        const apiUrl = process.env.API_BASE_URL || 'http://127.0.0.1:8000';

        // Create Study
        const study = (await testDb.createStudy(
            authToken,
            testDataBuilders.study({
                slug: `discard-study-${Date.now()}`,
                statements: testDataBuilders.statements(23),
            })
        )) as { slug: string };
        studySlug = study.slug;

        // Activate Study
        await testDb.updateStudy(authToken, studySlug, { state: 'active' });

        // Add test participants
        await testDb.createParticipant(
            authToken,
            studySlug,
            testDataBuilders.participantResult({})
        );

        const p2 = await testDb.createParticipant(
            authToken,
            studySlug,
            testDataBuilders.participantResult({})
        );

        // Discard p2 via API
        const discardResp = await fetch(
            `${apiUrl}/api/admin/studies/participants/${p2.id}/discard`,
            {
                method: 'PATCH',
                headers: {
                    Authorization: `Bearer ${authToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    is_discarded: true,
                    discard_reason: 'Suspicious completion time',
                }),
            }
        );
        if (!discardResp.ok) {
            throw new Error(`Failed to discard p2: ${await discardResp.text()}`);
        }
    });

    test('should navigate to data view, open participant detail, discard and restore', async ({
        page,
        testDb,
    }) => {
        await testDb.loginToAdminUI(page);
        await page.goto(`/admin/studies/${studySlug}/exports`);

        // Verify table loads with 2 records
        await expect(page.locator('table')).toBeVisible({ timeout: 15000 });
        await expect(page.getByText('records found')).toBeVisible();
        await expect(page.locator('tbody tr')).toHaveCount(2);

        // Click on first participant row to open detail
        await page.locator('tbody tr').first().click();
        await expect(page.getByRole('heading', { name: /participant profile/i })).toBeVisible();

        // Find whichever action button is visible and click it
        const discardButton = page.getByRole('button', { name: /discard participant/i });
        const restoreButton = page.getByRole('button', { name: /restore participant/i });

        if (await discardButton.isVisible()) {
            // Discard the participant
            await discardButton.click();
            await expect(page.getByTestId('discarded-badge')).toBeVisible({ timeout: 5000 });

            // Now restore
            await expect(restoreButton).toBeVisible();
            await restoreButton.click();
            await expect(page.getByTestId('discarded-badge')).not.toBeVisible({ timeout: 5000 });
        } else {
            // Restore the participant
            await expect(restoreButton).toBeVisible();
            await restoreButton.click();
            await expect(page.getByTestId('discarded-badge')).not.toBeVisible({ timeout: 5000 });

            // Now discard
            await expect(discardButton).toBeVisible();
            await discardButton.click();
            await expect(page.getByTestId('discarded-badge')).toBeVisible({ timeout: 5000 });
        }
    });
});
