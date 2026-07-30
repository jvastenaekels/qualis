import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

/**
 * Wait out every fade in flight before scanning.
 *
 * Playwright's `toBeVisible()` does not wait out a CSS transition — an element
 * mid-fade already has a bounding box and non-zero opacity, so it satisfies
 * "visible" well before the animation settles. axe's `color-contrast`, in contrast,
 * reads the *actual* computed opacity at scan time, so scanning mid-fade measures a
 * foreground blended toward the background and reports a spuriously low ratio for a
 * colour that is fine once settled.
 *
 * Two animation systems are in play and the second is the one that bites:
 *
 *   - Tailwind's `animate-in` (`tailwindcss-animate`), which the admin pages use in
 *     nested layers and every participant route wraps itself in. A class selector
 *     finds these.
 *   - framer-motion, which writes an interpolated `style="opacity: …"` directly and
 *     carries no marker class. The rough sort's tip banner is one: scanning it
 *     mid-fade measured its `text-yellow-800` at 2.28, 2.48, 2.81 and 4.17 across
 *     four consecutive runs of the same code. A gate whose reported ratio depends on
 *     when the scan happened to land is not a measurement.
 *
 * So the settle condition is: no `.animate-in` short of full opacity, *and* every
 * inline opacity unchanged across three consecutive frames. The second half needs no
 * knowledge of which library is animating — it just waits for the numbers to stop
 * moving.
 */
export async function waitForAnimationsToSettle(page: Page) {
    type SettleState = { __a11yLastFingerprint?: string; __a11yStableTicks?: number };

    // Reset the stability counters below before each call — callers run this once per
    // viewport (and, in the participant walk, once per screen), and each pass needs
    // its own count, not one carried over from the previous scan.
    await page.evaluate(() => {
        const state = window as unknown as SettleState;
        state.__a11yLastFingerprint = undefined;
        state.__a11yStableTicks = 0;
    });

    await page.waitForFunction(() => {
        const state = window as unknown as SettleState;
        const animating = document.querySelectorAll('.animate-in');
        const allSettled = Array.from(animating).every(
            (el) => getComputedStyle(el).opacity === '1'
        );

        // Everything carrying an inline opacity — framer-motion's interpolation
        // target — plus the `.animate-in` count, so a poll landing before anything
        // has mounted cannot resolve immediately against an empty tree. (That hazard
        // is not hypothetical: `.animate-in` count was 0 at scan time on 4 of 7 admin
        // routes when it was first measured.) Three identical frames means the fades
        // have stopped, whichever library is driving them.
        const fingerprint = [
            animating.length,
            ...Array.from(
                document.querySelectorAll('[style*="opacity"]'),
                (el) => getComputedStyle(el).opacity
            ),
        ].join('|');

        state.__a11yStableTicks =
            fingerprint === state.__a11yLastFingerprint ? (state.__a11yStableTicks ?? 0) + 1 : 0;
        state.__a11yLastFingerprint = fingerprint;

        return allSettled && state.__a11yStableTicks >= 3;
    });
}

/**
 * Structure and contrast. `color-contrast` computes real ratios, which is what the
 * static gate (`npm run lint:a11y`) cannot do — it only bans one literal class.
 */
export const STRUCTURE_RULES = [
    'color-contrast',
    'heading-order',
    'landmark-no-duplicate-main',
    'landmark-one-main',
    'page-has-heading-one',
    'region',
];

/**
 * Accessible names, computed from the rendered DOM.
 *
 * This is the half of the accessible-name problem no static checker reaches: axe sees
 * through Radix `asChild`, resolves `<SelectValue>` to the text actually rendered,
 * honours the `title` fallback, and respects `display:none` — so a name that only
 * exists above the `sm` breakpoint fails here and nowhere else.
 */
export const NAME_RULES = [
    'aria-command-name',
    'aria-input-field-name',
    'aria-toggle-field-name',
    'button-name',
    'image-alt',
    'input-button-name',
    'input-image-alt',
    'label',
    'link-name',
    'select-name',
];

/** The rule set every page in this suite is checked against. */
export const SMOKE_RULES = [...STRUCTURE_RULES, ...NAME_RULES];

/**
 * One line per offending node: rule, measured ratio when the rule is `color-contrast`,
 * and enough of the element to find it.
 *
 * Asserting on `results.violations` directly produces a diff of the raw axe objects —
 * several hundred lines per node, `relatedNodes` and `tags` included — in which the two
 * numbers that matter are buried. That is not a readability nicety: the first run of the
 * participant walk emitted so much output that the failures on later screens were
 * unreadable in the terminal.
 */
function summarise(violations: Awaited<ReturnType<AxeBuilder['analyze']>>['violations']) {
    return violations.flatMap((violation) =>
        violation.nodes.map((node) => {
            const contrast = node.any.find((check) => check.id === 'color-contrast')?.data as
                | { contrastRatio?: number; expectedContrastRatio?: string; fgColor?: string }
                | undefined;
            const ratio = contrast?.contrastRatio
                ? ` ${contrast.contrastRatio}:1 (needs ${contrast.expectedContrastRatio}, fg ${contrast.fgColor})`
                : '';
            return `${violation.id}${ratio} — ${node.target.join(' ')} — ${node.html.slice(0, 120)}`;
        })
    );
}

/**
 * Contrast ratio for text axe refuses to judge.
 *
 * `expectNoA11yViolations` drops `results.incomplete`, and on the participant flow that
 * is not a marginal loss — it is where half the known defects live. Measured on the
 * fine sort: all six score labels (`#header-score--1 > .text-3xl` and friends), both
 * legend labels and the statement card text come back incomplete, never as violations,
 * because the board sits under a `react-zoom-pan-pinch` transform. Same on the rough
 * sort's `<kbd>` key hints, under a `backdrop-blur` bar. A gate that reports those as
 * "no violations" is telling the truth about what it checked and a lie about the page.
 *
 * So this computes the ratio the same way axe would, minus the bail-out: foreground
 * from the element, background composited down the ancestor chain until an opaque
 * layer, white as the floor. It cannot see a background *image* or a gradient — those
 * genuinely need a human — but neither of those is what stopped axe here.
 *
 * Returns one ratio per matching element, rounded to two decimals, in document order.
 */
export async function measureContrast(page: Page, selector: string): Promise<number[]> {
    return page.$$eval(selector, (elements) => {
        const parse = (value: string): [number, number, number, number] => {
            const parts = value.match(/[\d.]+/g)?.map(Number) ?? [];
            if (parts.length < 3) return [255, 255, 255, 0];
            return [parts[0], parts[1], parts[2], parts.length > 3 ? parts[3] : 1];
        };

        const over = (
            top: [number, number, number, number],
            bottom: [number, number, number]
        ): [number, number, number] => [
            top[0] * top[3] + bottom[0] * (1 - top[3]),
            top[1] * top[3] + bottom[1] * (1 - top[3]),
            top[2] * top[3] + bottom[2] * (1 - top[3]),
        ];

        const luminance = ([r, g, b]: [number, number, number]) => {
            const channel = (c: number) => {
                const s = c / 255;
                return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
            };
            return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
        };

        return elements.map((element) => {
            // Every background from the element upward, nearest first, stopping at the
            // first fully opaque one — anything above it cannot show through.
            const layers: Array<[number, number, number, number]> = [];
            for (let node: Element | null = element; node; node = node.parentElement) {
                const background = parse(getComputedStyle(node).backgroundColor);
                if (background[3] > 0) layers.push(background);
                if (background[3] === 1) break;
            }

            // Composite from the bottom layer up to the element's own.
            let background: [number, number, number] = [255, 255, 255];
            for (const layer of layers.reverse()) background = over(layer, background);

            const [r, g, b, alpha] = parse(getComputedStyle(element).color);
            const foreground = over([r, g, b, alpha], background);

            const lighter = Math.max(luminance(foreground), luminance(background));
            const darker = Math.min(luminance(foreground), luminance(background));
            return Math.round(((lighter + 0.05) / (darker + 0.05)) * 100) / 100;
        });
    });
}

/**
 * Assert every element matching `selector` clears `min`, and that at least one element
 * matched — a selector that silently matches nothing is the classic way an accessibility
 * assertion turns green while measuring air.
 *
 * Soft, for the same reason `expectNoA11yViolations(page, {soft: true})` is: the only
 * caller is a single test that walks the whole participant flow, and a hard failure on
 * the rough sort's key hints would leave the fine sort's axis unmeasured until someone
 * fixed the first one. The test still fails.
 */
export async function expectContrastAtLeast(
    page: Page,
    selector: string,
    min: number,
    label: string
) {
    const ratios = await measureContrast(page, selector);
    expect.soft(ratios.length, `${label}: selector matched no element`).toBeGreaterThan(0);
    expect
        .soft(
            ratios.filter((ratio) => ratio < min),
            `${label}: needs ${min}:1, measured ${ratios.join(', ')}`
        )
        .toEqual([]);
}

export async function expectNoA11yViolations(page: Page, options: { soft?: boolean } = {}) {
    const results = await new AxeBuilder({ page }).withRules(SMOKE_RULES).analyze();

    // Only `violations` is asserted. `results.incomplete` — checks axe could not decide
    // automatically (e.g. `color-contrast` over a background gradient or an image, where
    // it cannot compute a single foreground/background pair) — is silently dropped, so
    // this spec would pass over such a case rather than flag it for manual review. This
    // is not hypothetical: instrumenting `results.incomplete` shows every route in this
    // suite reports `color-contrast` incompletes (13 nodes on analysis desktop, 12
    // mobile, 10 on data). Most are benign, but on the two chart routes (dashboard,
    // analysis) recharts renders axis/legend text ("Factor", "Eigenvalue", date labels)
    // as SVG text nodes axe reports as "background color could not be determined
    // because element contains an image node" — so chart text contrast is never
    // actually checked by a green run here.
    //
    // `soft` is for callers that scan several screens inside one test — the participant
    // walk cannot re-enter the flow at screen 4, so a hard failure on screen 1 would
    // leave the rest of the flow unmeasured until someone fixed it and re-ran. The test
    // still fails; it just finishes counting first.
    const assertion = options.soft
        ? expect.soft(summarise(results.violations))
        : expect(summarise(results.violations));
    assertion.toEqual([]);
}
