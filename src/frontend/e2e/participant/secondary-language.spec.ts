/**
 * A study in English and Finnish, taken in the language that is not its default.
 *
 * The participant must keep Finnish from the first screen to the last, whichever
 * way the language was chosen, and the sort must stay usable: the failure this
 * guards flipped the content back to English, left the page dimmed under
 * `pointer-events-none`, and "Confirm sort" stopped responding.
 */

import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures/db-setup';
import { testDataBuilders } from '../fixtures/test-data';
import { ConsentPage } from '../pages/ConsentPage';
import { PreSortPage } from '../pages/PreSortPage';
import { placeAllCards } from '../helpers/rough-sort';

const TITLE = { en: 'English study', fi: 'Suomalainen tutkimus' };
const STATEMENT = { en: 'Statement', fi: 'Väittämä' };
const STATEMENT_COUNT = 6;

function translation(language_code: 'en' | 'fi') {
    return {
        language_code,
        title: TITLE[language_code],
        description: `${TITLE[language_code]} description`,
        instructions: `${TITLE[language_code]} instructions`,
        objective: `${TITLE[language_code]} objective`,
        condition_of_instruction: `${TITLE[language_code]} condition`,
        consent_title: `${TITLE[language_code]} consent`,
        consent_description: `${TITLE[language_code]} consent text`,
    };
}

/** Activation wants labels per language; PreSortPage finds the fields by their English ones. */
const bothLanguages = (label: string) => ({ en: label, fi: label }) as unknown as string;

function inBothLanguages<T extends { label: string; options?: unknown[] }>(field: T): T {
    return {
        ...field,
        label: bothLanguages(field.label),
        options: (field.options as string[] | undefined)?.map((value) => ({
            value,
            label: bothLanguages(value),
        })),
    };
}

function bilingualStudy(slug: string) {
    return {
        ...testDataBuilders.study({
            slug,
            state: 'active',
            translations: [translation('en'), translation('fi')],
            statements: Array.from({ length: STATEMENT_COUNT }, (_, i) => ({
                code: `S${i + 1}`,
                translations: [
                    { language_code: 'en', text: `${STATEMENT.en} ${i + 1}` },
                    { language_code: 'fi', text: `${STATEMENT.fi} ${i + 1}` },
                ],
            })),
            grid_config: [
                { score: -1, capacity: 2 },
                { score: 0, capacity: 2 },
                { score: 1, capacity: 2 },
            ],
            presort_config: testDataBuilders.presortConfig({
                age: inBothLanguages(
                    testDataBuilders.presortField('number', 'Age', { required: true })
                ),
                gender: inBothLanguages(
                    testDataBuilders.presortField('select', 'Gender', {
                        required: true,
                        options: ['Male', 'Female'],
                    })
                ),
                education: inBothLanguages(
                    testDataBuilders.presortField('select', 'Education', {
                        required: true,
                        options: ['High School', 'Bachelor'],
                    })
                ),
            }),
        }),
        rough_sort_enabled: false,
    };
}

/** The page is live: not dimmed, and its content is in `lang`. */
async function expectLanguage(page: Page, lang: 'en' | 'fi') {
    await expect(page).toHaveTitle(new RegExp(TITLE[lang]));
    await expect(page.locator('html')).toHaveAttribute('lang', lang);
    await expect(page.locator('#main-scroll-container > div').first()).not.toHaveClass(
        /pointer-events-none/
    );
}

async function expectDeckLanguage(page: Page, lang: 'en' | 'fi') {
    await expect
        .poll(async () =>
            // Hyphenation inserts soft hyphens into displayed statements.
            (await page.getByTestId('deck-cards-container').innerText()).replaceAll('­', '')
        )
        .toContain(STATEMENT[lang]);
}

async function chooseLanguage(page: Page, lang: 'en' | 'fi') {
    await page.getByTestId('layout-header').locator('button:has(svg.lucide-globe)').click();
    await page.getByRole('button', { name: lang, exact: true }).click();
}

async function reachFineSort(page: Page) {
    await page.getByTestId('start-btn').click();
    const consent = new ConsentPage(page);
    await consent.waitForLoad();
    await consent.acceptConsent();
    const presort = new PreSortPage(page);
    await presort.waitForLoad();
    await presort.completePreSort();
    await page.waitForURL(/\/fine-sort(\?|$)/, { timeout: 15000 });
    // The URL commits before the lazy sort chunk does, and until then the page is
    // empty and still in its old language. Assertions must wait for the deck.
    await expect(page.getByTestId('deck-cards-container')).toBeVisible({ timeout: 30000 });
}

async function finishInFinnish(page: Page) {
    await placeAllCards(page);
    const confirmSort = page.getByTestId('fine-sort-validate-btn');
    await expect(confirmSort).toBeEnabled({ timeout: 10000 });
    await confirmSort.click({ timeout: 10000 });

    await page.waitForURL(/\/post-sort(\?|$)/, { timeout: 20000 });
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Miksi nämä valinnat');
    await page.getByTestId('postsort-step1-next-btn').click();
    await page.getByTestId('postsort-submit-btn').click();

    await expect(page.getByTestId('thank-you-message')).toContainText(
        'Kiitos osallistumisestasi!',
        { timeout: 15000 }
    );
    await expectLanguage(page, 'fi');
}

test.describe('A study taken in its second language', () => {
    test.setTimeout(120_000);

    test('a ?lang= link reaches the final screen in Finnish', async ({
        page,
        testDb,
        authToken,
    }) => {
        const slug = `lang-link-${crypto.randomUUID()}`;
        await testDb.createStudy(authToken, bilingualStudy(slug));
        const token = await testDb.createRecruitmentLink(authToken, slug);

        await page.goto(`/study/${slug}/welcome?token=${token}&lang=fi`);
        await expectLanguage(page, 'fi');
        await reachFineSort(page);

        await expectLanguage(page, 'fi');
        await expectDeckLanguage(page, 'fi');
        await finishInFinnish(page);
    });

    test('the header language menu works up to the final screen', async ({
        page,
        testDb,
        authToken,
    }) => {
        const slug = `lang-menu-${crypto.randomUUID()}`;
        await testDb.createStudy(authToken, bilingualStudy(slug));
        const token = await testDb.createRecruitmentLink(authToken, slug);

        await page.goto(`/study/${slug}/welcome?token=${token}`);
        await expectLanguage(page, 'en');
        await chooseLanguage(page, 'fi');
        await expectLanguage(page, 'fi');
        await reachFineSort(page);
        await expectLanguage(page, 'fi');

        // There and back: the second visit to each language is served from the cache.
        await chooseLanguage(page, 'en');
        await expectLanguage(page, 'en');
        await expectDeckLanguage(page, 'en');
        await chooseLanguage(page, 'fi');
        await expectLanguage(page, 'fi');
        await expectDeckLanguage(page, 'fi');

        await finishInFinnish(page);
    });

    test('the header language menu overrides a ?lang= link', async ({
        page,
        testDb,
        authToken,
    }) => {
        const slug = `lang-override-${crypto.randomUUID()}`;
        await testDb.createStudy(authToken, bilingualStudy(slug));

        await page.goto(`/study/${slug}/welcome?lang=en`);
        await expectLanguage(page, 'en');
        await chooseLanguage(page, 'fi');
        await expectLanguage(page, 'fi');
        await reachFineSort(page);

        await page.reload();
        await expectLanguage(page, 'fi');
        await finishInFinnish(page);
    });

    test('a reload mid-session keeps the persisted language', async ({
        page,
        testDb,
        authToken,
    }) => {
        const slug = `lang-reload-${crypto.randomUUID()}`;
        await testDb.createStudy(authToken, bilingualStudy(slug));

        await page.goto(`/study/${slug}/welcome`);
        await chooseLanguage(page, 'fi');
        await expectLanguage(page, 'fi');
        await reachFineSort(page);
        expect(new URL(page.url()).search).toBe('');

        await page.reload();
        await expectLanguage(page, 'fi');
        await expectDeckLanguage(page, 'fi');
        await finishInFinnish(page);
    });

    test('test mode keeps ?mode=test past the disabled rough sort', async ({
        page,
        testDb,
        authToken,
    }) => {
        const slug = `lang-pilot-${crypto.randomUUID()}`;
        await testDb.createStudy(authToken, bilingualStudy(slug));

        await page.goto(`/study/${slug}/welcome?mode=test&lang=fi`);
        await reachFineSort(page);

        expect(new URL(page.url()).searchParams.get('mode')).toBe('test');
    });
});
