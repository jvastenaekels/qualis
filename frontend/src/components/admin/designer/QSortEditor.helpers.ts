/**
 * Pure helpers extracted from QSortEditor for testability.
 *
 * - `computeAutoShapedCapacities`: Q-methodology quasi-normal forced-choice
 *   distribution. Given N statements and numColumns columns, returns the
 *   per-column capacity array using a Power-curve weighting (exponent 1.4 —
 *   sweet spot for reproducing common research tables) and greedy symmetric
 *   assignment with parity-break on even-column counts.
 * - `mergeParsedItemIntoStatements`: pure mutator that applies a single
 *   bulk-imported statement to the draft's `statements` array, handling
 *   sync-mode merges (existing match by code) vs append/replace creation.
 */

const POWER_EXPONENT = 1.4;

/** Generate per-column ideal weights using a Power curve from the centre. */
function computeIdealCapacities(N: number, numColumns: number): number[] {
    const centerIdx = Math.floor(numColumns / 2);
    const maxDist = Math.max(centerIdx, numColumns - 1 - centerIdx);
    const weights: number[] = [];
    for (let i = 0; i < numColumns; i++) {
        const dist = Math.abs(i - centerIdx);
        weights.push((maxDist - dist + 1) ** POWER_EXPONENT);
    }
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    return weights.map((w) => (w / totalWeight) * N);
}

/** Choose the minimum baseline per column based on N vs numColumns. */
function computeMinPerColumn(N: number, numColumns: number): number {
    if (N >= 40) return 2;
    if (N >= numColumns) return 1;
    return 0;
}

/** Pick the unsaturated left-half column with the largest deficit vs ideal. */
function pickBestLeftColumn(
    ideal: number[],
    capacities: number[],
    centerIdx: number,
    isOddCols: boolean
): number {
    const limit = isOddCols ? centerIdx : centerIdx - 1;
    let bestIdx = -1;
    let maxDiff = -Infinity;
    for (let i = 0; i <= limit; i++) {
        const diff = (ideal[i] ?? 0) - (capacities[i] ?? 0);
        if (diff > maxDiff) {
            maxDiff = diff;
            bestIdx = i;
        }
    }
    return bestIdx;
}

/**
 * Compute the per-column capacity array for an "auto-shape" of the Q-sort
 * grid given N total statements and numColumns columns. Returns a flat
 * `number[]` of length numColumns.
 *
 * Returns an empty array when numColumns is 0. Returns all-zeros when N is 0.
 *
 * Algorithm:
 * 1. Power-curve ideal: weight ∝ (maxDist − dist + 1)^1.4 normalised to sum N.
 * 2. Baseline: minPerCol = 2 if N≥40, 1 if N≥numCols, else 0.
 * 3. Greedy: until total === N, pick the left-half column with the largest
 *    deficit vs ideal. Mirror the increment to its symmetric counterpart
 *    (or to the centre column when odd-cols and the pick is the centre).
 *    When only 1 slot remains and N is even-cols, parity-break by adding
 *    just one to the picked column.
 */
export function computeAutoShapedCapacities(N: number, numColumns: number): number[] {
    if (numColumns === 0) return [];
    if (N === 0) return new Array(numColumns).fill(0);

    const centerIdx = Math.floor(numColumns / 2);
    const isOddCols = numColumns % 2 !== 0;
    const ideal = computeIdealCapacities(N, numColumns);
    const minPerCol = computeMinPerColumn(N, numColumns);
    const capacities: number[] = new Array(numColumns).fill(minPerCol);
    let total = capacities.reduce((a, b) => a + b, 0);

    while (total < N) {
        const bestIdx = pickBestLeftColumn(ideal, capacities, centerIdx, isOddCols);
        if (bestIdx === -1) break;

        if (isOddCols && bestIdx === centerIdx) {
            capacities[centerIdx] = (capacities[centerIdx] ?? 0) + 1;
            total += 1;
            continue;
        }

        const remaining = N - total;
        if (remaining >= 2) {
            capacities[bestIdx] = (capacities[bestIdx] ?? 0) + 1;
            const mirrorIdx = numColumns - 1 - bestIdx;
            capacities[mirrorIdx] = (capacities[mirrorIdx] ?? 0) + 1;
            total += 2;
        } else if (isOddCols) {
            capacities[centerIdx] = (capacities[centerIdx] ?? 0) + 1;
            total += 1;
        } else {
            // Even columns parity break: add the last unit to the picked column only.
            capacities[bestIdx] = (capacities[bestIdx] ?? 0) + 1;
            total += 1;
        }
    }

    return capacities;
}

// ---------------------------------------------------------------------------
// Bulk-import merge
// ---------------------------------------------------------------------------

export interface ParsedStatement {
    code?: string | null;
    text?: string;
    translations?: { language_code: string; text: string }[];
}

export type ImportMode = 'append' | 'replace' | 'sync';

// biome-ignore lint/suspicious/noExplicitAny: load-bearing dynamic statement shape
type Statement = any;

interface DraftTranslationLite {
    language_code: string;
}

/**
 * Apply one parsed bulk-import item to the statements array. Mutates
 * `statements` in place. In `'sync'` mode, items whose `code` matches an
 * existing statement update that statement's translations rather than
 * creating a new one. New statements are seeded with one translation per
 * draft language; the active locale gets `item.text` when no per-language
 * `item.translations` are provided.
 */
export function mergeParsedItemIntoStatements(
    item: ParsedStatement,
    statements: Statement[],
    draftTranslations: DraftTranslationLite[],
    importMode: ImportMode,
    activeLocale: string
): void {
    const existing =
        importMode === 'sync' && item.code ? statements.find((s) => s.code === item.code) : null;

    if (existing) {
        applyTranslationsToExisting(existing, item, activeLocale);
        return;
    }

    const code = item.code || `s${statements.length + 1}`;
    const translations = draftTranslations.map(({ language_code }) => {
        const headerT = item.translations?.find((ht) => ht.language_code === language_code);
        if (headerT) return { language_code, text: headerT.text };
        return {
            language_code,
            text: language_code === activeLocale ? (item.text ?? '') : '',
        };
    });
    statements.push({ code, translations });
}

function applyTranslationsToExisting(
    existing: Statement,
    item: ParsedStatement,
    activeLocale: string
): void {
    if (!Array.isArray(existing.translations)) existing.translations = [];

    if (item.translations && item.translations.length > 0) {
        for (const newT of item.translations) {
            const tEntry = existing.translations.find(
                // biome-ignore lint/suspicious/noExplicitAny: dynamic translation entry
                (t: any) => t.language_code === newT.language_code
            );
            if (tEntry) tEntry.text = newT.text;
            else existing.translations.push(newT);
        }
        return;
    }

    if (item.text !== undefined) {
        const tEntry = existing.translations.find(
            // biome-ignore lint/suspicious/noExplicitAny: dynamic translation entry
            (t: any) => t.language_code === activeLocale
        );
        if (tEntry) tEntry.text = item.text;
        else existing.translations.push({ language_code: activeLocale, text: item.text });
    }
}
