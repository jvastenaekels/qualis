/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { test, expect } from '../fixtures/db-setup';
import { testDataBuilders } from '../fixtures/test-data';

/**
 * E2E happy path for memo collaboration — Phase 4 / T21.
 *
 * Coverage: create entry from template → expand comment thread → post comment → resolve.
 *
 * Out of scope (noted here, not tested):
 *   - Multi-user @-mention scenario (requires two browser contexts + two seeded roles).
 *   - File-download assertion for the export modal (headless-Chromium download is flaky).
 *   - Unread badge (requires a second login to see the badge from a prior comment).
 */
test.describe('Memo collaboration (Real Backend)', () => {
    test('researcher → insert template entry → comment → resolve', async ({
        page,
        testDb,
        authToken,
    }) => {
        // ── 1. Login and create a study via API ──────────────────────────────
        await testDb.loginToAdminUI(page);
        const slug = `memo-e2e-${Date.now()}`;
        await testDb.createStudy(
            authToken,
            testDataBuilders.study({ slug, title: 'Memo E2E' })
        );

        // ── 2. Navigate to the study design page (intro tab is the default) ──
        const projectSlug = testDb.getWorkspaceSlug();
        await page.goto(`/app/${projectSlug}/studies/${slug}/design`);

        // Wait for the page to finish loading (the tab strip becomes visible)
        await expect(page.getByTestId('tab-intro')).toBeVisible();

        // ── 3. Expand the Methodology memo accordion ─────────────────────────
        // The accordion trigger contains the text "Methodology memo"
        // (i18n key: admin.memo.title_study).  Use a text-based locator so
        // it survives minor label wording changes and works in all locales.
        await page
            .getByRole('button', { name: /Methodology memo|Mémo méthodologique/i })
            .click();

        // ── 4. Insert from template → "Distribution rationale" ───────────────
        await page.getByRole('button', { name: /Insert from template/i }).click();
        await page.getByText('Distribution rationale').click();

        // ── 5. Verify the new entry appeared ─────────────────────────────────
        await expect(page.getByRole('heading', { name: 'Distribution rationale' })).toBeVisible();

        // ── 6. Expand the comment thread on the new entry ────────────────────
        // The thread toggle shows "0 comments" initially.
        await page
            .getByRole('button', { name: /0 comment/i })
            .click();

        // ── 7. Post a comment ────────────────────────────────────────────────
        const commentText = 'e2e test comment';
        await page
            .getByPlaceholder(/Write a comment/i)
            .fill(commentText);
        await page.getByRole('button', { name: /^Post$/i }).click();

        // Comment body must be visible in the thread
        await expect(page.getByText(commentText)).toBeVisible();

        // ── 8. Resolve the comment ───────────────────────────────────────────
        // The "Resolve" control is a plain <button type="button"> inside the
        // comment row. Use exact:true to avoid accidentally clicking the
        // "Show resolved (0)" toggle which also contains the word "resolved".
        await page.getByText('Resolve', { exact: true }).first().click();

        // After resolving, the comment is hidden (showResolved defaults to false).
        // The toggle button text flips to "Show resolved (1)".
        // Use a locator that auto-waits until the state update propagates.
        const showResolvedBtn = page.getByRole('button', { name: /Show resolved/i });
        await expect(showResolvedBtn).toBeVisible();

        // Click the toggle to reveal resolved comments.
        await showResolvedBtn.click();

        // The resolved comment now renders with the "Unresolve" control.
        await expect(page.getByText('Unresolve', { exact: true })).toBeVisible();
    });
});
