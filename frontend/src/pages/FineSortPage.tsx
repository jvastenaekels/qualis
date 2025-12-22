/*
 * Open-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import React, { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { 
    DndContext, 
    DragOverlay, 
    useSensors, 
    useSensor, 
    PointerSensor, 
    TouchSensor, 
    closestCenter,
    MeasuringStrategy,
    type CollisionDetection,
    type Modifier,
    pointerWithin
} from '@dnd-kit/core';
import { useNavigate, useParams } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { useConfigStore } from '../store/useConfigStore';
import { useResponseStore } from '../store/useResponseStore';
import { useSessionStore } from '../store/useSessionStore';
import { useUIStore } from '../store/useUIStore';
import { useLayoutAction } from '../contexts/LayoutContext';
import { Check } from 'lucide-react';
import GridSort from '../components/GridSort';
import SortableCard from '../components/SortableCard';
import { useFineSortDrag, type InteractionUtils } from '../hooks/useFineSortDrag';

const FineSortPage: React.FC = () => {
    // 1. Hooks (Store / Router) - Top Level
    const config = useConfigStore((state) => state.config);
    const responses = useResponseStore((state) => ({ 
        rough: state.rough, 
        qsort: state.qsort 
    }));
    const { 
        placeCardInGrid, 
        moveCardInGrid, 
        swapCardsInGrid, 
        unplaceCard,
        resetFineSort
    } = useResponseStore();
    
    const setStep = useSessionStore((state) => state.setStep);
    const setZoomedCard = useUIStore((state) => state.setZoomedCard);
    const navigate = useNavigate();
    const { slug } = useParams();
    const { setHeaderAction } = useLayoutAction();
    const { t } = useTranslation();

    // 2. State & Hooks - Continuous
    const [selectedCardId, setSelectedCardId] = useState<number | null>(null);
    const [cardDimensions, setCardDimensions] = useState<{ width: number, height: number } | null>(null);
    const [zoomLevel, setZoomLevel] = useState(1);
    const [interactionUtils, setInteractionUtils] = useState<InteractionUtils | null>(null);
    const [panVersion, setPanVersion] = useState(0);

    // 3. Sensors (Always stable)
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(TouchSensor, { 
            activationConstraint: { delay: 150, tolerance: 10 } 
        })
    );

    // 4. Effects
    useEffect(() => {
        setStep(4);
    }, [setStep]);

    // 5. Collision Strategy (Stable)
    const collisionStrategy: CollisionDetection = useCallback((args) => {
        const { pointerCoordinates } = args;
        if (!pointerCoordinates) return [];

        // 1. Element at point (Viewport accurate)
        const elAtPoint = document.elementFromPoint(pointerCoordinates.x, pointerCoordinates.y);
        let resolvedPointId: string | null = null;
        
        if (elAtPoint) {
            let curr = elAtPoint as HTMLElement;
            while (curr && curr !== document.body) {
                const id = curr.getAttribute('id') || curr.dataset.testid;
                if (id && id.startsWith('slot_')) {
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
            const cardId = cardIdMatch ? parseInt(cardIdMatch[1]) : parseInt(idString);
            
            if (!isNaN(cardId)) {
                const placed = responses.qsort.find(p => p.statementId === cardId);
                return placed ? `slot_${placed.col}_${placed.row}` : null;
            }
            return null;
        };

        if (elAtPoint) {
            let curr = elAtPoint as HTMLElement;
            while (curr && curr !== document.body) {
                const id = curr.getAttribute('id') || curr.dataset.testid;
                if (id && id.startsWith('slot_')) {
                    resolvedPointId = id;
                    break;
                }
                curr = curr.parentElement as HTMLElement;
            }
        }

        if (resolvedPointId) return [{ id: resolvedPointId }];

        // 2. Fallbacks
        const pointerCollisions = pointerWithin(args);
        const collisions = pointerCollisions.length > 0 ? pointerCollisions : closestCenter(args);
        return collisions
            .map(c => {
                const slotId = resolveToSlot(c.id);
                return slotId ? { ...c, id: slotId } : null;
            })
            .filter((c): c is NonNullable<typeof c> => c !== null);
    }, [responses.qsort]);

    // 6. Action Handling Logic
    const gridColumns = config?.grid_config || [
        { score: -4, capacity: 2 }, { score: -3, capacity: 3 }, { score: -2, capacity: 4 },
        { score: -1, capacity: 6 }, { score: 0,  capacity: 10 }, { score: 1,  capacity: 6 },
        { score: 2,  capacity: 4 }, { score: 3,  capacity: 3 }, { score: 4,  capacity: 2 },
    ];


    const placedIds = new Set(responses.qsort.map(c => c.statementId));
    const unplacedAgree = responses.rough.agree.filter(id => !placedIds.has(id)).map(id => config?.statements.find(s => s.id === id)).filter((s): s is NonNullable<typeof s> => !!s);
    const unplacedDisagree = responses.rough.disagree.filter(id => !placedIds.has(id)).map(id => config?.statements.find(s => s.id === id)).filter((s): s is NonNullable<typeof s> => !!s);
    const unplacedNeutral = responses.rough.neutral.filter(id => !placedIds.has(id)).map(id => config?.statements.find(s => s.id === id)).filter((s): s is NonNullable<typeof s> => !!s);
    const isAllPlaced = unplacedAgree.length === 0 && unplacedDisagree.length === 0 && unplacedNeutral.length === 0;

    useEffect(() => {
        if (!isAllPlaced) { setHeaderAction(null); return; }
        const actionNode = (
            <button
                onClick={() => navigate(`/study/${slug}/post-sort`)}
                className="flex items-center gap-2 px-6 py-3 rounded-lg font-bold text-sm bg-green-600 text-white hover:bg-green-700 shadow-lg hover:shadow-xl transform transition-all duration-300 animate-pulse w-full md:w-auto justify-center"
            >
                {t('fine.actions.validate')} <Check size={18} strokeWidth={3} />
            </button>
        );
        setHeaderAction(actionNode);
        return () => setHeaderAction(null);
    }, [isAllPlaced, navigate, slug, setHeaderAction, t]);

    // 7. Drag Hook
    const { 
        activeId, 
        handleDragStart, 
        handleDragMove,
        handleDragEnd, 
        handleCardClick, 
        handleSlotClick 
    } = useFineSortDrag({
        responses,
        gridColumns,
        actions: { placeCardInGrid, moveCardInGrid, swapCardsInGrid, unplaceCard, setZoomedCard },
        onSelectionChange: setSelectedCardId,
        selectedId: selectedCardId,
        interactionUtils,
        onPan: () => setPanVersion(v => v + 1)
    });

    // 8. Condition Check (After all hooks)
    if (!config) return null;

    const activeCardData = config.statements.find(s => s.id === activeId);

    const renderSlotContent = (col: number, row: number, dimensions: { width: number, height: number }) => {
         const cardInSlot = responses.qsort.find(c => c.col === col && c.row === row);
         const statement = cardInSlot ? config.statements.find(s => s.id === cardInSlot.statementId) : null;
         if (statement) {
             return (
                <SortableCard 
                    id={statement.id} 
                    text={statement.text} 
                    isSelected={selectedCardId === statement.id}
                    onClick={() => handleCardClick(statement.id)}
                    dimensions={dimensions}
                    disableHoverZoom={activeId !== null || (typeof window !== 'undefined' && window.innerWidth < 1024)}
                />
            );
         }
         return null;
    };

    const snapCenterToCursor: Modifier = ({ activatorEvent, draggingNodeRect, transform }) => {
        if (draggingNodeRect && activatorEvent) {
            const activatorCenter = {
                x: draggingNodeRect.left + draggingNodeRect.width / 2,
                y: draggingNodeRect.top + draggingNodeRect.height / 2,
            };
            const event = 'nativeEvent' in activatorEvent ? activatorEvent.nativeEvent : activatorEvent;
            const eventX = event instanceof MouseEvent || event instanceof PointerEvent ? event.clientX : (event instanceof TouchEvent ? event.touches[0].clientX : 0);
            const eventY = event instanceof MouseEvent || event instanceof PointerEvent ? event.clientY : (event instanceof TouchEvent ? event.touches[0].clientY : 0);
            return {
                ...transform,
                x: transform.x + (eventX - activatorCenter.x),
                y: transform.y + (eventY - activatorCenter.y),
            };
        }
        return transform;
    };

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
                    frequency: panVersion
                },
            }}
            modifiers={[snapCenterToCursor]}
        >
             <div className="h-full overflow-hidden">
                <GridSort 
                    agreeCards={unplacedAgree} disagreeCards={unplacedDisagree} neutralCards={unplacedNeutral}
                    gridColumns={gridColumns}
                    renderSlotContent={renderSlotContent}
                    forcedTipsClosed={responses.qsort.length >= 5}
                    disableHoverZoom={activeId !== null}
                    selectedCardId={selectedCardId}
                    onCardClick={handleCardClick}
                    onSlotClick={handleSlotClick}
                    onDimensionsChange={setCardDimensions}
                    onReset={() => { if (window.confirm(t('fine.deck.confirm_reset'))) resetFineSort(); }}
                    onZoomChange={setZoomLevel}
                    onTransformChange={() => setPanVersion(v => v + 1)}
                    onInteractionUtils={setInteractionUtils}
                />
             </div>
             {createPortal(
                <DragOverlay dropAnimation={{ duration: 250, easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)' }}>
                    {activeCardData ? (
                        <div className="pointer-events-none" style={{ transform: `scale(${zoomLevel})`, transformOrigin: 'center' }}>
                            <SortableCard 
                                id={activeCardData.id} text={activeCardData.text} isOverlay 
                                dimensions={cardDimensions || undefined}
                                aspectRatio={cardDimensions ? cardDimensions.width / cardDimensions.height : undefined}
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
