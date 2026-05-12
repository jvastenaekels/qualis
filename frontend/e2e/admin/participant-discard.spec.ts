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
        // Phase 5D rename: /admin/studies/{slug}/exports → /app/{project}/studies/{slug}/data.
        // (LegacyRedirect handles /admin/* but the segment "exports" no longer exists.)
        const projectSlug = testDb.getWorkspaceSlug();
        await page.goto(`/app/${projectSlug}/studies/${studySlug}/data`);

        // Verify table loads with 2 records.
        // (Removed legacy "records found" text assertion: the new
        // InteractiveDataView renders no such label; the row count below
        // already validates the data loaded.)
        await expect(page.locator('table')).toBeVisible({ timeout: 15000 });
        await expect(page.locator('tbody tr')).toHaveCount(2);

        // Click on first participant row to open detail. Participant detail
        // headings use the first 8 chars of the UUID session token, so the
        // code can contain A-F as well as digits.
        await page.locator('tbody tr').first().click();
        await expect(
            page.getByRole('heading', { name: /^participant\s+[0-9a-f]{8}$/i })
        ).toBeVisible();

        // The card's "Discard"/"Restore" button only opens an AlertDialog;
        // the actual mutation happens when the user clicks the dialog's
        // confirm action button (also labelled "Discard"/"Restore"). The
        // dialog action lives in role="alertdialog", so we scope to that
        // container to disambiguate from the trigger.
        const cardToggle = () =>
            page.getByRole('button', { name: /^(discard|restore)$/i, exact: false }).first();

        const confirmDialogAction = () =>
            page.getByRole('alertdialog').getByRole('button', { name: /^(discard|restore)$/i });

        const initialLabel = (await cardToggle().textContent())?.trim() ?? '';

        // Helper: open dialog, confirm, wait for it to close before
        // returning. Without the close-wait, the next cardToggle().click()
        // can race with the still-open overlay and silently re-open it.
        const performToggle = async () => {
            await cardToggle().click();
            await expect(page.getByRole('alertdialog')).toBeVisible();
            await confirmDialogAction().click();
            await expect(page.getByRole('alertdialog')).not.toBeVisible({ timeout: 5000 });
        };

        await performToggle();

        if (/^discard$/i.test(initialLabel)) {
            // Discarded → badge appears, card button now reads "Restore".
            await expect(page.getByTestId('discarded-badge')).toBeVisible({ timeout: 5000 });
            await expect(cardToggle()).toHaveText(/^restore$/i, { timeout: 5000 });
            await performToggle();
            await expect(page.getByTestId('discarded-badge')).not.toBeVisible({ timeout: 5000 });
        } else {
            // Restored → badge disappears, card button now reads "Discard".
            await expect(page.getByTestId('discarded-badge')).not.toBeVisible({ timeout: 5000 });
            await expect(cardToggle()).toHaveText(/^discard$/i, { timeout: 5000 });
            await performToggle();
            await expect(page.getByTestId('discarded-badge')).toBeVisible({ timeout: 5000 });
        }
    });
});
