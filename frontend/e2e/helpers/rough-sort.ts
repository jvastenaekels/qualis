/**
 * Helpers for participant fine-sort E2E flows (Task 22).
 *
 * Centralises the four viewports and the "place every unplaced card on the
 * grid" loop so the per-mode spec files stay concise. The helpers are thin
 * wrappers over the existing page objects (FineSortPage, RoughSortPage,
 * etc.) — re-using them keeps the tests aligned with the rest of the suite.
 */

import { expect, type Page } from '@playwright/test';

export interface FormFactor {
    /** Slug used in screenshot filenames. */
    name: string;
    width: number;
    height: number;
    isMobile?: boolean;
    hasTouch?: boolean;
}

export const FORM_FACTORS: FormFactor[] = [
    { name: 'mobile_portrait', width: 390, height: 844, isMobile: true, hasTouch: true },
    { name: 'tablet_portrait', width: 768, height: 1024, isMobile: false, hasTouch: true },
    { name: 'tablet_landscape', width: 1024, height: 768, isMobile: false, hasTouch: true },
    { name: 'desktop', width: 1280, height: 800 },
];

/**
 * Shoot a screenshot at a transition. Filenames live in
 * `frontend/e2e/participant/fine-sort-screenshots/` so they can be committed
 * alongside the spec files as visual baselines.
 */
export async function captureTransition(
    page: Page,
    formFactor: string,
    mode: 'rough' | 'deck',
    step: number,
    label: string
): Promise<void> {
    const stepStr = String(step).padStart(2, '0');
    const filename = `e2e/participant/fine-sort-screenshots/${formFactor}-${mode}-${stepStr}-${label}.png`;
    try {
        // Playwright's `animations: 'disabled'` covers CSS animations and
        // transitions, but framer-motion's layoutId-driven animations are
        // JS-driven and slip past it. Give them a moment to settle so cards
        // are captured in their final placement instead of mid-flight.
        await page.waitForTimeout(400);
        await page.screenshot({ path: filename, fullPage: false, animations: 'disabled' });
    } catch {
        // Screenshot best-effort; never fail the test on capture issues.
    }
}

async function tryZoomOut(page: Page): Promise<void> {
    try {
        const zoomOutBtn = page.getByRole('button', { name: /zoom out/i }).first();
        if (await zoomOutBtn.isVisible({ timeout: 500 })) {
            await zoomOutBtn.click();
            await zoomOutBtn.click().catch(() => {});
        }
    } catch {
        // ignore
    }
}

/**
 * Place a single card onto the next free grid slot. Returns true if a card
 * was moved, false if the deck was already empty.
 */
async function placeOnce(page: Page): Promise<boolean> {
    const deckContainer = page.getByTestId('deck-cards-container');
    const deckCards = deckContainer.locator('[data-testid^="card-"]');
    const remaining = await deckCards.count();
    if (remaining === 0) return false;

    const card = deckCards.first();
    await card.click({ force: true }).catch(async () => {
        await card.evaluate((node: HTMLElement) => node.click());
    });

    const emptySlot = page.locator('[role="gridcell"]:not(:has([data-testid^="card-"]))').first();
    await emptySlot.scrollIntoViewIfNeeded().catch(() => {});
    await emptySlot.evaluate((node: HTMLElement) => node.click());

    await expect
        .poll(async () => deckContainer.locator('[data-testid^="card-"]').count(), {
            timeout: 5000,
        })
        .toBeLessThan(remaining);
    return true;
}

async function drainCurrentDeck(page: Page, maxIterations = 200): Promise<void> {
    for (let i = 0; i < maxIterations; i++) {
        const moved = await placeOnce(page);
        if (!moved) break;
    }
}

/**
 * Iteratively place every unplaced card from the deck onto the next free
 * grid slot. Works for both rough+fine (3 piles via tabs) and deck-only
 * (single flat list) modes.
 */
export async function placeAllCards(page: Page): Promise<void> {
    const deckContainer = page.getByTestId('deck-cards-container');
    await expect(deckContainer).toBeVisible({ timeout: 10000 });

    await tryZoomOut(page);

    const isRoughMode = (await page.getByRole('tab').count()) === 3;

    if (isRoughMode) {
        for (let pileIndex = 0; pileIndex < 3; pileIndex++) {
            const tab = page.getByRole('tab').nth(pileIndex);
            await tab.click();
            await expect(tab).toHaveAttribute('aria-selected', 'true');
            await drainCurrentDeck(page);
        }
    } else {
        await drainCurrentDeck(page);
    }
}

/**
 * Place exactly N cards (deck mode helper for the rotation test).
 * Returns the number actually placed.
 */
export async function placeNCards(page: Page, n: number): Promise<number> {
    const deckContainer = page.getByTestId('deck-cards-container');
    await expect(deckContainer).toBeVisible({ timeout: 10000 });

    let placed = 0;
    for (let i = 0; i < n; i++) {
        const moved = await placeOnce(page);
        if (!moved) break;
        placed++;
    }
    return placed;
}

/**
 * Count cards currently placed on the grid (i.e. inside any gridcell).
 */
export async function countPlacedCards(page: Page): Promise<number> {
    return page.locator('[role="gridcell"] [data-testid^="card-"]').count();
}
