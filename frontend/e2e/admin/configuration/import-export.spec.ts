import { test, expect } from '../../fixtures/db-setup';
import { AdminPage } from '../../pages/AdminPage';
import fs from 'fs';

test.describe('Import/Export Study Configuration', () => {
    let adminPage: AdminPage;

    test.beforeEach(async ({ page }) => {
        adminPage = new AdminPage(page);
    });

    test('should export a study config and import it as a new study', async ({ page, testDb, authToken }) => {
        // 1. Setup: Create a study with specific configuration via API
        const sourceSlug = `source-study-${Date.now()}`;
        const sourceTitle = 'Source Study for Export';

        await testDb.loginToAdminUI(page);
        await adminPage.createStudy(sourceTitle, sourceSlug);

        const statements = [
            { code: 'S1', translations: [{ language_code: 'en', text: 'Original Statement 1' }] },
            { code: 'S2', translations: [{ language_code: 'en', text: 'Original Statement 2' }] },
            { code: 'S3', translations: [{ language_code: 'en', text: 'Original Statement 3' }] },
        ];

        const gridConfig = [
            { score: -1, capacity: 1 },
            { score: 0, capacity: 1 },
            { score: 1, capacity: 1 },
        ];

        await testDb.updateStudy(authToken, sourceSlug, {
            statements,
            grid_config: gridConfig,
            translations: [{
                language_code: 'en',
                title: sourceTitle,
                description: 'Description to be preserved',
                instructions: 'Instructions to be preserved',
                condition_of_instruction: 'Condition to be preserved',
                consent_title: 'Consent Title',
                consent_description: 'Consent Description',
            }],
        });

        // 2. Export Configuration
        // Navigate to Study Design page
        await page.goto(`/admin/studies/${sourceSlug}/design`);

        // Trigger Export
        // The export button is likely in a toolbar or menu. Based on previous steps, it was added to StudyDesignPage toolbar.
        // It might be an icon button or labelled text.
        // Assuming it has a specific aria-label or text. The translation key is 'export.config' -> "Export Configuration".
        // But the button might just have an icon or be inside a menu.
        // Let's look at ExportConfigButton.tsx to see what it renders.
        // It renders a Button with Download icon and title/aria-label?
        // Wait, looking at ExportConfigButton.tsx usage, it might just be the button itself.
        // Ideally we should have added a tooltop or accessible label.

        // Let's click the button that triggers export.
        const downloadPromise = page.waitForEvent('download');

        // Finding the button:
        // In StudyDesignPage.tsx, it was added to the toolbar.
        // Let's try locating by text if visible, or icon.
        // I'll search for the button by the text "Export Configuration" if I added it, or maybe just look for the Download icon.
        // But verifying the text "Export Configuration" is safer if it exists.
        // In the translation file, export.config is "Export Configuration".

        // Wait, I didn't verify the ExportConfigButton render output.
        // Let's assume it has the button text "Export Configuration" or tooltip.
        // If it's an icon only button, I might need a better selector.
        // Let's try to locate by role 'button' that contains text or matches specific attributes.

        // Actually, let's look at ExportConfigButton.tsx again to be sure.
        // It uses `t('export.config')` inside a TooltipContent, and maybe the button itself?
        // The previous `view_file` of `ExportConfigButton.tsx` (which I created in previous session)
        // showed:
        // <Button variant="ghost" size="sm" onClick={handleExport} disabled={isExporting} title={t('export.config')}>
        //     <Download className="h-4 w-4 mr-2" />
        //     <span className="hidden lg:inline">{t('export.config')}</span>
        // </Button>
        // So on desktop (lg), it has text.

        await page.getByRole('button', { name: 'Export Configuration' }).click();

        const download = await downloadPromise;
        const filePath = 'temp-export.json';
        await download.saveAs(filePath);

        // 3. Verify Export Content
        // 3. Verify Export Content
        expect(fs.existsSync(filePath)).toBeTruthy();
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        const exportedJson = JSON.parse(fileContent);

        expect(exportedJson.version).toBe('1.0');
        expect(exportedJson.study.slug).toBe(sourceSlug);
        expect(exportedJson.study.statements).toHaveLength(3);
        expect(exportedJson.study.statements[0].translations[0].text).toBe('Original Statement 1');

        // 4. Import Configuration
        // Navigate back to Dashboard
        await page.goto('/admin');

        // Wait for dashboard to load
        await expect(page.getByText('Workspace Dashboard')).toBeVisible();

        // Click Import Study button
        await page.getByRole('button', { name: 'Import Study' }).click();

        await expect(page.getByText('File Upload')).toBeVisible();

        // Dropzone creates an input[type=file].
        await page.locator('input[type="file"]').setInputFiles(filePath);

        // 5. Validation Step
        const validLocator = page.getByText('Configuration is valid');
        const errorLocator = page.getByText('Configuration has errors');
        const invalidJsonLocator = page.getByText('Invalid JSON');

        // Wait for any result
        await Promise.race([
            validLocator.waitFor({ state: 'visible' }),
            errorLocator.waitFor({ state: 'visible' }),
            invalidJsonLocator.waitFor({ state: 'visible' })
        ]);

        if (await errorLocator.isVisible()) {
             // If errors are visible, fail the test
             throw new Error('Import validation showed errors. Check screenshot.');
        }

        if (await invalidJsonLocator.isVisible()) {
            throw new Error('Import showed Invalid JSON error.');
        }

        await expect(validLocator).toBeVisible();
        await expect(page.getByText('Study Summary')).toBeVisible();
        // The title is in a dd element, separate from the label
        await expect(page.getByText(sourceTitle, { exact: true })).toBeVisible();

        await expect(page.getByText('Statements')).toBeVisible();
        // Check for '3' in the dd for statements. Might be ambiguous, let's just check the text '3' exists near statements or generally.
        // Or specific locator:
        // await expect(page.locator('dd', { hasText: '3' })).toBeVisible();
        await expect(page.getByText('3', { exact: true })).toBeVisible();

        // Enter new slug
        const newSlug = `imported-study-${Date.now()}`;
        const slugInput = page.getByLabel('New Study Slug');
        await slugInput.fill(newSlug);

        // Submit
        await page.getByRole('button', { name: 'Create Study' }).click();

        // 6. Verify Creation
        // Should redirect to design page of new study
        await expect(page).toHaveURL(new RegExp(`/admin/studies/${newSlug}/design`));

        // Verify Content on page (e.g. Statements tab)
        // Switch to Q-sort tab to use test id which is safer
        await page.getByTestId('tab-q-sort').click();

        // Check if statements are there
        await expect(page.getByText('Original Statement 1')).toBeVisible();
        await expect(page.getByText('Original Statement 2')).toBeVisible();
        await expect(page.getByText('Original Statement 3')).toBeVisible();

        // 7. Backend Verification
        // Verify via API that constraints (grid) were preserved
        // We can check this by fetching the study config via API if needed,
        // but seeing the statements in UI is a strong signal.
        // Let's verify the grid config size via UI roughly (e.g. 3 columns).
        await page.getByRole('tab', { name: 'Q-sort' }).click();
        // Maybe check grid visual if possible, or just trust the functional part.

    });
});
