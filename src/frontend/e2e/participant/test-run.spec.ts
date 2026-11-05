/**
 * Test run, driven the way a researcher drives it: the designer button, on an active
 * study, in its second language.
 *
 * The protection lives in the browser alone: `/submit` creates a row for any unknown
 * token. So this watches the wire and the participant table, through a reload at each
 * step, and ends on the one exit, which must give a real session with nothing left over.
 */

import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures/db-setup';
import { bilingualStudy, expectLanguage } from '../helpers/bilingual-study';
import { countPlacedCards, placeAllCards, placeNCards } from '../helpers/rough-sort';
import { ConsentPage } from '../pages/ConsentPage';
import { PreSortPage } from '../pages/PreSortPage';

// The tab runs in Finnish, so its chrome is matched in Finnish.
const FI = {
    banner: 'Testitila: mitään ei tallenneta',
    leave: 'Poistu testistä',
    backToSort: 'Takaisin lajitteluun',
    why: 'Miksi nämä valinnat',
    thanks: 'Kiitos osallistumisestasi!',
    nothingStored: 'Tämä oli testi. Mitään ei tallennettu.',
};
const COMMENT = 'Tämä kortti ratkaisi asian.';
const STATEMENT_TOTAL = 6;

async function expectTest(tab: Page) {
    await expect(tab.getByText(FI.banner)).toBeVisible({ timeout: 30000 });
    await expectLanguage(tab, 'fi');
    expect(new URL(tab.url()).searchParams.get('mode')).toBe('test');
}

async function reloadTest(tab: Page) {
    await tab.reload();
    await expectTest(tab);
}

async function confirmSort(tab: Page) {
    const confirm = tab.getByTestId('fine-sort-validate-btn');
    await expect(confirm).toBeEnabled({ timeout: 10000 });
    await confirm.click();
    await tab.waitForURL(/\/post-sort(\?|$)/, { timeout: 20000 });
    await expect(tab.getByRole('heading', { level: 1 })).toHaveText(FI.why);
}

test.describe('Test run from the designer', () => {
    test.setTimeout(300_000);

    test('a whole test of an active study stores nothing, and its exit is a clean real session', async ({
        page,
        context,
        testDb,
        authToken,
    }) => {
        const slug = `test-run-${crypto.randomUUID()}`;
        await testDb.createStudy(
            authToken,
            bilingualStudy(slug, {
                // The default [-4, 4] lies outside this grid, and would leave nothing to comment.
                postsort_config: { questions: {}, extreme_columns: [-1, 1] },
            })
        );
        const token = await testDb.createRecruitmentLink(authToken, slug);

        // On the context, not the tab: the tab's first load must not slip past the listener.
        const writes: string[] = [];
        context.on('request', (request) => {
            const { pathname } = new URL(request.url());
            if (request.method() !== 'GET' && /^\/api\/(study|audio)\//.test(pathname)) {
                writes.push(`${request.method()} ${pathname}`);
            }
        });

        await testDb.loginToAdminUI(page);
        await page.goto(`/app/${testDb.getWorkspaceSlug()}/studies/${slug}/design`);
        // A cold Vite compile of the designer chunk outlasts the default action timeout.
        await page.getByRole('button', { name: 'View read-only' }).click({ timeout: 90_000 });
        await page.getByTestId('language-switcher').click();
        await page.getByRole('menuitem', { name: 'FI', exact: true }).click();
        const [tab] = await Promise.all([
            page.waitForEvent('popup'),
            page.getByRole('button', { name: 'Test run', exact: true }).click(),
        ]);

        await expect(tab.getByTestId('start-btn')).toBeVisible({ timeout: 60000 });
        await expectTest(tab);
        expect(new URL(tab.url()).searchParams.get('lang')).toBe('fi');
        await reloadTest(tab);

        await tab.getByTestId('start-btn').click();
        const consent = new ConsentPage(tab);
        await consent.waitForLoad();
        await reloadTest(tab);
        await consent.acceptConsent();

        const presort = new PreSortPage(tab);
        await presort.waitForLoad();
        await tab.getByLabel('Age').fill('25');
        await reloadTest(tab);
        await expect(tab.getByLabel('Age')).toHaveValue('25');
        await presort.completePreSort();

        await tab.waitForURL(/\/fine-sort(\?|$)/, { timeout: 15000 });
        await expect(tab.getByTestId('deck-cards-container')).toBeVisible({ timeout: 30000 });
        await placeNCards(tab, 2);
        await reloadTest(tab);
        await expect.poll(() => countPlacedCards(tab)).toBe(2);
        await placeAllCards(tab);
        await reloadTest(tab);
        await expect.poll(() => countPlacedCards(tab)).toBe(STATEMENT_TOTAL);

        await confirmSort(tab);
        const comments = tab.getByTestId('extreme-comment-input');
        for (const comment of await comments.all()) await comment.fill(COMMENT);
        // The post-sort page sends a silent 'started' one second in: let it try.
        await tab.waitForTimeout(1500);
        await reloadTest(tab);
        await expect(comments.last()).toHaveValue(COMMENT);

        const search = new URL(tab.url()).search;
        await tab.getByRole('button', { name: FI.backToSort }).click();
        await expect(tab).toHaveURL(
            (url) => url.pathname.endsWith('/fine-sort') && url.search === search
        );
        await expect.poll(() => countPlacedCards(tab)).toBe(STATEMENT_TOTAL);
        await reloadTest(tab);
        await confirmSort(tab);
        await expect(comments.last()).toHaveValue(COMMENT);

        await tab.getByTestId('postsort-step1-next-btn').click();
        await expect(tab.getByTestId('postsort-submit-btn')).toBeVisible();
        await reloadTest(tab);
        await tab.getByTestId('postsort-step1-next-btn').click();
        await tab.getByTestId('postsort-submit-btn').click();

        const endScreen = async () => {
            await expect(tab.getByTestId('thank-you-message')).toHaveText(FI.thanks, {
                timeout: 15000,
            });
            await expect(tab.getByText(FI.nothingStored)).toBeVisible();
            await expect(tab.getByText(/PILOT-/)).toHaveCount(0);
        };
        await endScreen();
        await reloadTest(tab);
        await endScreen();

        // A real link pasted into the tab stays a test.
        await tab.goto(`/study/${slug}?token=${token}`);
        await expectTest(tab);

        expect(writes).toEqual([]);
        expect(await testDb.countParticipants(authToken, slug)).toBe(0);

        await tab.getByRole('button', { name: FI.leave }).click();
        await tab.waitForURL((url) => url.searchParams.get('mode') !== 'test');
        await expect(tab.getByTestId('start-btn')).toBeVisible({ timeout: 30000 });
        await expect(tab.getByText(FI.banner)).toHaveCount(0);
        expect(
            await tab.evaluate((key) => window.sessionStorage.getItem(key), 'qualis-pilot-mode')
        ).toBeNull();

        // Real from here on: the server hears it, and none of the test's answers came along.
        await tab.getByTestId('start-btn').click();
        await consent.waitForLoad();
        await consent.acceptConsent();
        await presort.waitForLoad();
        await expect(tab.getByLabel('Age')).toHaveValue('');
        expect(writes.some((write) => write.endsWith('/consent'))).toBe(true);
        expect(await testDb.countParticipants(authToken, slug)).toBe(1);
    });
});
