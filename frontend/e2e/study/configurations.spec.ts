import { test, expect } from '../fixtures/db-setup';
import { testDataBuilders } from '../fixtures/test-data';
import { RoughSortPage } from '../pages/RoughSortPage';
import { PostSortPage } from '../pages/PostSortPage';

test.describe('Study Configurations', () => {
    // --- PRESORT CONFIGURATIONS ---

    test('Study with no presort steps should skip presort page', async ({ page, studyNav }) => {
        await studyNav.navigateToStep('rough-sort', {
            presort_config: { enabled: false, fields: {} },
        });

        const roughSortPage = new RoughSortPage(page);
        await roughSortPage.waitForLoad();
    });

    test('Study with mandatory presort fields should require input', async ({
        page,
        studyNav,
    }) => {
        await studyNav.navigateToStep('presort', {
            presort_config: testDataBuilders.presortConfig({
                age: testDataBuilders.presortField('number', 'Age', { required: true }),
                gender: testDataBuilders.presortField('select', 'Gender', {
                    required: true,
                    options: ['Male', 'Female', 'Other'],
                }),
                education: testDataBuilders.presortField('select', 'Education', {
                    required: true,
                    options: ['Context High School', 'Bachelor', 'Master', 'PhD'],
                }),
            }),
        });

        // Verify Submit is Disabled initially (Validation)
        const submitBtn = page.getByTestId('presort-submit-btn');
        await expect(submitBtn).toBeDisabled();

        // Fill Fields
        await page.getByLabel('Age').fill('25');
        await page.getByLabel('Age').blur();
        await page.getByLabel('Gender').selectOption({ label: 'Female' });
        await page.getByLabel('Education').selectOption({ label: 'Bachelor' });
        await page.getByLabel('Education').blur();

        // Click Submit (Button should now be enabled)
        await expect(submitBtn).toBeEnabled({ timeout: 10000 });
        await submitBtn.click();

        // Verify navigation to Rough Sort
        const roughSortPage = new RoughSortPage(page);
        await roughSortPage.waitForLoad();
    });

    // --- Q-SORT CONFIGURATIONS ---

    test('Study with Asymmetric Grid should render correctly', async ({ page, studyNav }) => {
        const subGrid = [
            { score: -3, capacity: 1 },
            { score: -2, capacity: 2 },
            { score: -1, capacity: 3 },
            { score: 0, capacity: 6 },
            { score: 1, capacity: 4 },
            { score: 2, capacity: 3 },
            { score: 3, capacity: 2 },
        ];
        // Total = 1+2+3+6+4+3+2 = 21
        const totalCards = 21;

        await studyNav.navigateToStep('fine-sort', {
            grid_config: subGrid,
            statements: testDataBuilders.statements(totalCards),
            presort_config: { enabled: false, fields: {} },
        });

        // Check columns capacity using ID selector
        await expect(page.locator('#column--3 [role="gridcell"]')).toHaveCount(1);
        await expect(page.locator('#column-0 [role="gridcell"]')).toHaveCount(6);
    });

    // --- POST-SORT CONFIGURATIONS ---

    test('Study with email collection should show email input', async ({ page, studyNav }) => {
        await studyNav.navigateToStep('post-sort', {
            grid_config: [{ score: 0, capacity: 3 }],
            statements: testDataBuilders.statements(3),
            presort_config: { enabled: false, fields: {} },
            postsort_config: {
                email_collection_enabled: true,
                interview_consent_enabled: false,
            },
        });

        const postSort = new PostSortPage(page);
        await postSort.waitForLoad();

        // Navigate to Step 2 if needed
        const continueBtn = page.getByRole('button', { name: /Continue|Next/i });
        if (await continueBtn.isVisible()) {
            await continueBtn.click();
        }

        await expect(page.getByLabel('Email', { exact: false })).toBeVisible();
    });

    test('Study with interview consent should show checkboxes', async ({ page, studyNav }) => {
        await studyNav.navigateToStep('post-sort', {
            grid_config: [{ score: 0, capacity: 3 }],
            statements: testDataBuilders.statements(3),
            presort_config: { enabled: false, fields: {} },
            postsort_config: {
                email_collection_enabled: false,
                interview_consent_enabled: true,
            },
        });

        const postSort = new PostSortPage(page);
        await postSort.waitForLoad();

        // Navigate to Step 2 if needed
        const continueBtn = page.getByRole('button', { name: /Continue|Next/i });
        if (await continueBtn.isVisible()) {
            await continueBtn.click();
        }

        await expect(page.getByText('contacted', { exact: false })).toBeVisible();
    });
});
