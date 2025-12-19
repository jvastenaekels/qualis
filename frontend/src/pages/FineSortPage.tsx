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
    type DragStartEvent,
    type DragEndEvent
} from '@dnd-kit/core';
import { useNavigate, useParams } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { useStudyStore } from '../store/useStudyStore';
import { useLayoutAction } from '../contexts/LayoutContext';
import { Check } from 'lucide-react';
import GridSort from '../components/GridSort';
import SortableCard from '../components/SortableCard';

const FineSortPage: React.FC = () => {
    const { 
        config, 
        responses, 
        placeCardInGrid, 
        moveCardInGrid, 
        swapCardsInGrid, 
        unplaceCard,
        setStep,
        resetFineSort
    } = useStudyStore();

    const navigate = useNavigate();
    const { slug } = useParams();
    const { setHeaderAction } = useLayoutAction(); // Get Layout Setter
    const { t } = useTranslation();
    
    // Set Step 4 on mount
    React.useEffect(() => {
        setStep(4);
    }, [setStep]);

    const [activeId, setActiveId] = useState<number | null>(null);
    const [selectedCardId, setSelectedCardId] = useState<number | null>(null); // Tap-to-Place State
    const [cardDimensions, setCardDimensions] = useState<{ width: number, height: number } | null>(null);

    // Sensors
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(TouchSensor, { 
            activationConstraint: { delay: 250, tolerance: 5 } 
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
        const handleContinue = () => {
             navigate(`/study/${slug}/post-sort`);
        };

        const actionNode = (
            <button
                key={isAllPlaced ? 'ready' : 'pending'}
                onClick={isAllPlaced ? handleContinue : undefined}
                disabled={!isAllPlaced}
                className={`
                    flex items-center gap-2 px-6 py-2 rounded-md font-bold text-sm transition-all duration-500
                    ${isAllPlaced 
                        ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-md hover:shadow-lg transform scale-100 animate-in fade-in zoom-in duration-500 cursor-pointer' 
                        : 'bg-slate-100 text-slate-400 cursor-not-allowed opacity-50'
                    }
                    w-full md:w-auto justify-center
                `}
                title={isAllPlaced ? t('fine.actions.ready') : t('fine.actions.not_ready')}
            >
                {isAllPlaced ? (
                    <>
                        {t('fine.actions.validate')} <Check size={16} strokeWidth={3} />
                    </>
                ) : (
                    <span>{t('fine.actions.finish')}</span>
                )}
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
    
    if (!config) return null;

    // Helper: Smart Placement
    const findClosestEmptyRow = (col: number, targetRow: number): number | null => {
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
            console.log(`[SmartPlace] Col ${col} is full. Capacity: ${capacity}, Occ: ${occupiedRows.size}`);
            return null;
        }

        // Sort by distance to targetRow
        emptyRows.sort((a, b) => {
            const distA = Math.abs(a - targetRow);
            const distB = Math.abs(b - targetRow);
            // Tie-break: Prefer top-down (smaller index) to ensure determinism
            if (distA === distB) return a - b;
            return distA - distB;
        });
        
        const best = emptyRows[0];
        console.log(`[SmartPlace] Col ${col}. Target ${targetRow}. Empty: ${emptyRows.join(',')}. Closest: ${best}`);
        return best;
    };

    // Tap-to-Place Handlers
    const handleCardClick = (id: number) => {
        // Toggle selection
        setSelectedCardId(prev => prev === id ? null : id);
    };

    const handleSlotClick = (col: number, row: number) => {
        if (selectedCardId !== null) {
            const existingCard = responses.qsort.find(c => c.col === col && c.row === row);
            
            // Smart Placement Check
            let finalRow = row;
            let shouldSwap = false;

            if (existingCard) {
                // If the target slot is occupied, try to find an empty one
                const emptyRow = findClosestEmptyRow(col, row);
                if (emptyRow !== null) {
                    finalRow = emptyRow; // Redirect to empty slot
                } else {
                    shouldSwap = true; // Column is full, must swap
                }
            }

            if (shouldSwap && existingCard) {
                // Swap
                swapCardsInGrid(selectedCardId, existingCard.statementId);
            } else {
                // Move/Place to finalRow
                // Note: We don't check if finalRow is occupied because findClosestEmptyRow guarantees it's empty
                // UNLESS race condition, but store actions are synchronous usually.
                const isPlaced = responses.qsort.find(c => c.statementId === selectedCardId);
                if (isPlaced) {
                     moveCardInGrid(selectedCardId, col, finalRow);
                } else {
                     placeCardInGrid(selectedCardId, col, finalRow);
                }
            }
            setSelectedCardId(null); // Clear selection after action
        }
    };


    // Drag Handlers
    const handleDragStart = (event: DragStartEvent) => {
        setActiveId(event.active.id as number);
        setSelectedCardId(null); // Clear selection on drag start to avoid confusion
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        setActiveId(null);

        if (!over) return;

        const cardId = active.id as number;

        // Dropped on a Grid Slot? format "slot_col_row"
        const overIdString = String(over.id);
        if (overIdString.startsWith('slot_')) {
            const parts = overIdString.split('_');
            if (parts.length === 3) {
                const col = parseInt(parts[1]);
                const targetRow = parseInt(parts[2]);

                const existingCard = responses.qsort.find(c => c.col === col && c.row === targetRow);
                
                // Smart Placement Check
                let finalRow = targetRow;
                let shouldSwap = false;

                if (existingCard) {
                     const emptyRow = findClosestEmptyRow(col, targetRow);
                     if (emptyRow !== null) {
                         finalRow = emptyRow;
                     } else {
                         shouldSwap = true;
                     }
                }

                if (shouldSwap && existingCard) {
                    // Swap Logic
                    const activeCardPlaced = responses.qsort.find(c => c.statementId === cardId);
                    if (activeCardPlaced) {
                        swapCardsInGrid(cardId, existingCard.statementId);
                    } else {
                        // Kicks existing back to source
                        unplaceCard(existingCard.statementId);
                        placeCardInGrid(cardId, col, finalRow); // finalRow is targetRow here
                    }
                } else {
                    // Empty Slot (or redirected to empty)
                    const activeCardPlaced = responses.qsort.find(c => c.statementId === cardId);
                    if (activeCardPlaced) {
                        moveCardInGrid(cardId, col, finalRow);
                    } else {
                        placeCardInGrid(cardId, col, finalRow);
                    }
                }
            }
        }
    };
    
    const activeCardData = config?.statements.find(s => s.id === activeId);

    // Helpers
    const renderSlotContent = (col: number, row: number, dimensions: { width: number, height: number }) => {
         const cardInSlot = responses.qsort.find(c => c.col === col && c.row === row);
         const statement = cardInSlot ? config?.statements.find(s => s.id === cardInSlot.statementId) : null;
         if (statement) {
             return (
                <SortableCard 
                    id={statement.id} 
                    text={statement.text} 
                    isSelected={selectedCardId === statement.id}
                    onClick={() => handleCardClick(statement.id)}
                    dimensions={dimensions}
                    disableHoverZoom={typeof window !== 'undefined' && window.innerWidth < 1024}
                />
            );
         }
         return null;
    };

    return (
        <DndContext 
            sensors={sensors} 
            collisionDetection={closestCenter}
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
                    responses={responses}
                    renderSlotContent={renderSlotContent}
                    
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

                />
             </div>

             {/* Drag Overlay */}
             {createPortal(
                <DragOverlay>
                    {activeCardData ? (
                        <SortableCard 
                            id={activeCardData.id} 
                            text={activeCardData.text} 
                            isOverlay 
                            aspectRatio={cardDimensions ? cardDimensions.width / cardDimensions.height : undefined}
                        />
                    ) : null}
                </DragOverlay>,
                document.body
            )}
        </DndContext>
    );
};

export default FineSortPage;
