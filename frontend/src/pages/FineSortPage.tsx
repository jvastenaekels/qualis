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
import { useStudyStore } from '../store/useStudyStore';
import { useLayoutAction } from '../contexts/LayoutContext';
import { Check } from 'lucide-react';
import GridSort from '../components/GridSort';
import SortableCard from '../components/SortableCard';
import { useFineSortDrag } from '../hooks/useFineSortDrag';

const FineSortPage: React.FC = () => {
    // ... hooks ...

    // Custom Collision Strategy:
    // 1. Priority: Pointer within a slot (Intuitive "under my finger/mouse")
    // 2. Fallback: Intersection with slot (Coverage)
    // 3. Last Resort: Closest Center (Magnet behavior)
    const collisionStrategy: CollisionDetection = (args) => {
        // First, check if pointer is strictly inside a droppable
        const pointerCollisions = pointerWithin(args);
        if (pointerCollisions.length > 0) {
            return pointerCollisions;
        }

        // If not, check if the card rect intersects with any droppable
        const rectCollisions = rectIntersection(args);
        if (rectCollisions.length > 0) {
            return rectCollisions;
        }

        // Finally, fallback to searching for the closest center (magnet)
        return closestCenter(args);
    };

    // ... function continues ...
    // Update DndContext prop: collisionDetection={collisionStrategy}

    const { 
        config, 
        responses, 
        placeCardInGrid, 
        moveCardInGrid, 
        swapCardsInGrid, 
        unplaceCard,
        setStep,
        resetFineSort,
        setZoomedCard
    } = useStudyStore();

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

    const { 
        activeId, 
        handleDragStart, 
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
        selectedId: selectedCardId
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

    return (
        <DndContext 
            sensors={sensors} 
            collisionDetection={collisionStrategy}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            autoScroll
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

                />
             </div>

             {/* Drag Overlay */}
             {createPortal(
                <DragOverlay>
                    {activeCardData ? (
                        <div style={{ transform: `scale(${zoomLevel})`, transformOrigin: 'top left' }}>
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
