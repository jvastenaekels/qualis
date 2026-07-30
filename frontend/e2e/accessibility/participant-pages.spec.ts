/**
 * E2E: participant-flow accessibility and layout geometry.
 *
 * `admin-pages.spec.ts` covers seven admin routes; `public-pages.spec.ts` covers the
 * landing page and login. The six screens a *participant* sees — welcome, consent,
 * pre-sort, rough sort, fine sort, post-sort — were covered by neither. That gap is
 * why commit #338 could raise the admin's contrast floor to AA while the participant
 * flow kept shipping a 2.34:1 progress counter and 3.15:1 pile labels: nothing
 * measured them.
 *
 * This file opens with the geometric assertions, because the defect that prompted it
 * is not something axe can see. `e2e/participant/fine-sort-*.spec.ts` already walks
 * the whole flow at `mobile_portrait` (390×844) on every run, and has done for as
 * long as those specs have existed — and it never caught the header overflow below,
 * because walking a flow proves the buttons *work*, not that they are *on screen*.
 * A control at `right: 455` in a 390px viewport is clicked happily by Playwright.
 *
 * ---
 *
 * Coverage boundary — what a green run here does and does not prove:
 *
 *   - The header-geometry tests check only `[data-testid="layout-header"]`, only on
 *     the pre-sort route, and only for horizontal overflow past the right edge. They
 *     say nothing about vertical clipping, about overlap *between* header controls
 *     (two buttons can both be on screen and still sit on top of each other), or
 *     about any other sticky/floating surface in the flow.
 *   - They run against the English UI. German is the realistic worst case for a
 *     truncating title and is not covered; a locale sweep is out of scope here.
 *   - `document.documentElement.scrollWidth === innerWidth` is asserted alongside, so
 *     a future "fix" that restores the controls by letting the page scroll sideways
 *     fails rather than passes. Horizontal scroll is not a fix for this defect.
 *
 * The second describe block is the axe pass, and it has its own, longer boundary —
 * stated above `Participant accessibility` below rather than here, because a gate
 * that hides its blind spots is worse than no gate and that list needs to sit where
 * someone editing the scan will read it.
 */

import { expect, test } from '../fixtures/db-setup';
import { testDataBuilders } from '../fixtures/test-data';
import { ConsentPage } from '../pages/ConsentPage';
import { FineSortPage } from '../pages/FineSortPage';
import { PreSortPage } from '../pages/PreSortPage';
import { RoughSortPage } from '../pages/RoughSortPage';
import { WelcomePage } from '../pages/WelcomePage';
import { placeAllCards } from '../helpers/rough-sort';
import { expectContrastAtLeast, expectNoA11yViolations, waitForAnimationsToSettle } from './rules';

test.setTimeout(120_000);

/**
 * Every width at or below the point where the header stops overflowing. 430 is the
 * iPhone Pro Max; 320 is the iPhone SE and the narrowest viewport the flow claims to
 * support. Measured before the fix: the language switcher's right edge sat at 453-457
 * across this whole range, and the help button's at 401-405.
 */
const PHONE_WIDTHS = [320, 360, 375, 390, 414, 430];

/**
 * The header's right-hand cluster only reaches full width under a configuration the
 * default test study does not have, and getting this wrong makes the test vacuous —
 * the first version of it passed at all six widths while the defect was live.
 *
 * Two things are load-bearing:
 *
 *   1. **Two translations.** `StudyLayout.tsx:820` mounts the language switcher only
 *      when `available_languages.length > 1`. A single-language study has no globe,
 *      so the widest control in the cluster is simply absent.
 *   2. **A title of realistic length.** `testDataBuilders.study()` defaults to
 *      "Test Study" — 89px rendered, against 165px for the demo's "Bioeconomy
 *      Futures". 76px of slack is the difference between overflowing and not.
 *
 * Neither is exotic: this is the configuration of the study `make demo-seed` ships.
 */
const STUDY_TITLE = 'Bioeconomy Futures';

const TRANSLATIONS = ['en', 'fr'].map((language_code) => ({
    language_code,
    title: STUDY_TITLE,
    description: 'A test study for E2E testing',
    instructions: 'Follow the instructions carefully',
    objective: 'Test study objective',
    condition_of_instruction: 'What is your stance on this statement?',
    consent_title: 'Informed Consent',
    consent_description: 'Please read and accept the terms to proceed.',
}));

/**
 * A study cannot be activated with a declared language that its statements do not
 * cover — `POST /state?new_state=active` returns 400 with
 * `missing_statement_translation`. That gate is correct and this study has to satisfy
 * it, so every statement carries both languages.
 */
const BILINGUAL_STATEMENTS = Array.from({ length: 6 }, (_, i) => ({
    code: `S${i + 1}`,
    translations: [
        { language_code: 'en', text: `Statement ${i + 1}: test statement text` },
        { language_code: 'fr', text: `Énoncé ${i + 1} : texte de test` },
    ],
}));

/**
 * The pre-sort is present because the step count is load-bearing. Without it the flow
 * has four steps and the header pill reads "Step 3/4"; with it, five and "Step 2/5" —
 * and the measured live failure ran to 430px, where the margin is a handful of pixels.
 * Dropping the pre-sort narrowed the reproduction band to 390px in an earlier draft of
 * this spec, which would have left the fix under-verified at exactly the widths where
 * it is tightest.
 *
 * Labels are `{en, fr}` objects: the activation validator requires a counterpart for
 * every declared language on question labels and on each option label.
 */
const bilingual = (en: string, fr: string) => ({ en, fr });

const PRESORT_CONFIG = testDataBuilders.presortConfig({
    age: testDataBuilders.presortField('number', 'Age', {
        required: true,
        label: bilingual('Age', 'Âge'),
    } as never),
    gender: testDataBuilders.presortField('select', 'Gender', {
        required: true,
        label: bilingual('Gender', 'Genre'),
        options: [
            { value: 'male', label: bilingual('Male', 'Homme') },
            { value: 'female', label: bilingual('Female', 'Femme') },
        ],
    } as never),
    /**
     * Optional, so the walk below can submit the form without answering it — but
     * present, because the rating field is the only presort control that renders a
     * `role="radiogroup"`, and the radiogroup is where the missing accessible name
     * lives. A presort built from text and select fields alone scans clean and
     * proves nothing about it.
     */
    familiarity: testDataBuilders.presortField('rating', 'Familiarity', {
        required: false,
        label: bilingual(
            'How familiar are you with debates about the bioeconomy?',
            'Connaissez-vous les débats sur la bioéconomie ?'
        ),
        scale_points: 5,
        scale_labels: { left: 'Not at all', right: 'Very familiar' },
    } as never),
});

/**
 * One study for both describe blocks. Rough sort is on: it is a screen a participant
 * sees, so the axe walk has to pass through it, and it costs the geometry block
 * nothing (that block asserts on the header, which is identical either way).
 */
const bioeconomyStudy = (slug: string) =>
    ({
        ...testDataBuilders.study({
            slug,
            title: STUDY_TITLE,
            translations: TRANSLATIONS,
            statements: BILINGUAL_STATEMENTS,
            grid_config: [
                { score: -1, capacity: 2 },
                { score: 0, capacity: 2 },
                { score: 1, capacity: 2 },
            ],
            presort_config: PRESORT_CONFIG,
            state: 'active',
        }),
        rough_sort_enabled: true,
        // biome-ignore lint/suspicious/noExplicitAny: rough_sort_enabled is not on the
        // fixture's StudyData shape; the same cast is used in fine-sort-with-rough.spec.ts.
    }) as any;

test.describe('Participant header geometry', () => {
    for (const width of PHONE_WIDTHS) {
        test(`every header control stays on screen at ${width}px`, async ({
            page,
            testDb,
            authToken,
        }) => {
            const study = (await testDb.createStudy(
                authToken,
                bioeconomyStudy(`hdr-${width}-${Date.now()}`)
            )) as { slug: string };

            await page.setViewportSize({ width, height: 844 });

            // The full right-hand cluster (resume, help, language) only mounts once
            // the participant has consented, so the welcome screen cannot show this.
            const welcome = new WelcomePage(page);
            await welcome.visit(study.slug);
            await welcome.startStudy();

            const consent = new ConsentPage(page);
            await consent.waitForLoad();
            await consent.acceptConsent();

            await page.waitForURL(/\/(fine-sort|rough-sort|presort)(\?|$)/, { timeout: 15000 });
            await page.waitForSelector('[data-testid="layout-header"]');

            const offscreen = await page.evaluate(() => {
                const header = document.querySelector('[data-testid="layout-header"]');
                if (!header) return ['header missing'];
                const headerRight = header.getBoundingClientRect().right;
                return [...header.querySelectorAll('button,a')]
                    .filter((el) => el.getBoundingClientRect().width > 0)
                    .filter((el) => el.getBoundingClientRect().right > headerRight + 1)
                    .map(
                        (el) =>
                            el.getAttribute('aria-label') ??
                            el.getAttribute('title') ??
                            el.textContent?.trim() ??
                            '?'
                    );
            });

            expect(offscreen).toEqual([]);

            // And not by making the document scroll sideways instead.
            const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
            expect(scrollWidth).toBeLessThanOrEqual(width);
        });
    }
});

/**
 * The axe pass. Same `SMOKE_RULES` as the admin, same two widths.
 *
 * It is one walk per viewport rather than six `page.goto()`s, because the participant
 * routes are not addressable: `/presort` without consent state redirects, and
 * `/post-sort` without a completed grid has nothing to render. Stubbing the store to
 * jump straight in would scan a DOM no participant ever sees, so the walk pays the
 * cost of actually being a participant.
 *
 * Coverage boundary — what a green run here does and does not prove:
 *
 *   - **axe does not measure the fine sort's axis.** `expectNoA11yViolations` drops
 *     `results.incomplete`, and on this flow that is where half the known defects sit.
 *     Instrumented and counted: all six score labels, both legend labels and the
 *     statement card text come back incomplete on the fine sort (the board is under a
 *     `react-zoom-pan-pinch` transform), as do the rough sort's three `<kbd>` hints
 *     (under a `backdrop-blur` bar). Every one of them would report "no violations"
 *     forever. `expectContrastAtLeast` below covers exactly those, computing the ratio
 *     the same way axe would minus the bail-out — but it covers only what it names, so
 *     anything else under a transform is still unmeasured.
 *   - Only the DOM as it stands when each screen settles is scanned. The fine sort's
 *     card-selected state, the post-sort's validation state, the resume toast and
 *     every modal are unscanned.
 *   - The fine sort is scanned with an **empty** grid, before any card is placed.
 *     Placed cards render their text at ~10 px and axe will not see them here.
 *   - The post-sort is scanned at its first step only. Steps 2+ are never reached.
 *   - Six statements and a 3×2 grid. Nothing here exercises the 23-statement board
 *     the real studies use, where the axis labels are smaller and denser.
 *   - English only, and one brand accent — the seeded study's default. The welcome
 *     page's section headings derive their colour from `--brand-accent` via
 *     `color-mix`, so their ratio is a property of the researcher's chosen accent as
 *     much as of the code. A green run says the default clears AA, nothing more.
 */
const A11Y_VIEWPORTS = [
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'mobile', width: 375, height: 800 },
];

const STATEMENT_COUNT = BILINGUAL_STATEMENTS.length;

for (const vp of A11Y_VIEWPORTS) {
    test.describe(`Participant accessibility — ${vp.name}`, () => {
        test.use({ viewport: { width: vp.width, height: vp.height } });

        test('every screen of the flow', async ({ page, testDb, authToken }) => {
            const study = (await testDb.createStudy(
                authToken,
                bioeconomyStudy(`a11y-flow-${vp.name}-${Date.now()}`)
            )) as { slug: string };

            // Named steps, so a failure report says which screen failed rather than
            // just pointing at the sixth call of the same helper.
            const audit = (label: string) =>
                test.step(`axe: ${label}`, async () => {
                    await waitForAnimationsToSettle(page);
                    await expectNoA11yViolations(page, { soft: true });
                });

            const welcome = new WelcomePage(page);
            await welcome.visit(study.slug);
            await expect(welcome.startButton).toBeVisible({ timeout: 10000 });
            await audit('welcome');
            await welcome.startStudy();

            const consent = new ConsentPage(page);
            await consent.waitForLoad();
            await audit('consent');
            await consent.acceptConsent();

            const presort = new PreSortPage(page);
            await presort.waitForLoad();
            await expect(presort.submitButton).toBeVisible({ timeout: 10000 });
            // The rating field renders, so the scan below really did look at a
            // radiogroup and pass it. That is a fact about axe's rule set, not about
            // the markup: `aria-input-field-name` covers combobox/listbox/searchbox/
            // slider/spinbutton/textbox, and `aria-toggle-field-name` covers the
            // individual radios — which are named by their wrapping `<label>`. No
            // smoke rule names a `radiogroup`, so its dangling `aria-labelledby` is
            // invisible here and is guarded by a unit test in PreSortPage.test.tsx.
            await expect(page.locator('[role="radiogroup"]')).toHaveCount(1);
            await audit('pre-sort');

            // Filled by hand rather than through `presort.completePreSort()`: that
            // helper expects an Education field this study does not declare, and the
            // rating field it would ignore is the one this scan exists for.
            await page.getByLabel('Age', { exact: false }).fill('42');
            await page.getByLabel('Gender', { exact: false }).selectOption({ index: 1 });
            await presort.submit();

            const rough = new RoughSortPage(page);
            await rough.waitForLoad();
            await expect(rough.agreeBtn).toBeEnabled({ timeout: 10000 });
            await audit('rough sort');
            // The keyboard hints are `hidden lg:flex`, so they exist to be measured
            // only at the desktop width. 10 px text — normal, 4.5:1.
            if (vp.width >= 1024) {
                await expectContrastAtLeast(page, 'kbd', 4.5, 'rough sort: key hints');
            }
            await rough.completeRoughSort(STATEMENT_COUNT);

            const fine = new FineSortPage(page);
            await fine.waitForLoad();
            await expect(fine.deckContainer).toBeVisible({ timeout: 10000 });
            await audit('fine sort (empty grid)');

            // The axis of the instrument, and the one thing on this screen axe never
            // reports on. `text-3xl` bold clears the large-text threshold, but 4.5 is
            // asserted rather than 3: the board zooms, and a label that only passes
            // while it is 30 px is not a label that passes.
            await test.step('contrast: fine sort axis', async () => {
                await expectContrastAtLeast(
                    page,
                    '[id^="footer-"]',
                    4.5,
                    'fine sort: score labels'
                );
                await expectContrastAtLeast(
                    page,
                    '[data-testid="legend-disagree"], [data-testid="legend-agree"]',
                    4.5,
                    'fine sort: pile legend'
                );
            });

            await placeAllCards(page);
            const validate = page.getByTestId('fine-sort-validate-btn');
            await expect(validate).toBeEnabled({ timeout: 10000 });
            await validate.evaluate((node: HTMLElement) => node.click());

            await page.waitForURL(/\/post-sort(\?|$)/, { timeout: 20000 });
            await expect(page.getByTestId('postsort-step1-next-btn')).toBeVisible({
                timeout: 15000,
            });
            await audit('post-sort');
        });
    });
}
