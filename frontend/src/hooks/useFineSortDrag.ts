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
import { resolveDropTarget } from './useFineSortDrag.helpers';

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

export interface UseFineSortDragProps {
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
    /**
     * Forwarded to {@link useGridPlacement} so that free-mode placements can
     * land in synthesised overflow rows past the declared per-column capacity.
     */
    distributionMode?: 'forced' | 'free' | 'flexible';
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
    distributionMode,
}: UseFineSortDragProps) => {
    const [activeId, setActiveId] = useState<number | null>(null);
    const setActiveCard = useUIStore((state) => state.setActiveCard);

    const { handlePlacement, findClosestEmptyRow } = useGridPlacement({
        responses,
        gridColumns,
        actions,
        distributionMode,
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
            try {
                if (!over) return;
                const cardId = active.id as number;
                const target = resolveDropTarget(String(over.id), responses.qsort);

                if (target.kind === 'deck') {
                    actions.unplaceCard(cardId);
                    actions.categorizeCard(cardId, target.category);
                    return;
                }
                if (target.kind === 'slot') {
                    handlePlacement(cardId, target.col, target.row);
                }
            } catch (error) {
                console.error('Drag end error:', error);
            } finally {
                setActiveId(null);
                cleanupInteraction();
            }
        },
        [responses.qsort, handlePlacement, cleanupInteraction, actions]
    );

    const handleDragCancel = useCallback(() => {
        setActiveId(null);
        cleanupInteraction();
    }, [cleanupInteraction]);

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
        handleDragCancel,
        findClosestEmptyRow,
        handleCardClick,
        handleSlotClick,
    };
};
