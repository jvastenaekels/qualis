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
import { testDataBuilders, type StudyData } from '../fixtures/test-data';
import { ConsentPage } from '../pages/ConsentPage';
import { PreSortPage } from '../pages/PreSortPage';
import { placeAllCards } from '../helpers/rough-sort';

const TITLE = { en: 'English study', fi: 'Suomalainen tutkimus' };
const STATEMENT = { en: 'Statement', fi: 'Väittämä' };
const STATEMENT_COUNT = 6;
const LAST_SCREEN = {
    en: { why: 'Why these choices', thanks: 'Thank you for your participation!' },
    fi: { why: 'Miksi nämä valinnat', thanks: 'Kiitos osallistumisestasi!' },
};
const QUESTION = { en: 'Work arrangement', fi: 'Työjärjestely' };
const OPTIONS = {
    en: ['Fully remote', 'Hybrid', 'Fully in-office', 'Freelance', 'Between jobs'],
    fi: ['Täysin etänä', 'Hybridi', 'Täysin toimistolla', 'Freelancer', 'Työnhaussa'],
};

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

function bilingualStudy(slug: string, overrides: Partial<StudyData> = {}) {
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
            ...overrides,
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
        .poll(
            async () =>
                // Hyphenation inserts soft hyphens into displayed statements.
                (await page.getByTestId('deck-cards-container').innerText()).replaceAll('­', ''),
            { timeout: 30000 }
        )
        .toContain(STATEMENT[lang]);
}

async function chooseLanguage(page: Page, lang: 'en' | 'fi') {
    await page.getByTestId('layout-header').locator('button:has(svg.lucide-globe)').click();
    await page.getByRole('button', { name: lang, exact: true }).click();
}

async function reachFineSort(page: Page, answerPresort?: (presort: PreSortPage) => Promise<void>) {
    await page.getByTestId('start-btn').click();
    const consent = new ConsentPage(page);
    await consent.waitForLoad();
    await consent.acceptConsent();
    const presort = new PreSortPage(page);
    await presort.waitForLoad();
    await (answerPresort ? answerPresort(presort) : presort.completePreSort());
    await page.waitForURL(/\/fine-sort(\?|$)/, { timeout: 15000 });
    // The URL commits before the lazy sort chunk does, and until then the page is
    // empty and still in its old language. Assertions must wait for the deck.
    await expect(page.getByTestId('deck-cards-container')).toBeVisible({ timeout: 30000 });
}

async function finishIn(page: Page, lang: 'en' | 'fi') {
    await placeAllCards(page);
    const confirmSort = page.getByTestId('fine-sort-validate-btn');
    await expect(confirmSort).toBeEnabled({ timeout: 10000 });
    await confirmSort.click({ timeout: 10000 });

    await page.waitForURL(/\/post-sort(\?|$)/, { timeout: 20000 });
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(LAST_SCREEN[lang].why);
    await page.getByTestId('postsort-step1-next-btn').click();
    await page.getByTestId('postsort-submit-btn').click();

    await expect(page.getByTestId('thank-you-message')).toContainText(LAST_SCREEN[lang].thanks, {
        timeout: 15000,
    });
    await expectLanguage(page, lang);
}

/** Fill the open question card in `lang`, then wait for the save to land. */
async function writeQuestion(page: Page, lang: 'en' | 'fi') {
    await page.getByRole('textbox', { name: 'Question label' }).fill(QUESTION[lang]);
    for (const [i, option] of OPTIONS[lang].entries()) {
        await page.getByRole('textbox', { name: `Option ${i + 1}`, exact: true }).fill(option);
    }
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Saved', exact: true })).toBeVisible();
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
        await finishIn(page, 'fi');
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

        await finishIn(page, 'fi');
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
        await finishIn(page, 'fi');
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
        await finishIn(page, 'fi');
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

test.describe('The whole path, from the designer to the export', () => {
    test.setTimeout(300_000);

    test('five options added in the designer export as five answers, whatever the browser language', async ({
        page,
        browser,
        testDb,
        authToken,
    }) => {
        const slug = `lang-export-${crypto.randomUUID()}`;
        await testDb.createStudy(
            authToken,
            bilingualStudy(slug, {
                state: 'draft',
                presort_config: testDataBuilders.presortConfig({}),
            })
        );

        await testDb.loginToAdminUI(page);
        await page.goto(`/app/${testDb.getWorkspaceSlug()}/studies/${slug}/design`);
        // A cold Vite compile of the designer chunk outlasts the default action timeout.
        await page.getByTestId('tab-pre-sort').click({ timeout: 90_000 });
        await page.getByTestId('add-question-select').click();
        await page.getByTestId('question-accordion-trigger').click();
        for (const number of [3, 4, 5]) {
            await page.getByRole('button', { name: 'Add option' }).click();
            await expect(
                page.getByRole('textbox', { name: `Option ${number}`, exact: true })
            ).toBeVisible();
        }
        await writeQuestion(page, 'en');
        await page.getByTestId('language-switcher').click();
        await page.getByRole('menuitem', { name: 'FI', exact: true }).click();
        await writeQuestion(page, 'fi');

        const { presort_config } = await testDb.getStudy(authToken, slug);
        const [[questionKey, question]] = Object.entries(presort_config.fields) as [
            string,
            { options: { value: string }[] },
        ][];
        const values = question.options.map((o) => o.value);
        expect(new Set(values).size).toBe(5);
        expect(values.every((v) => /^opt_/.test(v))).toBe(true);

        await testDb.activateStudy(authToken, slug);
        const token = await testDb.createRecruitmentLink(authToken, slug);

        // Options 4 and 5 came from "Add option", whose values used to collide.
        const sorts = [
            { locale: 'fi-FI', lang: 'fi', option: 3 },
            { locale: 'en-US', lang: 'en', option: 4 },
        ] as const;

        for (const { locale, lang, option } of sorts) {
            const context = await browser.newContext({ locale });
            const participant = await context.newPage();
            await participant.goto(`/study/${slug}?token=${token}`);
            await expectLanguage(participant, lang);
            await reachFineSort(participant, async (presort) => {
                await participant
                    .getByLabel(QUESTION[lang])
                    .selectOption({ label: OPTIONS[lang][option] });
                await presort.submit();
            });
            await expectDeckLanguage(participant, lang);
            await finishIn(participant, lang);
            await context.close();
        }

        // A CSV row holds one answer: the other three values need rows of their own.
        for (const value of values.slice(0, 3)) {
            await testDb.createParticipant(authToken, slug, {
                presort_answers: { [questionKey]: value },
            });
        }

        const csv = await testDb.exportCsv(authToken, slug);
        await test.info().attach('export.csv', { body: csv, contentType: 'text/csv' });
        // Labels come out in the study's default language, whatever the participant read.
        const rowsAnswering = (option: number) =>
            csv.split('\r\n').filter((row) => row.includes(`,${OPTIONS.en[option]},`));
        for (const option of OPTIONS.en.keys()) {
            expect(rowsAnswering(option)).toHaveLength(1);
        }
        for (const { lang, option } of sorts) {
            expect(rowsAnswering(option)[0]).toContain(`,${lang},completed,`);
        }
    });
});
