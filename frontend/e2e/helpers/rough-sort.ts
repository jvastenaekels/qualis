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

/**
 * Shoot a screenshot using a pre-formatted suffix (no separate step counter).
 * Used by the free-mode spec where the canonical filename is
 * `${vp}-${mode}-free-NN-label.png` without an extra step prefix.
 */
export async function captureWithSuffix(
    page: Page,
    formFactor: string,
    mode: 'rough' | 'deck',
    suffix: string
): Promise<void> {
    const filename = `e2e/participant/fine-sort-screenshots/${formFactor}-${mode}-${suffix}.png`;
    try {
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

/**
 * Place a single card from the deck onto the first empty slot of the given
 * column index. Returns true if a card was moved, false if the deck was empty
 * or the target column had no free slot.
 *
 * Useful for free-mode tests where we want to deliberately stack a single
 * column or unbalance the distribution. Targets `#slot_${col}_${row}` IDs
 * emitted by GridSort (column-major DOM order).
 */
async function placeOnceInColumn(page: Page, columnIndex: number): Promise<boolean> {
    const deckContainer = page.getByTestId('deck-cards-container');
    const deckCards = deckContainer.locator('[data-testid^="card-"]');
    const remaining = await deckCards.count();
    if (remaining === 0) return false;

    // Find the first empty slot in the target column.
    const colSlots = page.locator(`[id^="slot_${columnIndex}_"]:not(:has([data-testid^="card-"]))`);
    const colSlotsCount = await colSlots.count();
    if (colSlotsCount === 0) return false;

    const card = deckCards.first();
    await card.click({ force: true }).catch(async () => {
        await card.evaluate((node: HTMLElement) => node.click());
    });

    const target = colSlots.first();
    await target.scrollIntoViewIfNeeded().catch(() => {});
    await target.evaluate((node: HTMLElement) => node.click());

    await expect
        .poll(async () => deckContainer.locator('[data-testid^="card-"]').count(), {
            timeout: 5000,
        })
        .toBeLessThan(remaining);
    return true;
}

/**
 * Place exactly N cards from the deck into a specific column. Returns the
 * number actually placed (capped by available deck cards and free slots).
 *
 * In rough-sort mode, walks through pile tabs as needed so the helper works
 * for both rough+fine and deck-only flows.
 */
export async function placeNCardsInColumn(
    page: Page,
    n: number,
    columnIndex: number
): Promise<number> {
    const deckContainer = page.getByTestId('deck-cards-container');
    await expect(deckContainer).toBeVisible({ timeout: 10000 });
    await tryZoomOut(page);

    const isRoughMode = (await page.getByRole('tab').count()) === 3;
    let placed = 0;
    let pileIndex = 0;

    while (placed < n) {
        if (isRoughMode) {
            // Activate current pile.
            const tab = page.getByRole('tab').nth(pileIndex);
            await tab.click();
            await expect(tab).toHaveAttribute('aria-selected', 'true');
        }

        const moved = await placeOnceInColumn(page, columnIndex);
        if (moved) {
            placed++;
            continue;
        }

        // No card moved. If rough mode, try the next pile; otherwise we're
        // done (deck empty or column full).
        if (isRoughMode && pileIndex < 2) {
            pileIndex++;
            continue;
        }
        break;
    }

    return placed;
}

/**
 * Count cards currently placed in a specific column.
 */
async function countCardsInColumn(page: Page, columnIndex: number): Promise<number> {
    return page.locator(`[id^="slot_${columnIndex}_"] [data-testid^="card-"]`).count();
}

/**
 * Move a single already-placed card from sourceCol to destCol.
 * Click the card to select it, then click an empty slot in destCol.
 * Returns true if a card was moved.
 */
async function moveOnceBetweenColumns(
    page: Page,
    sourceCol: number,
    destCol: number
): Promise<boolean> {
    const sourceCard = page.locator(`[id^="slot_${sourceCol}_"] [data-testid^="card-"]`).first();
    if ((await sourceCard.count()) === 0) return false;

    const beforeSource = await countCardsInColumn(page, sourceCol);
    const beforeDest = await countCardsInColumn(page, destCol);

    await sourceCard.scrollIntoViewIfNeeded().catch(() => {});
    await sourceCard.evaluate((node: HTMLElement) => node.click());

    // Find the first empty slot in the destination column. In free mode the
    // GridSort renders an extra trailing slot when capacity is exhausted, so
    // there is always at least one empty target available.
    const destSlot = page
        .locator(`[id^="slot_${destCol}_"]:not(:has([data-testid^="card-"]))`)
        .first();
    if ((await destSlot.count()) === 0) return false;
    await destSlot.scrollIntoViewIfNeeded().catch(() => {});
    await destSlot.evaluate((node: HTMLElement) => node.click());

    // Wait for the move to settle: source decreases, dest increases.
    await expect
        .poll(async () => countCardsInColumn(page, sourceCol), { timeout: 5000 })
        .toBeLessThan(beforeSource);
    await expect
        .poll(async () => countCardsInColumn(page, destCol), { timeout: 5000 })
        .toBeGreaterThan(beforeDest);
    return true;
}

/**
 * Move N already-placed cards from sourceCol to destCol. Returns the number
 * actually moved (capped by available cards in sourceCol).
 *
 * Used by free-mode tests to redistribute cards between columns to demonstrate
 * overflow rendering: stack many cards in a low-capacity column to force
 * GridSort to render extra trailing slots past the declared capacity.
 */
export async function moveNCardsBetweenColumns(
    page: Page,
    n: number,
    sourceCol: number,
    destCol: number
): Promise<number> {
    let moved = 0;
    for (let i = 0; i < n; i++) {
        const ok = await moveOnceBetweenColumns(page, sourceCol, destCol);
        if (!ok) break;
        moved++;
    }
    return moved;
}
