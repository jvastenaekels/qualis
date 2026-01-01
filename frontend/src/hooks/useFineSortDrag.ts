/**
 * useFineSortDrag Hook
 *
 * Encapsulates the complex drag-and-drop logic for the Fine Sort grid.
 * Configures DndKit sensors, drag events, and interactions with the grid placement logic.
 */

import type { DragEndEvent, DragMoveEvent, DragStartEvent } from '@dnd-kit/core';
import { useCallback, useEffect, useState } from 'react';
import { useUIStore } from '../store/useUIStore';
import type { DragCard, InteractionUtils } from '../types/grid';
import { useDragAutoInteraction } from './useDragAutoInteraction';
import { useGridPlacement } from './useGridPlacement';

// Define minimal types needed for the hook to avoid circular deps or complex mocks
interface Statement {
    id: number;
    text: string;
}

interface GridColumn {
    capacity: number;
}

interface Actions {
    placeCardInGrid: (id: number, col: number, row: number) => void;
    moveCardInGrid: (id: number, col: number, row: number) => void;
    swapCardsInGrid: (id1: number, id2: number) => void;
    unplaceCard: (id: number) => void;
    categorizeCard: (id: number, category: 'agree' | 'disagree' | 'neutral') => void;
}

interface UseFineSortDragProps {
    responses: {
        qsort: DragCard[];
    };
    gridColumns: GridColumn[];
    actions: Actions;
    onSelectionChange?: (id: number | null) => void;
    selectedId?: number | null;
    interactionUtils?: InteractionUtils | null;
    onPan?: () => void;
    statements: Statement[];
}

interface ExtendedDragEvent {
    activatorEvent: {
        clientX?: number;
        clientY?: number;
    };
    pointerCoordinates?: {
        x: number;
        y: number;
    } | null;
    delta: {
        x: number;
        y: number;
    };
}

export const useFineSortDrag = ({
    responses,
    gridColumns,
    actions,
    onSelectionChange,
    selectedId,
    interactionUtils,
    onPan,
    statements,
}: UseFineSortDragProps) => {
    const [activeId, setActiveId] = useState<number | null>(null);
    const setActiveCard = useUIStore((state) => state.setActiveCard);

    const { handlePlacement, findClosestEmptyRow } = useGridPlacement({
        responses,
        gridColumns,
        actions,
    });

    const { initInteraction, updateInteraction, cleanupInteraction } = useDragAutoInteraction({
        interactionUtils,
        onPan,
    });

    useEffect(() => {
        const activeCard = activeId !== null ? statements.find((s) => s.id === activeId) : null;
        setActiveCard(activeCard || null);
    }, [activeId, statements, setActiveCard]);

    const handleDragStart = useCallback(
        (event: DragStartEvent) => {
            setActiveId(event.active.id as number);
            onSelectionChange?.(null);

            if (event.activatorEvent) {
                // Try to get stable coordinates from the event
                const extendedEvent = event as unknown as ExtendedDragEvent;
                const clientX =
                    extendedEvent.pointerCoordinates?.x ?? extendedEvent.activatorEvent.clientX;
                const clientY =
                    extendedEvent.pointerCoordinates?.y ?? extendedEvent.activatorEvent.clientY;

                if (clientX !== undefined && clientY !== undefined) {
                    initInteraction(clientX, clientY);
                }
            }
        },
        [onSelectionChange, initInteraction]
    );

    const handleDragMove = useCallback(
        (event: DragMoveEvent) => {
            const extendedEvent = event as unknown as ExtendedDragEvent;
            if (extendedEvent.pointerCoordinates) {
                updateInteraction(
                    extendedEvent.pointerCoordinates.x,
                    extendedEvent.pointerCoordinates.y
                );
            } else {
                const activator = extendedEvent.activatorEvent;
                if (
                    activator &&
                    activator.clientX !== undefined &&
                    activator.clientY !== undefined
                ) {
                    const x = activator.clientX + event.delta.x;
                    const y = activator.clientY + event.delta.y;
                    updateInteraction(x, y);
                }
            }
        },
        [updateInteraction]
    );

    const handleDragEnd = useCallback(
        (event: DragEndEvent) => {
            const { active, over } = event;
            setActiveId(null);
            cleanupInteraction();

            if (!over) return;

            const cardId = active.id as number;
            let overIdString = String(over.id);

            // 1. Check for Deck Drop (Return to Pile)
            if (overIdString.startsWith('deck-')) {
                const category = overIdString.replace('deck-', '') as
                    | 'agree'
                    | 'neutral'
                    | 'disagree';
                actions.unplaceCard(cardId);
                actions.categorizeCard(cardId, category);
                return;
            }

            // 2. If dropped on another card, resolve to its slot
            if (!overIdString.startsWith('slot_')) {
                const cardIdAtOver = over.id as number;
                const placedCard = responses.qsort.find((c) => c.statementId === cardIdAtOver);
                if (placedCard) {
                    overIdString = `slot_${placedCard.col}_${placedCard.row}`;
                }
            }

            // 3. Slot Placement
            if (overIdString.startsWith('slot_')) {
                const parts = overIdString.split('_');
                if (parts.length === 3) {
                    const col = parseInt(parts[1], 10);
                    const row = parseInt(parts[2], 10);
                    handlePlacement(cardId, col, row);
                }
            }
        },
        [responses.qsort, handlePlacement, cleanupInteraction, actions]
    );

    const handleCardClick = useCallback(
        (id: number) => {
            onSelectionChange?.(id === selectedId ? null : id);
        },
        [onSelectionChange, selectedId]
    );

    const handleSlotClick = useCallback(
        (col: number, row: number) => {
            if (selectedId === null || selectedId === undefined) return;
            handlePlacement(selectedId, col, row);
            onSelectionChange?.(null);
        },
        [selectedId, handlePlacement, onSelectionChange]
    );

    return {
        activeId,
        handleDragStart,
        handleDragMove,
        handleDragEnd,
        findClosestEmptyRow,
        handleCardClick,
        handleSlotClick,
    };
};
