/*
 * Open-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import type { DragStartEvent, DragEndEvent, DragMoveEvent } from '@dnd-kit/core';
import React, { useState, useCallback, useRef } from 'react';

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

export interface InteractionUtils {
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
    contentRef: React.RefObject<HTMLDivElement>;
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
}

export const useFineSortDrag = ({
    responses,
    gridColumns,
    actions,
    onSelectionChange,
    selectedId,
    interactionUtils,
    onPan
}: UseFineSortDragProps) => {
    const [activeId, setActiveId] = useState<number | null>(null);
    
    // Advanced Drag Interaction Refs
    const lastPos = useRef({ x: 0, y: 0 });
    const dwellTimer = useRef<NodeJS.Timeout | null>(null);
    const panInterval = useRef<NodeJS.Timeout | null>(null);
    const panSpeed = useRef({ dx: 0, dy: 0 });

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

        const wrapper = interactionUtils.wrapperRef.current;
        if (!wrapper) return;

        const rect = wrapper.getBoundingClientRect();
        const edgeThreshold = 60;
        const maxPanSpeed = 15;

        let dx = 0;
        let dy = 0;

        // Calculate dynamic speed based on proximity to edge
        if (x < rect.left + edgeThreshold) {
            dx = maxPanSpeed * Math.min((rect.left + edgeThreshold - x) / edgeThreshold, 1);
        } else if (x > rect.right - edgeThreshold) {
            dx = -maxPanSpeed * Math.min((x - (rect.right - edgeThreshold)) / edgeThreshold, 1);
        }

        if (y < rect.top + edgeThreshold) {
            dy = maxPanSpeed * Math.min((rect.top + edgeThreshold - y) / edgeThreshold, 1);
        } else if (y > rect.bottom - edgeThreshold) {
            dy = -maxPanSpeed * Math.min((y - (rect.bottom - edgeThreshold)) / edgeThreshold, 1);
        }

        panSpeed.current = { dx, dy };

        if (dx !== 0 || dy !== 0) {
            if (!panInterval.current) {
                panInterval.current = setInterval(() => {
                    const transform = interactionUtils.transformRef.current;
                    const content = interactionUtils.contentRef.current;
                    const wrapper = interactionUtils.wrapperRef.current;
                    
                    if (transform && content && wrapper) {
                        const state = transform.instance.transformState;
                        const scale = state.scale;
                        const { dx: currentDx, dy: currentDy } = panSpeed.current;
                        
                        // 3. Dynamic speed factor if outside grid (Check inside interval)
                        let speedFactor = 1.0;
                        const gridEl = document.querySelector('[data-testid="grid-container"]');
                        if (gridEl) {
                            const gridRect = gridEl.getBoundingClientRect();
                            const { x: curX, y: curY } = lastPos.current; // Use latest pointer pos
                            if (curX < gridRect.left || curX > gridRect.right || curY < gridRect.top || curY > gridRect.bottom) {
                                speedFactor = 0.3; // Reduce speed outside grid
                            }
                        }

                        const effectiveDx = currentDx * speedFactor;
                        const effectiveDy = currentDy * speedFactor;

                        const contentW = content.offsetWidth * scale;
                        const contentH = content.offsetHeight * scale;
                        const wrapperW = wrapper.clientWidth;
                        const wrapperH = wrapper.clientHeight;
                        
                        const minX = wrapperW - contentW - (wrapperW * 0.2);
                        const maxX = wrapperW * 0.2;
                        const minY = wrapperH - contentH - (wrapperH * 0.2);
                        const maxY = wrapperH * 0.2;
                        
                        const newX = Math.max(minX, Math.min(maxX, state.positionX + effectiveDx));
                        const newY = Math.max(minY, Math.min(maxY, state.positionY + effectiveDy));

                        if (newX !== state.positionX || newY !== state.positionY) {
                            transform.setTransform(newX, newY, scale, 0);
                            onPan?.();
                        } else {
                            stopPan();
                        }
                    }
                }, 16); 
            }
        }
 else {
            stopPan();
        }
    }, [interactionUtils, stopPan, onPan]);

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
        let overIdString = String(over.id);

        // If dropped on another card, resolve to its slot
        if (!overIdString.startsWith('slot_')) {
            const cardIdAtOver = over.id as number;
            const placedCard = responses.qsort.find(c => c.statementId === cardIdAtOver);
            if (placedCard) {
                overIdString = `slot_${placedCard.col}_${placedCard.row}`;
            }
        }

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
    }, [responses.qsort, findClosestEmptyRow, actions, stopPan]);

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
