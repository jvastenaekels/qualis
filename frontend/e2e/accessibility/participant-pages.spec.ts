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
 */

import { expect, test } from '../fixtures/db-setup';
import { testDataBuilders } from '../fixtures/test-data';
import { ConsentPage } from '../pages/ConsentPage';
import { WelcomePage } from '../pages/WelcomePage';

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
});

test.describe('Participant header geometry', () => {
    for (const width of PHONE_WIDTHS) {
        test(`every header control stays on screen at ${width}px`, async ({
            page,
            testDb,
            authToken,
        }) => {
            const study = (await testDb.createStudy(
                authToken,
                testDataBuilders.study({
                    slug: `hdr-${width}-${Date.now()}`,
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
                })
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
