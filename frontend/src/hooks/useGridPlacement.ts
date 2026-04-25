/*
 * Libre-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { useCallback } from 'react';

interface DragCard {
    statementId: number;
    col: number;
    row: number;
}

interface GridColumn {
    capacity: number;
}

interface Actions {
    placeCardInGrid: (id: number, col: number, row: number) => void;
    moveCardInGrid: (id: number, col: number, row: number) => void;
    swapCardsInGrid: (id1: number, id2: number) => void;
    unplaceCard: (id: number) => void;
}

interface UseGridPlacementProps {
    responses: {
        qsort: DragCard[];
    };
    gridColumns: GridColumn[];
    actions: Actions;
}

export const useGridPlacement = ({ responses, gridColumns, actions }: UseGridPlacementProps) => {
    const findClosestEmptyRow = useCallback(
        (col: number, targetRow: number): number | null => {
            const capacity = gridColumns[col]?.capacity || 0;
            const cardsInCol = responses.qsort.filter((c) => c.col === col);
            const occupiedRows = new Set(cardsInCol.map((c) => c.row));

            const emptyRows: number[] = [];
            for (let r = 0; r < capacity; r++) {
                if (!occupiedRows.has(r)) {
                    emptyRows.push(r);
                }
            }

            if (emptyRows.length === 0) return null;

            emptyRows.sort((a, b) => {
                const distA = Math.abs(a - targetRow);
                const distB = Math.abs(b - targetRow);
                if (distA === distB) return a - b;
                return distA - distB;
            });

            return emptyRows[0] ?? null;
        },
        [gridColumns, responses.qsort]
    );

    const handlePlacement = useCallback(
        (cardId: number, col: number, targetRow: number) => {
            const existingCard = responses.qsort.find((c) => c.col === col && c.row === targetRow);

            let finalRow = targetRow;
            let shouldSwap = false;

            if (existingCard) {
                const emptyRow = findClosestEmptyRow(col, targetRow);
                if (emptyRow !== null) {
                    finalRow = emptyRow;
                } else {
                    shouldSwap = true;
                }
            }

            const activeCardPlaced = responses.qsort.find((c) => c.statementId === cardId);

            if (shouldSwap && existingCard) {
                if (activeCardPlaced) {
                    actions.swapCardsInGrid(cardId, existingCard.statementId);
                } else {
                    actions.unplaceCard(existingCard.statementId);
                    actions.placeCardInGrid(cardId, col, targetRow);
                }
            } else {
                if (activeCardPlaced) {
                    actions.moveCardInGrid(cardId, col, finalRow);
                } else {
                    actions.placeCardInGrid(cardId, col, finalRow);
                }
            }
        },
        [responses.qsort, findClosestEmptyRow, actions]
    );

    return {
        findClosestEmptyRow,
        handlePlacement,
    };
};
