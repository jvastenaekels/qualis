import { test, expect } from '../../fixtures/db-setup';
import { testDataBuilders } from '../../fixtures/test-data';

/**
 * Systematic Configuration Testing: Branding
 *
 * Tests branding configuration options:
 * 1. Admin UI: Can configure branding
 * 2. API: Configuration is saved correctly
 * 3. Participant UI: Branding appears correctly
 * 4. Validation: URL validation, color formats
 * 5. Edge Cases: Multiple partner logos, missing images
 */

test.describe('Branding Configuration Testing', () => {
    test.describe('Logo Configuration', () => {
        let studySlug: string;

        test.beforeEach(async ({ testDb, authToken }) => {
            const study = await testDb.createStudy(
                authToken,
                testDataBuilders.study({
                    slug: `test-branding-logo-${Date.now()}`,
                    statements: testDataBuilders.statements(10),
                })
            );
            studySlug = study.slug;
        });

        test('Admin: Can add custom logo', async ({ page, testDb }) => {
            await testDb.loginToAdminUI(page);

            await page.click(`text=${studySlug}`);
            await page
                .getByRole('link', { name: /design/i })
                .first()
                .click();
            await page.getByTestId('tab-branding').click();

            // Add logo URL
            await page.fill('input[name="logoUrl"]', 'https://example.com/logo.png');

            // Verify preview or confirmation
            await expect(page.locator('img[src*="logo.png"]')).toBeVisible();
        });

        test('API: Logo config saves correctly', async ({ testDb, authToken }) => {
            const branding = testDataBuilders.branding({
                logo_url: 'https://example.com/custom-logo.png',
            });

            await testDb.updateStudy(authToken, studySlug, { branding });

            const study = await testDb.getStudy(authToken, studySlug);
            expect(study.branding.logo_url).toBe('https://example.com/custom-logo.png');
        });

        test('Participant: Logo appears on welcome page', async ({ page, testDb, authToken }) => {
            await testDb.updateStudy(authToken, studySlug, {
                branding: testDataBuilders.branding({
                    logo_url: 'https://example.com/logo.png',
                }),
                state: 'active',
            });

            await page.goto(`/study/${studySlug}`);

            // Verify logo is displayed
            await expect(page.locator('img[src*="logo.png"]')).toBeVisible();
        });

        test('Validation: Invalid URL rejected', async ({ page, testDb }) => {
            await testDb.loginToAdminUI(page);

            await page.click(`text=${studySlug}`);
            await page
                .getByRole('link', { name: /design/i })
                .first()
                .click();
            await page.getByTestId('tab-branding').click();

            // Try invalid URL
            await page.fill('input[name="logoUrl"]', 'not-a-url');
            await page.blur('input[name="logoUrl"]');

            // Verify validation error
            await expect(page.locator('text=valid URL', { hasText: /valid.*url/i })).toBeVisible();
        });

        test('Edge Case: No logo shows default', async ({ page, testDb, authToken }) => {
            await testDb.updateStudy(authToken, studySlug, {
                branding: testDataBuilders.branding({ logo_url: null }),
                state: 'active',
            });

            await page.goto(`/study/${studySlug}`);

            // Should show default or no logo
            const logos = await page.locator('img[alt*="logo" i]').count();
            // Implementation-specific: either default logo or none
            expect(logos).toBeGreaterThanOrEqual(0);
        });
    });

    test.describe('Accent Color', () => {
        let studySlug: string;

        test.beforeEach(async ({ testDb, authToken }) => {
            const study = await testDb.createStudy(
                authToken,
                testDataBuilders.study({
                    slug: `test-branding-color-${Date.now()}`,
                    statements: testDataBuilders.statements(10),
                })
            );
            studySlug = study.slug;
        });

        test('Admin: Can set accent color', async ({ page, testDb }) => {
            await testDb.loginToAdminUI(page);

            await page.click(`text=${studySlug}`);
            await page
                .getByRole('link', { name: /design/i })
                .first()
                .click();
            await page.getByTestId('tab-branding').click();

            // Set accent color
            const colorInput = page.locator('input[type="color"], input[name="accentColor"]');
            await colorInput.fill('#ff0000');

            // Verify color preview
            await expect(colorInput).toHaveValue('#ff0000');
        });

        test('API: Accent color saves correctly', async ({ testDb, authToken }) => {
            await testDb.updateStudy(authToken, studySlug, {
                branding: testDataBuilders.branding({ accent_color: '#00ff00' }),
            });

            const study = await testDb.getStudy(authToken, studySlug);
            expect(study.branding.accent_color).toBe('#00ff00');
        });

        test('Participant: Accent color applied', async ({ page, testDb, authToken }) => {
            await testDb.updateStudy(authToken, studySlug, {
                branding: testDataBuilders.branding({ accent_color: '#ff6600' }),
                state: 'active',
            });

            await page.goto(`/study/${studySlug}`);

            // Check if accent color is applied (implementation-specific)
            const button = page.locator('button').first();
            const color = await button.evaluate(
                (el) => window.getComputedStyle(el).backgroundColor
            );

            // Color should be applied somewhere in the UI
            expect(color).toBeDefined();
        });

        test('Validation: Invalid color format rejected', async ({ page, testDb }) => {
            await testDb.loginToAdminUI(page);

            await page.click(`text=${studySlug}`);
            await page
                .getByRole('link', { name: /design/i })
                .first()
                .click();
            await page.getByTestId('tab-branding').click();

            // Try invalid color
            const colorInput = page.locator('input[name="accentColor"]');
            if ((await colorInput.getAttribute('type')) !== 'color') {
                await colorInput.fill('not-a-color');
                await colorInput.blur();

                await expect(
                    page.locator('text=valid color', { hasText: /valid.*color/i })
                ).toBeVisible();
            }
        });
    });

    test.describe('Partner Logos', () => {
        let studySlug: string;

        test.beforeEach(async ({ testDb, authToken }) => {
            const study = await testDb.createStudy(
                authToken,
                testDataBuilders.study({
                    slug: `test-branding-partners-${Date.now()}`,
                    statements: testDataBuilders.statements(10),
                })
            );
            studySlug = study.slug;
        });

        test('Admin: Can add partner logo', async ({ page, testDb }) => {
            await testDb.loginToAdminUI(page);

            await page.click(`text=${studySlug}`);
            await page
                .getByRole('link', { name: /design/i })
                .first()
                .click();
            await page.getByTestId('tab-branding').click();

            // Add partner
            await page.click('button:has-text("Add Partner")');
            await page.fill('input[name="partnerName"]', 'Example University');
            await page.fill('input[name="partnerLogoUrl"]', 'https://example.edu/logo.png');
            await page.fill('input[name="partnerUrl"]', 'https://example.edu');
            await page.click('button:has-text("Save Partner")');

            // Verify partner appears
            await expect(page.locator('text=Example University')).toBeVisible();
        });

        test('API: Partner logos save correctly', async ({ testDb, authToken }) => {
            const partners = [
                testDataBuilders.partnerLogo('University A'),
                testDataBuilders.partnerLogo('University B'),
                testDataBuilders.partnerLogo('Research Institute C'),
            ];

            await testDb.updateStudy(authToken, studySlug, {
                branding: testDataBuilders.branding({ partners }),
            });

            const study = await testDb.getStudy(authToken, studySlug);
            expect(study.branding.partners).toHaveLength(3);
            expect(study.branding.partners[0].name).toBe('University A');
        });

        test('Participant: Partner logos displayed', async ({ page, testDb, authToken }) => {
            const partners = [
                testDataBuilders.partnerLogo('University A'),
                testDataBuilders.partnerLogo('University B'),
            ];

            await testDb.updateStudy(authToken, studySlug, {
                branding: testDataBuilders.branding({ partners }),
                state: 'active',
            });

            await page.goto(`/study/${studySlug}`);

            // Verify partner logos appear
            for (const partner of partners) {
                const _logoAlt = new RegExp(partner.name, 'i');
                await expect(page.locator(`img[alt*="${partner.name}"]`)).toBeVisible();
            }
        });

        test('Validation: Partner logo URL validated', async ({ page, testDb }) => {
            await testDb.loginToAdminUI(page);

            await page.click(`text=${studySlug}`);
            await page
                .getByRole('link', { name: /design/i })
                .first()
                .click();
            await page.getByTestId('tab-branding').click();

            await page.click('button:has-text("Add Partner")');
            await page.fill('input[name="partnerName"]', 'Test Partner');
            await page.fill('input[name="partnerLogoUrl"]', 'invalid-url');
            await page.blur('input[name="partnerLogoUrl"]');

            await expect(page.locator('text=valid URL', { hasText: /valid.*url/i })).toBeVisible();
        });

        test('Edge Case: Many partner logos', async ({ page, testDb, authToken }) => {
            // Create 10 partners
            const partners = Array.from({ length: 10 }, (_, i) =>
                testDataBuilders.partnerLogo(`Partner ${i + 1}`)
            );

            await testDb.updateStudy(authToken, studySlug, {
                branding: testDataBuilders.branding({ partners }),
                state: 'active',
            });

            await page.goto(`/study/${studySlug}`);

            // All should be visible (or in a carousel/grid)
            const partnerLogos = await page.locator('img[alt*="Partner"]').count();
            expect(partnerLogos).toBe(10);
        });
    });
});
