import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

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

export async function expectNoA11yViolations(page: Page) {
    const results = await new AxeBuilder({ page }).withRules(SMOKE_RULES).analyze();

    // Only `violations` is asserted. `results.incomplete` — checks axe could not decide
    // automatically (e.g. `color-contrast` over a background gradient or an image, where
    // it cannot compute a single foreground/background pair) — is silently dropped, so
    // this spec would pass over such a case rather than flag it for manual review. None
    // of the routes audited here are known to have one today, but it's a real gap in
    // what a green run proves, not a hypothetical one.
    expect(results.violations).toEqual([]);
}
