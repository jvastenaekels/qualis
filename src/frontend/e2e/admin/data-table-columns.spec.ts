/**
 * E2E: Responses table header/body column parity (Task 1.1)
 *
 * This is the RED/GREEN guard the earlier Vitest-only regression test could
 * not provide: Qualis compiles JSX through the React Compiler
 * (`vite.config.ts` — `babel({ presets: [reactCompilerPreset()] })`), and
 * `npm run dev` (this suite's webServer, see playwright.config.ts) runs the
 * same `vite.config.ts` as `npm run build`. Vitest's config does not apply
 * that babel pass, so a compiler-memoization bug is invisible to it no
 * matter how the component is rendered — only a suite that boots the real
 * dev/build pipeline (this one) can catch a regression here.
 *
 * The bug this guards: with a multilingual study, `showLanguageColumn` adds
 * a `language` column. The React Compiler was auto-memoizing the header
 * row's JSX keyed only on the stable `table` object reference (which never
 * changes across renders — TanStack Table mutates it in place), so the
 * header froze at whatever column set existed on first render while the
 * body kept recomputing — 6 `<th>` for 7 `<td>`, silently misaligning every
 * subsequent column with the wrong label.
 */

import { test, expect } from '../fixtures/db-setup';
import { testDataBuilders } from '../fixtures/test-data';

test.describe('Responses table column parity', () => {
    test('renders one header cell per data cell, with a visible language column, for a multilingual study', async ({
        page,
        testDb,
        authToken,
    }) => {
        // Activation requires every statement to carry a translation in
        // every declared study language, so the default (English-only)
        // statement fixtures need a French translation added too.
        const bilingualStatements = testDataBuilders.statements(23).map((statement) => ({
            ...statement,
            translations: [
                ...statement.translations,
                { language_code: 'fr', text: `${statement.translations[0].text} (FR)` },
            ],
        }));

        const study = (await testDb.createStudy(
            authToken,
            testDataBuilders.study({
                slug: `data-columns-${Date.now()}`,
                state: 'active',
                statements: bilingualStatements,
                translations: [
                    {
                        language_code: 'en',
                        title: 'Column Parity Study',
                        description: 'Test study description',
                        instructions: 'Test instructions',
                        objective: 'Test study objective',
                        condition_of_instruction: 'Condition of instruction',
                        consent_title: 'Informed Consent',
                        consent_description: 'Please read and accept the terms to proceed.',
                    },
                    {
                        language_code: 'fr',
                        title: 'Étude de parité des colonnes',
                        description: 'Description de test',
                        instructions: 'Instructions de test',
                        objective: 'Objectif de test',
                        condition_of_instruction: "Condition de l'instruction",
                        consent_title: 'Consentement éclairé',
                        consent_description: 'Veuillez lire et accepter les conditions.',
                    },
                ],
            })
        )) as { slug: string };

        await testDb.createParticipant(authToken, study.slug, { language_used: 'en' });

        await testDb.loginToAdminUI(page);
        const projectSlug = testDb.getWorkspaceSlug();
        await page.goto(`/app/${projectSlug}/studies/${study.slug}/data`);

        const table = page.locator('table');
        await expect(table).toBeVisible({ timeout: 15000 });
        await expect(table.locator('tbody tr')).toHaveCount(1);

        // The regression: a "Lang" header column that exists in the body
        // (every <td> renders) but never appears in the <thead>.
        await expect(table.getByRole('columnheader', { name: /lang/i })).toBeVisible();

        const headerCount = await table.locator('thead th').count();
        const bodyCellCount = await table.locator('tbody tr').first().locator('td').count();
        expect(headerCount).toBe(bodyCellCount);
    });
});
