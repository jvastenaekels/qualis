import { test, expect } from '../../fixtures/db-setup';
import { AdminPage } from '../../pages/AdminPage';

test.describe('Import/Export Study Configuration', () => {
    let adminPage: AdminPage;

    test.beforeEach(async ({ page }) => {
        adminPage = new AdminPage(page);
    });

    test('export a study config and re-import it via paste-JSON', async ({
        page,
        testDb,
        authToken,
    }) => {
        // 1. Set up a source study via API + minimal UI (login).
        const sourceSlug = `source-${Date.now()}`;
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
            start_date: '2025-01-01T00:00:00Z',
            end_date: '2025-12-31T23:59:59Z',
            translations: [
                {
                    language_code: 'en',
                    title: sourceTitle,
                    description: 'Description preserved',
                    instructions: 'Instructions preserved',
                    condition_of_instruction: 'Condition preserved',
                    consent_title: 'Consent Title',
                    consent_description: 'Consent Description',
                },
            ],
        });

        // 2. Export via the StudyDesign toolbar button.
        // Post-Phase-5D: route is /app/{project}/studies/{slug}/design.
        const projectSlug = testDb.getWorkspaceSlug();
        await page.goto(`/app/${projectSlug}/studies/${sourceSlug}/design`);

        // ExportConfigButton triggers a client-side blob download via
        // window.URL.createObjectURL — Playwright's waitForEvent('download') catches it.
        const downloadPromise = page.waitForEvent('download');
        await page.getByRole('button', { name: /export configuration/i }).click();
        const download = await downloadPromise;
        const exportedJson = JSON.parse(
            await download.createReadStream().then(async (s) => {
                const chunks: Buffer[] = [];
                for await (const chunk of s) chunks.push(chunk as Buffer);
                return Buffer.concat(chunks).toString('utf-8');
            })
        );

        // 3. Verify export content (without asserting on access_password,
        // which is bcrypt-hashed at rest and not a useful round-trip check).
        expect(exportedJson.version).toBe('1.0');
        expect(exportedJson.study.slug).toBe(sourceSlug);
        expect(exportedJson.study.statements).toHaveLength(3);
        expect(exportedJson.study.statements[0].translations[0].text).toBe('Original Statement 1');
        expect(exportedJson.study.start_date).toBe('2025-01-01T00:00:00Z');
        expect(exportedJson.study.end_date).toBe('2025-12-31T23:59:59Z');

        // 4. Open the import dialog from the project dashboard.
        // Phase 5D rename: /admin?dashboard → /app/{project}/dashboard.
        // Dashboard "Import" button label is admin.dashboard.import_study = "Import".
        await page.goto(`/app/${projectSlug}/dashboard`);
        await page
            .getByRole('button', { name: /^import$/i })
            .first()
            .click();

        // ImportStudyDialog renders a Tabs control: "File Upload" | "Paste JSON".
        // Paste-JSON path is simpler and more reliable in CI than the file dropzone.
        await page.getByRole('tab', { name: /paste json/i }).click();
        await page.getByLabel(/paste json configuration/i).fill(JSON.stringify(exportedJson));
        await page.getByRole('button', { name: /validate.*continue/i }).click();

        // 5. Validation step: "Configuration is valid" alert + slug input + Create Study.
        await expect(page.getByText('Configuration is valid')).toBeVisible();

        const newSlug = `imported-${Date.now()}`;
        await page.getByLabel(/new study slug/i).fill(newSlug);
        await page.getByRole('button', { name: /^create study$/i }).click();

        // 6. After creation the dialog closes. Navigate to the new study's
        // design page and confirm the statements made the round-trip.
        await page.goto(`/app/${projectSlug}/studies/${newSlug}/design`);
        await page.getByTestId('tab-q-sort').click();
        await page.getByTestId('subtab-statements').click();
        await expect(page.getByText('Original Statement 1')).toBeVisible();
        await expect(page.getByText('Original Statement 2')).toBeVisible();
        await expect(page.getByText('Original Statement 3')).toBeVisible();
    });
});
