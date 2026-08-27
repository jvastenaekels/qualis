/**
 * E2E: Recruitment link creation and funnel dashboard
 *
 * Quality roadmap Phase 4 item C — spec 3/4.
 * Tests the recruitment dashboard loop:
 *   - Admin creates a public link via the UI
 *   - Link appears in the recruitment table with correct type and active state
 *   - The "no links yet" empty state disappears
 *
 * Feature-gap note (counter increment):
 *   `usage_count` and `start_count` are only incremented when a participant
 *   uses the link token. The `testDb.createParticipant` helper submits without
 *   a token, so it does not bump the counter for any specific link. A proper
 *   counter-increment test would require either:
 *     (a) passing a `link_token` to the submit API — testDb would need updating, or
 *     (b) navigating a second browser context through the full participant UI with
 *         the token in the query string (adds ~3 min to the test).
 *   Both options are tracked as follow-up work. This spec validates the UI
 *   creation and display flow which are independently valuable.
 */

import { test, expect } from '../fixtures/db-setup';
import { testDataBuilders, gridConfig23 } from '../fixtures/test-data';

test.setTimeout(120_000);

test.describe('Recruitment funnel', () => {
    test('admin creates a public access link; it appears in the recruitment dashboard', async ({
        page,
        testDb,
        authToken,
    }) => {
        const workspaceSlug = testDb.getWorkspaceSlug();

        // ------------------------------------------------------------------ //
        // 1. Seed: active study                                                //
        // ------------------------------------------------------------------ //
        const study = (await testDb.createStudy(
            authToken,
            testDataBuilders.study({
                slug: `recruit-funnel-${Date.now()}`,
                statements: testDataBuilders.statements(23),
                grid_config: gridConfig23,
                state: 'active',
            })
        )) as { slug: string };
        const studySlug = study.slug;

        // ------------------------------------------------------------------ //
        // 2. Login and navigate to the recruitment page                        //
        // ------------------------------------------------------------------ //
        await testDb.loginToAdminUI(page);
        await page.goto(`/app/${workspaceSlug}/studies/${studySlug}/recruitment`);
        await expect(page).toHaveURL(/recruitment/, { timeout: 15_000 });

        // Verify the empty state is shown initially
        await expect(page.getByText(/no access links yet/i)).toBeVisible({ timeout: 10_000 });

        // ------------------------------------------------------------------ //
        // 3. Create a public recruitment link via the UI                       //
        // ------------------------------------------------------------------ //
        const newLinkButton = page.getByRole('button', { name: /new access link/i });
        await expect(newLinkButton).toBeVisible({ timeout: 10_000 });
        await newLinkButton.click();

        // The creation dialog opens
        const dialogTitle = page.getByRole('heading', { name: /create access links/i });
        await expect(dialogTitle).toBeVisible({ timeout: 10_000 });

        // "Open access (public)" is selected by default — name the campaign
        // Label text from en.json key admin.recruitment.campaign_name:
        // "Channel / campaign name"
        const nameInput = page.getByLabel(/channel.*campaign name/i);
        await nameInput.fill('E2E funnel test');

        // en.json key admin.recruitment.generate_links = "Provision links"
        const generateButton = page.getByRole('button', { name: /provision links/i });
        await expect(generateButton).toBeEnabled({ timeout: 5_000 });
        await generateButton.click();

        // Wait for the dialog to close
        await expect(dialogTitle).not.toBeVisible({ timeout: 10_000 });

        // ------------------------------------------------------------------ //
        // 4. Verify the new link appears in the recruitment table              //
        // ------------------------------------------------------------------ //
        // The RR7 revalidator calls revalidate() on success, which re-runs the
        // loader. In the Playwright test environment the revalidation sometimes
        // doesn't flush to the DOM within the assertion window, so we trigger a
        // hard reload to guarantee the updated loader data is rendered.
        await page.reload();
        await expect(page).toHaveURL(/recruitment/, { timeout: 10_000 });

        const linkRow = page.locator('tr').filter({ hasText: 'E2E funnel test' });
        await expect(linkRow).toBeVisible({ timeout: 15_000 });

        // Verify the link type is "Public" (Open access)
        // en.json key admin.recruitment.status.public = "Public"
        await expect(linkRow.getByText(/public/i)).toBeVisible({ timeout: 5_000 });

        // Verify the link is Active
        // en.json key admin.status.active = "Active" (or similar)
        await expect(linkRow.getByText(/active/i)).toBeVisible({ timeout: 5_000 });

        // Verify the link has a link token displayed (non-empty <code> element)
        const tokenCell = linkRow.locator('code');
        await expect(tokenCell).toBeVisible({ timeout: 5_000 });
        const tokenText = await tokenCell.textContent();
        expect(tokenText).toBeTruthy();
        expect(tokenText?.length).toBeGreaterThan(4);

        // The "no access links yet" empty state should be gone
        await expect(page.getByText(/no access links yet/i)).not.toBeVisible();

        // ------------------------------------------------------------------ //
        // 5. Verify the public study URL is live for this link                 //
        // ------------------------------------------------------------------ //
        // The recruitment page shows a full URL like /study/{slug}
        await expect(page.getByText(new RegExp(`/study/${studySlug}`))).toBeVisible({
            timeout: 5_000,
        });
    });
});
