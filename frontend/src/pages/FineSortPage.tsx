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
import { useLayoutAction } from '../hooks/useLayout';
import { useConfigStore } from '../store/useConfigStore';
import { useResponseStore } from '../store/useResponseStore';
import { useSessionStore } from '../store/useSessionStore';
import { useUIStore } from '../store/useUIStore';
import type { InteractionUtils } from '../types/grid';

const FineSortPage: React.FC = () => {
    // 1. Hooks (Store / Router) - Top Level
    const config = useConfigStore((state) => state.config);
    const responses = useResponseStore((state) => ({
        rough: state.rough,
        qsort: state.qsort,
    }));
    const { placeCardInGrid, moveCardInGrid, swapCardsInGrid, unplaceCard, resetFineSort } =
        useResponseStore();

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
        useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
        useSensor(TouchSensor, {
            activationConstraint: { delay: 250, tolerance: 5 },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    // 4. Effects
    useEffect(() => {
        setStep(4);
    }, [setStep]);

    // Handle Escape to deselect
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && selectedCardId !== null) {
                setSelectedCardId(null);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedCardId]);

    // 5. Collision Strategy (Stable)
    const collisionStrategy: CollisionDetection = useCallback(
        (args) => {
            const { pointerCoordinates } = args;
            if (!pointerCoordinates) return [];

            // 1. Element at point (Viewport accurate)
            const elAtPoint = document.elementFromPoint(pointerCoordinates.x, pointerCoordinates.y);
            let resolvedPointId: string | null = null;

            if (elAtPoint) {
                let curr = elAtPoint as HTMLElement;
                while (curr && curr !== document.body) {
                    const id = curr.getAttribute('id') || curr.dataset.testid;
                    if (id?.startsWith('slot_')) {
                        resolvedPointId = id;
                        break;
                    }
                    curr = curr.parentElement as HTMLElement;
                }
            }

            const resolveToSlot = (id: string | number) => {
                const idString = String(id);
                if (idString.startsWith('slot_')) return idString;

                // Handle card-ID format (from data-testid)
                const cardIdMatch = idString.match(/^card-(\d+)$/);
                const cardId = cardIdMatch ? parseInt(cardIdMatch[1], 10) : parseInt(idString, 10);

                if (!Number.isNaN(cardId)) {
                    const placed = responses.qsort.find((p) => p.statementId === cardId);
                    return placed ? `slot_${placed.col}_${placed.row}` : null;
                }
                return null;
            };

            if (resolvedPointId) return [{ id: resolvedPointId }];

            // 2. Fallbacks
            const pointerCollisions = pointerWithin(args);
            const collisions =
                pointerCollisions.length > 0 ? pointerCollisions : closestCenter(args);
            return collisions
                .map((c) => {
                    const slotId = resolveToSlot(c.id);
                    return slotId ? { ...c, id: slotId } : null;
                })
                .filter((c): c is NonNullable<typeof c> => c !== null);
        },
        [responses.qsort]
    );

    // 6. Memoized derived data
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
        const placedIds = new Set(responses.qsort.map((c) => c.statementId));
        const statements = config?.statements || [];

        const unplacedAgree = responses.rough.agree
            .filter((id) => !placedIds.has(id))
            .map((id) => statements.find((s) => s.id === id))
            .filter((s): s is NonNullable<typeof s> => !!s);

        const unplacedDisagree = responses.rough.disagree
            .filter((id) => !placedIds.has(id))
            .map((id) => statements.find((s) => s.id === id))
            .filter((s): s is NonNullable<typeof s> => !!s);

        const unplacedNeutral = responses.rough.neutral
            .filter((id) => !placedIds.has(id))
            .map((id) => statements.find((s) => s.id === id))
            .filter((s): s is NonNullable<typeof s> => !!s);

        const isAllPlaced =
            unplacedAgree.length === 0 &&
            unplacedDisagree.length === 0 &&
            unplacedNeutral.length === 0;

        return { unplacedAgree, unplacedDisagree, unplacedNeutral, isAllPlaced };
    }, [responses.qsort, responses.rough, config?.statements]);

    useEffect(() => {
        setHeaderAction(null);
        return () => setHeaderAction(null);
    }, [setHeaderAction]);

    // 7. Memoized callbacks for performance
    const actions = useMemo(
        () => ({
            placeCardInGrid,
            moveCardInGrid,
            swapCardsInGrid,
            unplaceCard,
        }),
        [placeCardInGrid, moveCardInGrid, swapCardsInGrid, unplaceCard]
    );

    const handlePan = useCallback(() => setPanVersion((v) => v + 1), []);

    // 8. Drag Hook
    const {
        activeId,
        handleDragStart,
        handleDragMove,
        handleDragEnd,
        handleCardClick,
        handleSlotClick,
    } = useFineSortDrag({
        responses,
        gridColumns,
        actions,
        onSelectionChange: setSelectedCardId,
        selectedId: selectedCardId,
        interactionUtils,
        onPan: handlePan,
        statements: config?.statements || [],
    });

    // 9. Memoized render function for slot content
    const showCodes = config?.show_statement_codes ?? false;

    const renderSlotContent = useCallback(
        (col: number, row: number, dimensions: { width: number; height: number }) => {
            if (!config) return null;
            const cardInSlot = responses.qsort.find((c) => c.col === col && c.row === row);
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
        [config, responses.qsort, selectedCardId, handleCardClick, activeId, showCodes]
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
            autoScroll={false}
            measuring={{
                droppable: {
                    strategy: MeasuringStrategy.Always,
                    frequency: panVersion,
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
