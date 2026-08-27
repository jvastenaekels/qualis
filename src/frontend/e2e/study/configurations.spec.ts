import { test, expect } from '../fixtures/db-setup';
import { testDataBuilders } from '../fixtures/test-data';
import { RoughSortPage } from '../pages/RoughSortPage';

test.describe('Study Configurations', () => {
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
});
