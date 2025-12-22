import type { DragStartEvent, DragEndEvent, DragMoveEvent } from '@dnd-kit/core';
import { useState, useCallback, useRef } from 'react';

// Define minimal types needed for the hook to avoid circular deps or complex mocks
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
    setZoomedCard: (card: { id: number; text: string } | null) => void; 
}

interface InteractionUtils {
    zoomIn: () => void;
    zoomOut: () => void;
    performAutoFit: () => void;
    transformRef: React.RefObject<{ 
        instance: { 
            transformState: { positionX: number; positionY: number; scale: number; } 
        }; 
        setTransform: (x: number, y: number, scale: number, duration: number, animationType?: string) => void;
    }>;
    wrapperRef: React.RefObject<HTMLDivElement>;
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
}

export const useFineSortDrag = ({
    responses,
    gridColumns,
    actions,
    onSelectionChange,
    selectedId,
    interactionUtils
}: UseFineSortDragProps) => {
    const [activeId, setActiveId] = useState<number | null>(null);
    
    // Advanced Drag Interaction Refs
    const lastPos = useRef({ x: 0, y: 0 });
    const dwellTimer = useRef<NodeJS.Timeout | null>(null);
    const panInterval = useRef<NodeJS.Timeout | null>(null);

    const handleDragStart = useCallback((event: DragStartEvent) => {
        actions.setZoomedCard(null);
        setActiveId(event.active.id as number);
        onSelectionChange?.(null);
        
        // Initialize position for dwell
        if (event.activatorEvent instanceof MouseEvent || event.activatorEvent instanceof PointerEvent) {
            lastPos.current = { x: event.activatorEvent.clientX, y: event.activatorEvent.clientY };
        }
    }, [actions, onSelectionChange]);

    const stopPan = useCallback(() => {
        if (panInterval.current) {
            clearInterval(panInterval.current);
            panInterval.current = null;
        }
    }, []);

    const handleDragMove = useCallback((event: DragMoveEvent) => {
        if (!interactionUtils || !interactionUtils.transformRef.current) return;

        // Use activatorEvent coords + delta as a fallback for pointerCoordinates
        const activator = event.activatorEvent as MouseEvent | PointerEvent;
        const x = activator.clientX + event.delta.x;
        const y = activator.clientY + event.delta.y;

        const threshold = 10; // pixels for dwell movement
        const dist = Math.sqrt(Math.pow(x - lastPos.current.x, 2) + Math.pow(y - lastPos.current.y, 2));

        // 1. Dwell Zoom
        if (dist > threshold) {
            // Reset dwell timer if moved
            if (dwellTimer.current) clearTimeout(dwellTimer.current);
            dwellTimer.current = setTimeout(() => {
                interactionUtils.zoomIn();
            }, 750);
            lastPos.current = { x, y };
        }

        // 2. Edge Panning
        const wrapper = interactionUtils.wrapperRef.current;
        if (!wrapper) return;

        const rect = wrapper.getBoundingClientRect();
        const edgeThreshold = 80; // Distance from edge to trigger pan
        const panSpeed = 10; // Pixels per interval

        let dx = 0;
        let dy = 0;

        if (x < rect.left + edgeThreshold) dx = panSpeed;
        else if (x > rect.right - edgeThreshold) dx = -panSpeed;

        if (y < rect.top + edgeThreshold) dy = panSpeed;
        else if (y > rect.bottom - edgeThreshold) dy = -panSpeed;

        if (dx !== 0 || dy !== 0) {
            if (!panInterval.current) {
                panInterval.current = setInterval(() => {
                    const transform = interactionUtils.transformRef.current;
                    if (transform) {
                        const state = transform.instance.transformState;
                        transform.setTransform(
                            state.positionX + dx,
                            state.positionY + dy,
                            state.scale,
                            0 // No animation for continuous pan
                        );
                    }
                }, 16); // ~60fps
            }
        } else {
            stopPan();
        }
    }, [interactionUtils, stopPan]);

    const findClosestEmptyRow = useCallback((col: number, targetRow: number): number | null => {
        const capacity = gridColumns[col]?.capacity || 0;
        const cardsInCol = responses.qsort.filter(c => c.col === col);
        const occupiedRows = new Set(cardsInCol.map(c => c.row));
        
        // Find all empty rows
        const emptyRows: number[] = [];
        for (let r = 0; r < capacity; r++) {
            if (!occupiedRows.has(r)) {
                emptyRows.push(r);
            }
        }
        
        if (emptyRows.length === 0) {
            return null;
        }

        // Sort by distance to targetRow
        emptyRows.sort((a, b) => {
            const distA = Math.abs(a - targetRow);
            const distB = Math.abs(b - targetRow);
            if (distA === distB) return a - b; // Tie-break: top-down
            return distA - distB;
        });
        
        return emptyRows[0];
    }, [gridColumns, responses.qsort]);

    const handleDragEnd = useCallback((event: DragEndEvent) => {
        const { active, over } = event;
        setActiveId(null);
        
        // Cleanup timers
        if (dwellTimer.current) clearTimeout(dwellTimer.current);
        stopPan();

        if (!over) return;

        const cardId = active.id as number;
        const overIdString = String(over.id);

        if (overIdString.startsWith('slot_')) {
            const parts = overIdString.split('_');
            if (parts.length === 3) {
                const col = parseInt(parts[1]);
                const targetRow = parseInt(parts[2]);

                // Check if slot is occupied
                const existingCard = responses.qsort.find(c => c.col === col && c.row === targetRow);
                
                let finalRow = targetRow;
                let shouldSwap = false;

                if (existingCard) {
                     // Try to find empty slot in same column
                     const emptyRow = findClosestEmptyRow(col, targetRow);
                     if (emptyRow !== null) {
                         finalRow = emptyRow;
                     } else {
                         shouldSwap = true;
                     }
                }

                if (shouldSwap && existingCard) {
                    const activeCardPlaced = responses.qsort.find(c => c.statementId === cardId);
                    if (activeCardPlaced) {
                        // Both in grid -> Swap
                        actions.swapCardsInGrid(cardId, existingCard.statementId);
                    } else {
                        // Deck to Grid (Full) -> Replace (Kick existing to deck)
                        actions.unplaceCard(existingCard.statementId);
                        actions.placeCardInGrid(cardId, col, targetRow);
                    }
                } else {
                    // Empty slot or Redirected
                    const activeCardPlaced = responses.qsort.find(c => c.statementId === cardId);
                    if (activeCardPlaced) {
                        actions.moveCardInGrid(cardId, col, finalRow);
                    } else {
                        actions.placeCardInGrid(cardId, col, finalRow);
                    }
                }
            }
        }
    }, [responses.qsort, findClosestEmptyRow, actions]);

    const handleCardClick = useCallback((id: number) => {
        onSelectionChange?.(id === selectedId ? null : id);
    }, [onSelectionChange, selectedId]);

    const handleSlotClick = useCallback((col: number, row: number) => {
        if (selectedId === null || selectedId === undefined) return;

        const existingCard = responses.qsort.find(c => c.col === col && c.row === row);
        
        let finalRow = row;
        let shouldSwap = false;

        if (existingCard) {
            const emptyRow = findClosestEmptyRow(col, row);
            if (emptyRow !== null) {
                finalRow = emptyRow;
            } else {
                shouldSwap = true;
            }
        }

        if (shouldSwap && existingCard) {
            const activeCardPlaced = responses.qsort.find(c => c.statementId === selectedId);
            if (activeCardPlaced) {
                actions.swapCardsInGrid(selectedId, existingCard.statementId);
            } else {
                actions.unplaceCard(existingCard.statementId);
                actions.placeCardInGrid(selectedId, col, row);
            }
        } else {
            const activeCardPlaced = responses.qsort.find(c => c.statementId === selectedId);
            if (activeCardPlaced) {
                actions.moveCardInGrid(selectedId, col, finalRow);
            } else {
                actions.placeCardInGrid(selectedId, col, finalRow);
            }
        }
        onSelectionChange?.(null);
    }, [selectedId, responses.qsort, findClosestEmptyRow, actions, onSelectionChange]);

    return {
        activeId,
        handleDragStart,
        handleDragMove,
        handleDragEnd,
        findClosestEmptyRow,
        handleCardClick,
        handleSlotClick
    };
};
