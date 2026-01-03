/*
 * Open-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

/**
 * Fine Sort Page (Step 4)
 *
 * The core Q-Sort interface where participants drag cards into a forced distribution grid.
 * Handles complex drag-and-drop logic (dnd-kit), slot collisions, and validations.
 */

import {
    type CollisionDetection,
    closestCenter,
    DndContext,
    DragOverlay,
    KeyboardSensor,
    MeasuringStrategy,
    type Modifier,
    MouseSensor,
    pointerWithin,
    TouchSensor,
    useSensor,
    useSensors,
} from '@dnd-kit/core';
import {
    rectSortingStrategy,
    SortableContext,
    sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import type React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import GridSort from '../components/GridSort';
import SortableCard from '../components/SortableCard';
import { useFineSortDrag } from '../hooks/useFineSortDrag';
import { useGridSanity } from '../hooks/useGridSanity';
import { useLayoutAction } from '../hooks/useLayout';
import { useConfigStore } from '../store/useConfigStore';
import { useResponseStore } from '../store/useResponseStore';
import { useSessionStore } from '../store/useSessionStore';
import { useUIStore } from '../store/useUIStore';
import type { InteractionUtils } from '../types/grid';

const FineSortPage: React.FC = () => {
    // 1. Hooks (Store / Router) - Top Level
    const config = useConfigStore((state) => state.config);
    const rough = useResponseStore((state) => state.rough);
    const qsort = useResponseStore((state) => state.qsort);

    const placeCardInGrid = useResponseStore((state) => state.placeCardInGrid);
    const moveCardInGrid = useResponseStore((state) => state.moveCardInGrid);
    const swapCardsInGrid = useResponseStore((state) => state.swapCardsInGrid);
    const unplaceCard = useResponseStore((state) => state.unplaceCard);
    const resetFineSort = useResponseStore((state) => state.resetFineSort);
    const categorizeCard = useResponseStore((state) => state.categorizeCard);

    const setStep = useSessionStore((state) => state.setStep);
    const navigate = useNavigate();
    const { slug } = useParams();
    const { setHeaderAction } = useLayoutAction();
    const { t } = useTranslation();

    // 2. State & Hooks - Continuous
    const [selectedCardId, setSelectedCardId] = useState<number | null>(null);
    const [cardDimensions, setCardDimensions] = useState<{ width: number; height: number } | null>(
        null
    );
    const [zoomLevel, setZoomLevel] = useState(1);
    const [interactionUtils, setInteractionUtils] = useState<InteractionUtils | null>(null);
    const [panVersion, setPanVersion] = useState(0);

    const setSelectedCard = useUIStore((state) => state.setSelectedCard);

    useEffect(() => {
        if (!config) {
            setSelectedCard(null);
            return;
        }
        const selectedCard =
            selectedCardId !== null
                ? (config.statements.find((s) => s.id === selectedCardId) ?? null)
                : null;
        setSelectedCard(selectedCard);
    }, [selectedCardId, config, setSelectedCard]);

    // 3. Sensors (Always stable)
    const sensors = useSensors(
        useSensor(MouseSensor, { activationConstraint: { distance: 3 } }),
        useSensor(TouchSensor, {
            activationConstraint: { delay: 150, tolerance: 5 },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    // 4. Effects
    useEffect(() => {
        setStep(4);
    }, [setStep]);

    // 5. Memoized derived data
    const gridColumns = useMemo(
        () =>
            config?.grid_config || [
                { score: -4, capacity: 2 },
                { score: -3, capacity: 3 },
                { score: -2, capacity: 4 },
                { score: -1, capacity: 6 },
                { score: 0, capacity: 10 },
                { score: 1, capacity: 6 },
                { score: 2, capacity: 4 },
                { score: 3, capacity: 3 },
                { score: 4, capacity: 2 },
            ],
        [config?.grid_config]
    );

    const { unplacedAgree, unplacedDisagree, unplacedNeutral, isAllPlaced } = useMemo(() => {
        const placedIds = new Set(qsort.map((c) => c.statementId));
        const statements = config?.statements || [];

        const unplacedAgree = rough.agree
            .filter((id) => !placedIds.has(id))
            .map((id) => statements.find((s) => s.id === id))
            .filter((s): s is NonNullable<typeof s> => !!s);

        const unplacedDisagree = rough.disagree
            .filter((id) => !placedIds.has(id))
            .map((id) => statements.find((s) => s.id === id))
            .filter((s): s is NonNullable<typeof s> => !!s);

        const unplacedNeutral = rough.neutral
            .filter((id) => !placedIds.has(id))
            .map((id) => statements.find((s) => s.id === id))
            .filter((s): s is NonNullable<typeof s> => !!s);

        const isAllPlaced =
            unplacedAgree.length === 0 &&
            unplacedDisagree.length === 0 &&
            unplacedNeutral.length === 0;

        return { unplacedAgree, unplacedDisagree, unplacedNeutral, isAllPlaced };
    }, [qsort, rough, config?.statements]);

    useEffect(() => {
        setHeaderAction(null);
        return () => setHeaderAction(null);
    }, [setHeaderAction]);

    // 6. Memoized callbacks for performance
    const actions = useMemo(
        () => ({
            placeCardInGrid,
            moveCardInGrid,
            swapCardsInGrid,
            unplaceCard,
            categorizeCard,
        }),
        [placeCardInGrid, moveCardInGrid, swapCardsInGrid, unplaceCard, categorizeCard]
    );

    const handlePan = useCallback(() => setPanVersion((v) => v + 1), []);

    // DnD Hooks
    const {
        activeId,
        handleDragStart,
        handleDragMove,
        handleDragEnd,
        handleCardClick,
        handleSlotClick,
    } = useFineSortDrag({
        responses: { qsort },
        gridColumns,
        onSelectionChange: setSelectedCardId,
        selectedId: selectedCardId,
        interactionUtils,
        onPan: handlePan,
        statements: config?.statements || [],
        actions,
    });

    const handleDragCancel = useCallback(() => {
        // No-op for now as hook doesn't expose cancel handler
        // Ideally we should reset activeId in hook
    }, []);

    // RECONCILIATION: Recover missing cards into Neutral deck
    useEffect(() => {
        if (!config || !qsort || !rough) return;

        const allStatementIds = config.statements.map((s) => s.id);
        const placedIds = qsort.map((p) => p.statementId);
        const roughIds = [...rough.agree, ...rough.neutral, ...rough.disagree];

        const missingIds = allStatementIds.filter(
            (id) => !placedIds.includes(id) && !roughIds.includes(id)
        );

        if (missingIds.length > 0) {
            console.warn('Reconciling missing cards:', missingIds);
            // Add missing cards to Neutral by default
            missingIds.forEach((id) => {
                actions.categorizeCard(id, 'neutral');
            });
        }
    }, [config, qsort, rough, actions]);

    // SANITY CHECK: Ensure no overlapping cards or out-of-bounds cards
    useGridSanity({
        qsort,
        gridColumns,
        unplaceCard: actions.unplaceCard,
        categorizeCard: actions.categorizeCard,
    });

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && selectedCardId !== null) {
                setSelectedCardId(null);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedCardId]);

    // 7. Collision Strategy (Stable)
    const collisionStrategy: CollisionDetection = useCallback(
        (args) => {
            // 1. Priority: Direct hit via pointerWithin (uses cached rects, efficient)
            const pointerCollisions = pointerWithin(args);

            // Check for direct slot or deck hit
            const targetContainer = pointerCollisions.find((c) => {
                const idStr = String(c.id);
                return idStr.startsWith('slot_') || idStr.startsWith('deck-');
            });

            if (targetContainer) return [targetContainer];

            // 2. Secondary: Hit on a placed card? Resolve to its slot.
            const cardCollision = pointerCollisions.find((c) => {
                // Check if it's a card ID (number)
                return typeof c.id === 'number' || !Number.isNaN(Number(c.id));
            });

            if (cardCollision) {
                const cardId = Number(cardCollision.id);
                const placed = qsort.find((p) => p.statementId === cardId);
                if (placed) {
                    // Return a synthetic collision with the slot ID
                    return [{ id: `slot_${placed.col}_${placed.row}`, data: cardCollision.data }];
                }
            }

            // 3. Fallback to closest center
            return closestCenter(args);
        },
        [qsort]
    );

    // 9. Memoized render function for slot content
    const showCodes = config?.show_statement_codes ?? false;

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
                        onClick={() => handleCardClick(statement.id)}
                        dimensions={dimensions}
                        disableHoverZoom={
                            activeId !== null ||
                            (typeof window !== 'undefined' && window.innerWidth < 1024)
                        }
                    />
                );
            }
            return null;
        },
        [config, qsort, selectedCardId, handleCardClick, activeId, showCodes]
    );

    // 10. Condition Check (After all hooks)
    const snapCenterToCursor: Modifier = useCallback(
        ({ activatorEvent, draggingNodeRect, transform }) => {
            if (draggingNodeRect && activatorEvent) {
                const activatorCenter = {
                    x: draggingNodeRect.left + draggingNodeRect.width / 2,
                    y: draggingNodeRect.top + draggingNodeRect.height / 2,
                };
                const event =
                    'nativeEvent' in activatorEvent ? activatorEvent.nativeEvent : activatorEvent;
                const eventX =
                    event instanceof MouseEvent || event instanceof PointerEvent
                        ? event.clientX
                        : event instanceof TouchEvent
                          ? event.touches[0].clientX
                          : 0;
                const eventY =
                    event instanceof MouseEvent || event instanceof PointerEvent
                        ? event.clientY
                        : event instanceof TouchEvent
                          ? event.touches[0].clientY
                          : 0;
                return {
                    ...transform,
                    x: transform.x + (eventX - activatorCenter.x),
                    y: transform.y + (eventY - activatorCenter.y),
                };
            }
            return transform;
        },
        []
    );

    const handleTransformChange = useCallback(() => setPanVersion((v) => v + 1), []);
    const handleReset = useCallback(() => {
        if (window.confirm(t('fine.deck.confirm_reset'))) resetFineSort();
    }, [resetFineSort, t]);
    const handleValidate = useCallback(
        () => navigate(`/study/${slug}/post-sort`),
        [navigate, slug]
    );

    if (!config) return null;

    // 11. Memoized card data - these need to be after config null check
    const activeCardData =
        activeId !== null ? config?.statements.find((s) => s.id === activeId) : undefined;

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
                    <GridSort
                        agreeCards={unplacedAgree}
                        disagreeCards={unplacedDisagree}
                        neutralCards={unplacedNeutral}
                        gridColumns={gridColumns}
                        renderSlotContent={renderSlotContent}
                        disableHoverZoom={activeId !== null}
                        selectedCardId={selectedCardId}
                        onCardClick={handleCardClick}
                        onSlotClick={handleSlotClick}
                        onDimensionsChange={setCardDimensions}
                        onReset={handleReset}
                        onZoomChange={setZoomLevel}
                        onTransformChange={handleTransformChange}
                        onInteractionUtils={setInteractionUtils}
                        isAllPlaced={isAllPlaced}
                        onValidate={handleValidate}
                        showCodes={showCodes}
                    />
                </SortableContext>
            </div>
            {createPortal(
                <DragOverlay
                    dropAnimation={{ duration: 250, easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)' }}
                >
                    {activeCardData ? (
                        <div
                            className="pointer-events-none"
                            style={{ transform: `scale(${zoomLevel})`, transformOrigin: 'center' }}
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
