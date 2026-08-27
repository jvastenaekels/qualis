import { test, expect } from '../fixtures/db-setup';

/**
 * i18n namespace split smoke tests (PR #158)
 *
 * Verifies that both the participant namespace (defaultNS='participant') and
 * the admin namespace (fallbackNS='admin') resolve correctly in a non-English
 * locale.  Without this test a misconfigured namespace chain would silently
 * pass CI but break fr/fi/de users in production.
 *
 * Locale is forced via the `?lang=fr` querystring, which i18next's
 * LanguageDetector picks up via `lookupQuerystring: 'lang'`.
 */

test.describe('i18n namespace resolution in French', () => {
    /**
     * Test 1: participant namespace renders in French (no auth required).
     *
     * Navigates to the landing page (/) which uses `landing.*` keys from
     * participant.json.  Asserts on `landing.instruction` which is:
     *   "Entrez le code de votre étude pour commencer."
     * — a sentence that is unambiguously French and stable.
     */
    test('participant namespace resolves on landing page with ?lang=fr', async ({ page }) => {
        await page.goto('/?lang=fr');

        // landing.instruction — participant.json
        await expect(
            page.getByText('Entrez le code de votre étude pour commencer.')
        ).toBeVisible({ timeout: 10000 });
    });

    /**
     * Test 2: admin namespace resolves via fallbackNS in French (requires auth).
     *
     * Logs in as admin and navigates to the dashboard.  Asserts on the
     * `admin.sidebar.dashboard` key ("Tableau de bord") from admin.json,
     * which is rendered in the sidebar on every admin page.  This proves the
     * defaultNS='participant' → fallbackNS='admin' resolver chain works.
     */
    test('admin namespace resolves on dashboard via fallbackNS with ?lang=fr', async ({
        page,
        testDb,
    }) => {
        await testDb.loginToAdminUI(page);

        const slug = testDb.getWorkspaceSlug();
        await page.goto(`/app/${slug}/dashboard?lang=fr`);

        // admin.sidebar.dashboard — admin.json (resolved via fallbackNS)
        await expect(page.getByText('Tableau de bord').first()).toBeVisible({ timeout: 10000 });
    });
});
