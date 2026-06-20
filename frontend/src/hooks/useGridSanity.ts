import { useEffect } from 'react';
import { toast } from 'sonner';
import i18n from '../i18n';

interface GridColumn {
    capacity: number;
}

type DistributionMode = 'forced' | 'free' | 'flexible';

interface UseGridSanityProps {
    qsort: { statementId: number; col: number; row: number }[];
    gridColumns: GridColumn[];
    unplaceCard: (id: number) => void;
    categorizeCard: (id: number, category: 'neutral') => void;
    /**
     * Distribution mode that drives whether the row-vs-capacity bounds check
     * is enforced. In `forced` mode (the default) any card placed at
     * `row >= capacity` is removed (legacy behaviour). In `free` and
     * `flexible` mode the per-column capacity is a soft hint and overflow
     * rows are first-class — the bounds check only catches negative rows and
     * unknown columns, while overlaps are still flagged unconditionally.
     */
    distributionMode?: DistributionMode;
}

export const useGridSanity = ({
    qsort,
    gridColumns,
    unplaceCard,
    categorizeCard,
    distributionMode = 'forced',
}: UseGridSanityProps) => {
    useEffect(() => {
        if (!qsort || qsort.length === 0 || !gridColumns) return;

        const isForced = distributionMode === 'forced';
        const seenSlots = new Set<string>();
        const cardsToRemove: number[] = [];

        qsort.forEach((card) => {
            const { statementId, col, row } = card;

            // 1. Check Bounds. In free/flexible mode the row may exceed the
            //    declared capacity (overflow rows render past `capacity`),
            //    so only enforce the upper bound in forced mode.
            const colMissing = !gridColumns[col];
            const rowOutOfRange = row < 0 || (isForced && row >= (gridColumns[col]?.capacity ?? 0));
            if (colMissing || rowOutOfRange) {
                console.warn(
                    `Sanity: Card ${statementId} out of bounds at ${col},${row}. Removing.`
                );
                cardsToRemove.push(statementId);
                return;
            }

            // 2. Check Overlaps
            const slotKey = `${col}_${row}`;
            if (seenSlots.has(slotKey)) {
                console.warn(`Sanity: Card ${statementId} overlaps at ${slotKey}. Removing.`);
                cardsToRemove.push(statementId);
            } else {
                seenSlots.add(slotKey);
            }
        });

        if (cardsToRemove.length > 0) {
            cardsToRemove.forEach((id) => {
                unplaceCard(id);
                categorizeCard(id, 'neutral');
            });
            // Surface the removal so the participant is not silently surprised
            // by vanished cards (bug #42). The cards are moved to the neutral
            // pile and can be re-placed.
            toast.warning(
                i18n.t(
                    'grid.cards_moved_to_neutral',
                    'Some cards could not be kept on the grid and were moved back to the unsorted pile. Please re-place them.'
                )
            );
        }
    }, [qsort, gridColumns, unplaceCard, categorizeCard, distributionMode]);
};
