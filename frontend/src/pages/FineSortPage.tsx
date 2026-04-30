/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

/**
 * Fine Sort Page (Step 4)
 *
 * Declarative shell — all durable logic lives in useFineSort().
 *
 * Visual/layout state that stays in the component (cannot cleanly move to hook):
 *   - cardDimensions, zoomLevel  — used only by DragOverlay sizing
 *   - interactionUtils           — a callback bag returned by GridSort for mobile pan/zoom,
 *                                  passed back into useFineSort as a param
 */

import { DndContext, DragOverlay, MeasuringStrategy } from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy } from '@dnd-kit/sortable';
import { useViewport } from '@/contexts/ViewportContext';
import type React from 'react';
import { useCallback, useState } from 'react';
import { createPortal } from 'react-dom';

import GridSort from '../components/GridSort';
import SortableCard from '../components/SortableCard';
import { useFineSort } from '../hooks/participant/useFineSort';
import type { InteractionUtils } from '../types/grid';

interface FineSortPageProps {
    highlightKey?: string | null;
}

const FineSortPage: React.FC<FineSortPageProps> = ({ highlightKey }) => {
    // JSX-local visual state (cannot live in the hook — no JSX in hooks)
    const [cardDimensions, setCardDimensions] = useState<{ width: number; height: number } | null>(
        null
    );
    const [zoomLevel, setZoomLevel] = useState(1);
    const [interactionUtils, setInteractionUtils] = useState<InteractionUtils | null>(null);

    const { isDesktop } = useViewport();

    // All durable logic delegated to the hook
    const sort = useFineSort(interactionUtils);

    const {
        config,
        gridColumns,
        qsort,
        unplaced,
        isAllPlaced,
        showCodes,
        distributionMode,
        selectedCardId,
        sensors,
        activeId,
        collisionStrategy,
        snapCenterToCursor,
        handleDragStart,
        handleDragMove,
        handleDragEnd,
        handleDragCancel,
        handleCardClick,
        handleSlotClick,
        handleReset,
        handleValidate,
    } = sort;

    // renderSlotContent stays here because it references JSX (SortableCard) and
    // JSX-local state (selectedCardId, activeId, isDesktop, cardDimensions).
    const renderSlotContent = useCallback(
        (col: number, row: number, dimensions: { width: number; height: number }) => {
            if (!config) return null;
            const cardInSlot = qsort.find((c) => c.col === col && c.row === row);
            const statement = cardInSlot
                ? config.statements.find((s) => s.id === cardInSlot.statementId)
                : null;
            if (statement) {
                return (
                    <SortableCard
                        id={statement.id}
                        text={statement.text}
                        code={showCodes ? statement.code : undefined}
                        isSelected={selectedCardId === statement.id}
                        onAction={handleCardClick}
                        dimensions={dimensions}
                        disableHoverZoom={activeId !== null || !isDesktop}
                    />
                );
            }
            return null;
        },
        [config, qsort, selectedCardId, handleCardClick, activeId, showCodes, isDesktop]
    );

    if (!config) return null;

    const activeCardData =
        activeId !== null ? config.statements.find((s) => s.id === activeId) : undefined;

    // Props shared by both GridSort branches (rough mode vs deck mode).
    // The two branches differ only in how the unplaced cards are partitioned:
    // rough → agree/disagree/neutral piles; deck → a single flat `deckCards`.
    const sharedGridProps = {
        gridColumns,
        renderSlotContent,
        conditionOfInstruction: config.condition_of_instruction,
        disableHoverZoom: activeId !== null,
        selectedCardId,
        onCardClick: handleCardClick,
        onSlotClick: handleSlotClick,
        onDimensionsChange: setCardDimensions,
        onReset: handleReset,
        onZoomChange: setZoomLevel,
        onInteractionUtils: setInteractionUtils,
        isAllPlaced,
        onValidate: handleValidate,
        showCodes,
        distributionMode,
        highlightKey,
        uiLabels: config.ui_labels,
    };

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={collisionStrategy}
            onDragStart={handleDragStart}
            onDragMove={handleDragMove}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
            autoScroll={false}
            measuring={{
                droppable: {
                    strategy: MeasuringStrategy.WhileDragging,
                },
            }}
            modifiers={[snapCenterToCursor]}
        >
            <div className="h-full overflow-hidden">
                <SortableContext
                    items={config.statements.map((s) => s.id)}
                    strategy={rectSortingStrategy}
                >
                    {unplaced.mode === 'rough' ? (
                        <GridSort
                            {...sharedGridProps}
                            agreeCards={unplaced.agree}
                            disagreeCards={unplaced.disagree}
                            neutralCards={unplaced.neutral}
                        />
                    ) : (
                        <GridSort
                            {...sharedGridProps}
                            agreeCards={[]}
                            disagreeCards={[]}
                            neutralCards={[]}
                            deckCards={unplaced.deck}
                        />
                    )}
                </SortableContext>
            </div>
            {createPortal(
                <DragOverlay
                    dropAnimation={{
                        duration: 250,
                        easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)',
                    }}
                >
                    {activeCardData ? (
                        <div
                            className="pointer-events-none"
                            style={{
                                transform: `scale(${zoomLevel})`,
                                transformOrigin: 'center',
                            }}
                        >
                            <SortableCard
                                id={activeCardData.id}
                                text={activeCardData.text}
                                code={showCodes ? activeCardData.code : undefined}
                                isOverlay
                                dimensions={cardDimensions || undefined}
                                aspectRatio={
                                    cardDimensions
                                        ? cardDimensions.width / cardDimensions.height
                                        : undefined
                                }
                            />
                        </div>
                    ) : null}
                </DragOverlay>,
                document.body
            )}
        </DndContext>
    );
};

export default FineSortPage;
