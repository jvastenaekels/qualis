/**
 * Pure helpers for Step1_Feedback.
 *
 * - `selectExtremeCards`: filter the participant's qsort to keep only cards
 *   placed in extreme columns (defined by score), then sort by ascending
 *   score then by row. Pure function for testability.
 */

interface QSortPlacement {
    statementId: number;
    col: number;
    row: number;
}

interface GridColumnLite {
    score: number;
}

/**
 * Return the qsort placements that sit in `extremeCols` (a list of scores
 * such as [-4, 4]), sorted by ascending column score then by row index.
 */
export function selectExtremeCards(
    qsort: QSortPlacement[],
    gridColumns: GridColumnLite[],
    extremeCols: number[]
): QSortPlacement[] {
    return qsort
        .filter((p) => {
            const colDef = gridColumns[p.col];
            return colDef !== undefined && extremeCols.includes(colDef.score);
        })
        .sort((a, b) => {
            const scoreA = gridColumns[a.col]?.score ?? 0;
            const scoreB = gridColumns[b.col]?.score ?? 0;
            if (scoreA !== scoreB) return scoreA - scoreB;
            return a.row - b.row;
        });
}
