import { useEffect } from 'react';
import type { useResponseStore } from '../store/useResponseStore';

interface GridColumn {
    capacity: number;
}

interface UseGridSanityProps {
    qsort: { statementId: number; col: number; row: number }[];
    gridColumns: GridColumn[];
    unplaceCard: (id: number) => void;
    categorizeCard: (id: number, category: 'neutral') => void;
}

export const useGridSanity = ({
    qsort,
    gridColumns,
    unplaceCard,
    categorizeCard,
}: UseGridSanityProps) => {
    useEffect(() => {
        if (!qsort || qsort.length === 0 || !gridColumns) return;

        const seenSlots = new Set<string>();
        const cardsToRemove: number[] = [];

        qsort.forEach((card) => {
            const { statementId, col, row } = card;

            // 1. Check Bounds
            if (!gridColumns[col] || row < 0 || row >= gridColumns[col].capacity) {
                console.warn(`Sanity: Card ${statementId} out of bounds at ${col},${row}. Removing.`);
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
        }
    }, [qsort, gridColumns, unplaceCard, categorizeCard]);
};
