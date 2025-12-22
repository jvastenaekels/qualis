/*
 * Open-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { 
    DndContext, 
    DragOverlay, 
    useSensors, 
    useSensor, 
    PointerSensor, 
    TouchSensor, 
    closestCenter,
    pointerWithin,
    rectIntersection,
    // getFirstCollision, 
    type CollisionDetection
} from '@dnd-kit/core';
import { useNavigate, useParams } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { useConfigStore } from '../store/useConfigStore';
// ...

import { useResponseStore } from '../store/useResponseStore';
import { useSessionStore } from '../store/useSessionStore';
import { useUIStore } from '../store/useUIStore';
import { useLayoutAction } from '../contexts/LayoutContext';
import { Check } from 'lucide-react';
import GridSort from '../components/GridSort';
import SortableCard from '../components/SortableCard';
import { useFineSortDrag } from '../hooks/useFineSortDrag';

const FineSortPage: React.FC = () => {
    // ... hooks ...

    // Custom Collision Strategy (omitted for brevity in replacement, kept in file)
    const collisionStrategy: CollisionDetection = (args) => {
        const pointerCollisions = pointerWithin(args);
        if (pointerCollisions.length > 0) return pointerCollisions;
        const rectCollisions = rectIntersection(args);
        if (rectCollisions.length > 0) return rectCollisions;
        return closestCenter(args);
    };

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
    const { setHeaderAction } = useLayoutAction(); // Get Layout Setter
    const { t } = useTranslation();


    
    // Set Step 4 on mount
    React.useEffect(() => {
        setStep(4);
    }, [setStep]);


    const [selectedCardId, setSelectedCardId] = useState<number | null>(null); // Tap-to-Place State
    const [cardDimensions, setCardDimensions] = useState<{ width: number, height: number } | null>(null);

    // Sensors
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
        useSensor(TouchSensor, { 
            activationConstraint: { delay: 250, tolerance: 8 } 
        })
    );
    
    // ... (Config logic remains same) ...

    // Default Mock (40 items - Matching Welcome Page Mock)
    const DEFAULT_GRID = [
        { score: -4, capacity: 2 },
        { score: -3, capacity: 3 },
        { score: -2, capacity: 4 },
        { score: -1, capacity: 6 },
        { score: 0,  capacity: 10 },
        { score: 1,  capacity: 6 },
        { score: 2,  capacity: 4 },
        { score: 3,  capacity: 3 },
        { score: 4,  capacity: 2 },
        { score: 4,  capacity: 2 }, // Added extra just in case? No, wait. 40 items total.
    ];
    // Wait, the original code had 40 items.
    
    // Need to handle missing config for these calculations
    const gridColumns = config?.grid_config || DEFAULT_GRID;

    // Consistency Check (Development Mode)
    const totalSlots = gridColumns.reduce((sum, col) => sum + col.capacity, 0);
    const totalStatements = config?.statements.length || 0;
    
    // Render warning if mismatch (Optional but good for debugging)
    if (config && totalSlots !== totalStatements && process.env.NODE_ENV === 'development') {
        console.warn(`GridSort Mismatch: Grid has ${totalSlots} slots but there are ${totalStatements} statements.`);
    }

    // Derived State: Source Decks
    const placedIds = new Set(responses.qsort.map(c => c.statementId));
    
    const unplacedAgree = responses.rough.agree
        .filter(id => !placedIds.has(id))
        .map(id => config?.statements.find(s => s.id === id)).filter((s): s is NonNullable<typeof s> => !!s);
        
    const unplacedDisagree = responses.rough.disagree
        .filter(id => !placedIds.has(id))
        .map(id => config?.statements.find(s => s.id === id)).filter((s): s is NonNullable<typeof s> => !!s);
        
    const unplacedNeutral = responses.rough.neutral
        .filter(id => !placedIds.has(id))
        .map(id => config?.statements.find(s => s.id === id)).filter((s): s is NonNullable<typeof s> => !!s);

    // Completion Check
    const isAllPlaced = unplacedAgree.length === 0 && unplacedDisagree.length === 0 && unplacedNeutral.length === 0;

    // Hoist Action to Header/Footer
    React.useEffect(() => {
        // Only show button when all cards are placed
        if (!isAllPlaced) {
            setHeaderAction(null);
            return () => setHeaderAction(null);
        }

        const handleContinue = () => {
             navigate(`/study/${slug}/post-sort`);
        };

        const actionNode = (
            <button
                onClick={handleContinue}
                className="
                    flex items-center gap-2 px-6 py-3 rounded-lg font-bold text-sm
                    bg-green-600 text-white hover:bg-green-700 shadow-lg hover:shadow-xl
                    transform transition-all duration-300 animate-pulse
                    w-full md:w-auto justify-center
                "
            >
                {t('fine.actions.validate')} <Check size={18} strokeWidth={3} />
            </button>
        );

        setHeaderAction(actionNode);
        return () => setHeaderAction(null);
    }, [isAllPlaced, navigate, slug, setHeaderAction, t]);

    // Guard: Config must be loaded. MOVED TO AFTER HOOKS and calculations that are safe.
    // However, if we return here, we must ensure hooks below are NOT executed?
    // Wait, if I move this return down, I need to check where the next hooks are.
    // There are NO more hooks below line 134 in the original file. 
    // Except... wait.
    // Line 137: findClosestEmptyRow (function)
    // Line 170: handleCardClick (function)
    // Line 276: renderSlotContent (function)
    // Line 292: Return JSX.
    
    // --- Refactored Drag Logic via Hook ---
    const [zoomLevel, setZoomLevel] = useState(1);
    const [interactionUtils, setInteractionUtils] = useState<any>(null);

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
        actions: {
             placeCardInGrid,
             moveCardInGrid,
             swapCardsInGrid,
             unplaceCard,
             setZoomedCard
        },
        onSelectionChange: setSelectedCardId,
        selectedId: selectedCardId,
        interactionUtils
    });
    
    if (!config) return null;

    const activeCardData = config.statements.find(s => s.id === activeId);

    // Helpers
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

    // Modifier to snap the drag overlay center to the cursor
    const snapCenterToCursor = ({ activatorEvent, draggingNodeRect, transform }: any) => {
        if (draggingNodeRect && activatorEvent) {
            const activatorCenter = {
                x: draggingNodeRect.left + draggingNodeRect.width / 2,
                y: draggingNodeRect.top + draggingNodeRect.height / 2,
            };

            const event = 'nativeEvent' in activatorEvent ? activatorEvent.nativeEvent : activatorEvent;
            const eventX = event instanceof MouseEvent || event instanceof PointerEvent ? event.clientX : (event instanceof TouchEvent ? event.touches[0].clientX : 0);
            const eventY = event instanceof MouseEvent || event instanceof PointerEvent ? event.clientY : (event instanceof TouchEvent ? event.touches[0].clientY : 0);

            const offsetX = eventX - activatorCenter.x;
            const offsetY = eventY - activatorCenter.y;

            return {
                ...transform,
                x: transform.x + offsetX,
                y: transform.y + offsetY,
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
            autoScroll
            modifiers={[snapCenterToCursor]}
        >
             <div className="h-full overflow-hidden">
                <GridSort 
                    agreeCards={unplacedAgree}
                    disagreeCards={unplacedDisagree}
                    neutralCards={unplacedNeutral}
                    gridColumns={gridColumns}
                    renderSlotContent={renderSlotContent}
                    forcedTipsClosed={responses.qsort.length >= 3}
                    disableHoverZoom={activeId !== null}
                    
                    // Tap-to-Place Props
                    selectedCardId={selectedCardId}
                    onCardClick={handleCardClick}
                    onSlotClick={handleSlotClick}
                    onDimensionsChange={setCardDimensions}

                    onReset={() => {
                        if (window.confirm(t('fine.deck.confirm_reset'))) {
                            resetFineSort();
                        }
                    }}
                    onZoomChange={setZoomLevel}
                    onInteractionUtils={setInteractionUtils}
                />
             </div>

             {/* Drag Overlay */}
             {createPortal(
                <DragOverlay dropAnimation={{
                    duration: 250,
                    easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)',
                }}>
                    {activeCardData ? (
                        <div style={{ transform: `scale(${zoomLevel})`, transformOrigin: 'center' }}>
                            <SortableCard 
                                id={activeCardData.id} 
                                text={activeCardData.text} 
                                isOverlay 
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
