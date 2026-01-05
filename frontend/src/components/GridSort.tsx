/*
 * Open-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { useDroppable } from '@dnd-kit/core';
import { motion } from 'framer-motion';
import { Check, Frown, Meh, RotateCcw, Smile, Target, ZoomIn, ZoomOut } from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import { TransformComponent, TransformWrapper } from 'react-zoom-pan-pinch';
import { useDeckManagement } from '../hooks/useDeckManagement';
import { useGridCalculations } from '../hooks/useGridCalculations';
import { useGridZoom } from '../hooks/useGridZoom';
import type { InteractionUtils } from '../types/grid';
import DroppableSlot from './DroppableSlot';
import ReadingZone from './ReadingZone';
import SortableCard from './SortableCard';

// Sub-component: Droppable Pile
const DroppablePile: React.FC<
    {
        id: string;
        children: React.ReactNode;
        className: string;
        onClick: () => void;
        active?: boolean;
    } & React.ButtonHTMLAttributes<HTMLButtonElement>
> = React.memo(({ id, children, className, onClick, active, ...props }) => {
    const { setNodeRef, isOver } = useDroppable({ id });

    return (
        <button
            ref={setNodeRef}
            type="button"
            onClick={onClick}
            className={`${className} ${isOver && !active ? 'ring-2 ring-blue-400 bg-blue-50/80 scale-105' : ''}`}
            {...props}
        >
            {children}
        </button>
    );
});

const DroppableDeckArea: React.FC<{
    id: string;
    children: React.ReactNode;
    className: string;
}> = React.memo(({ id, children, className }) => {
    const { setNodeRef, isOver } = useDroppable({ id });
    return (
        <div
            ref={setNodeRef}
            className={`${className} ${isOver ? 'ring-2 ring-indigo-400 bg-indigo-50/10' : ''}`}
        >
            {children}
        </div>
    );
});

interface GridSortProps {
    agreeCards: { id: number; text: string; code?: string }[];
    disagreeCards: { id: number; text: string; code?: string }[];
    neutralCards: { id: number; text: string; code?: string }[];
    gridColumns: { score: number; capacity: number }[];
    renderSlotContent: (
        col: number,
        row: number,
        dimensions: { width: number; height: number }
    ) => React.ReactNode;
    onReset?: () => void;
    selectedCardId?: number | null;
    onCardClick?: (id: number) => void;
    onSlotClick?: (col: number, row: number) => void;
    onDimensionsChange?: (dimensions: { width: number; height: number }) => void;
    disableHoverZoom?: boolean;
    onZoomChange?: (zoom: number) => void;
    onTransformChange?: () => void;
    onInteractionUtils?: (utils: InteractionUtils) => void;
    isAllPlaced?: boolean;
    onValidate?: () => void;
    showCodes?: boolean;
}

type PileType = 'disagree' | 'neutral' | 'agree';

const GridSort: React.FC<GridSortProps> = React.memo(
    ({
        agreeCards,
        disagreeCards,
        neutralCards,
        gridColumns,
        renderSlotContent,
        selectedCardId,
        onCardClick,
        onSlotClick,
        onDimensionsChange,
        disableHoverZoom = false,
        onZoomChange,
        onTransformChange,
        onInteractionUtils,
        isAllPlaced = false,
        onValidate,
        showCodes,
    }) => {
        const { t } = useTranslation();

        const [isMobile, setIsMobile] = useState(
            typeof window !== 'undefined' ? window.innerWidth < 1024 : false
        );

        useEffect(() => {
            const checkMobile = () => setIsMobile(window.innerWidth < 1024);
            checkMobile();
            window.addEventListener('resize', checkMobile);
            return () => window.removeEventListener('resize', checkMobile);
        }, []);

        // Deck Management Hook
        const {
            activePile,
            setActivePile,
            activeCards,
            hasPerformedZonalFocus,
            setHasPerformedZonalFocus,
        } = useDeckManagement({
            agreeCards,
            disagreeCards,
            neutralCards,
        });

        const [autoFitEnabled, setAutoFitEnabled] = useState(true);

        // Grid Calculations Hook
        const { wrapperRef, cardDimensions } = useGridCalculations({
            gridColumns,
            selectedCardId,
            onDimensionsChange,
        });

        // Refs for Zoom Hook (wrapperRef is now provided by useGridCalculations)
        const contentRef = useRef<HTMLDivElement>(null);
        const pyramidRef = useRef<HTMLDivElement>(null);

        // Zoom Hook
        const { zoomIn, zoomOut, performAutoFit, transformRef, onTransformed } = useGridZoom({
            wrapperRef,
            contentRef,
            pyramidRef,
            gridColumns,
            activePile,
            activePileCount: activeCards.length,
            hasPerformedZonalFocus,
            setHasPerformedZonalFocus,
            onZoomChange,
            onTransformChange,
        });

        // Pass interaction utils up to parent
        useEffect(() => {
            if (onInteractionUtils) {
                onInteractionUtils({
                    zoomIn,
                    zoomOut,
                    performAutoFit,
                    transformRef,
                    wrapperRef,
                    contentRef,
                });
            }
        }, [onInteractionUtils, zoomIn, zoomOut, performAutoFit, transformRef, wrapperRef]);

        const getColumnTint = useCallback((score: number) => {
            if (score <= -3) return 'bg-red-50/50';
            if (score < 0) return 'bg-orange-50/30';
            if (score === 0) return 'bg-slate-50/50';
            if (score < 3) return 'bg-green-50/30';
            if (score <= 4) return 'bg-green-50/50';
            return 'bg-transparent';
        }, []);

        // --- Keyboard Focus Management (Roving-like) ---
        const handleGridKeyDown = useCallback(
            (e: React.KeyboardEvent) => {
                // Only handle navigation if no modifiers are pressed
                if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;

                const target = e.target as HTMLElement;
                const slotId = target.id;

                // Parse current position
                // Format: slot_{col}_{row}
                const match = slotId.match(/^slot_(\d+)_(\d+)$/);
                if (!match) return;

                const col = parseInt(match[1], 10);
                const row = parseInt(match[2], 10);
                const maxCols = gridColumns.length;

                let nextCol = col;
                let nextRow = row;

                switch (e.key) {
                    case 'ArrowUp':
                        nextRow = Math.max(0, row - 1);
                        break;
                    case 'ArrowDown': {
                        const maxRowsInCol = gridColumns[col].capacity;
                        nextRow = Math.min(maxRowsInCol - 1, row + 1);
                        break;
                    }
                    case 'ArrowLeft':
                        nextCol = Math.max(0, col - 1);
                        break;
                    case 'ArrowRight':
                        nextCol = Math.min(maxCols - 1, col + 1);
                        break;
                    default:
                        return; // Exit if not an arrow key
                }

                // If moving columns, clamp the row to the new column's capacity
                // We try to stay at the same relative height (center) or just clamp
                if (nextCol !== col) {
                    const newColCapacity = gridColumns[nextCol].capacity;
                    // Sophisticated logic: try to stay visually close?
                    // Simple logic: clamp to bottom
                    nextRow = Math.min(nextRow, newColCapacity - 1);
                }

                if (nextCol !== col || nextRow !== row) {
                    e.preventDefault();
                    const nextId = `slot_${nextCol}_${nextRow}`;
                    const nextEl = document.getElementById(nextId);
                    if (nextEl) {
                        nextEl.focus();
                    }
                }
            },
            [gridColumns]
        );

        const getLegendFontSize = useCallback((maxLen: number) => {
            if (maxLen < 12) return 'text-xl sm:text-2xl';
            if (maxLen < 25) return 'text-lg sm:text-xl';
            return 'text-base sm:text-lg';
        }, []);

        useEffect(() => {
            // Perform initial auto-fit
            const tFit = setTimeout(() => performAutoFit(), 100);
            return () => clearTimeout(tFit);
        }, [performAutoFit]);

        // Responsive: Disable autofit on mobile selection
        useEffect(() => {
            if (selectedCardId && window.innerWidth < 1024) {
                setAutoFitEnabled(false);
            }
        }, [selectedCardId]);

        useEffect(() => {
            setAutoFitEnabled(true);
        }, []);

        useEffect(() => {
            if (!autoFitEnabled) return;
            const t = setTimeout(performAutoFit, 100);
            return () => clearTimeout(t);
        }, [autoFitEnabled, performAutoFit]);

        const renderDeckCards = useCallback(() => {
            // Mobile: Landscape 1.5 ratio. Desktop: 1.5 ratio (or whatever grid requires, usually landscape)
            const mobileRatio = 1.5;
            const gridRatio =
                cardDimensions && cardDimensions.height > 0
                    ? cardDimensions.width / cardDimensions.height
                    : 1.5;

            return activeCards.length > 0 ? (
                activeCards.map((card) => (
                    <div
                        key={card.id}
                        // Mobile: fixed height 100px, landscape 1.5 ratio.
                        // Desktop: w-full (fills grid col), aspect ratio matches grid slots.
                        className={`flex-none ${isMobile ? 'h-[100px]' : 'h-full w-[130px] sm:w-[140px]'} lg:w-full lg:flex-none`}
                        style={{ aspectRatio: isMobile ? mobileRatio : gridRatio }}
                    >
                        <SortableCard
                            id={card.id}
                            text={card.text}
                            code={showCodes ? card.code : undefined}
                            variant="compact"
                            isSelected={selectedCardId === card.id}
                            onClick={() => onCardClick?.(card.id)}
                            aspectRatio={isMobile ? mobileRatio : gridRatio}
                            disableHoverZoom={disableHoverZoom || isMobile}
                        />
                    </div>
                ))
            ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-center text-slate-400 py-4 lg:col-span-2 lg:h-full lg:place-self-center">
                    <div className="flex flex-col items-center gap-2">
                        <div className="p-2 bg-green-50 rounded-full border border-green-100 shadow-sm animate-in zoom-in duration-300">
                            <Check size={20} className="text-green-500" strokeWidth={2.5} />
                        </div>
                        <span className="text-xs font-bold text-slate-500 animate-in fade-in slide-in-from-bottom-2 duration-500 delay-100">
                            {t('fine.deck.all_placed')}
                        </span>
                    </div>
                </div>
            );
        }, [
            activeCards,
            selectedCardId,
            onCardClick,
            isMobile,
            disableHoverZoom,
            t,
            showCodes,
            cardDimensions,
        ]);

        return (
            <div className="flex flex-col lg:flex-row h-[100dvh] bg-slate-50 w-full max-w-[1920px] mx-auto overflow-hidden relative">
                {/* PANEL: THE GRID (Canvas) */}
                <div className="flex-1 min-h-0 bg-slate-50 relative flex flex-col overflow-hidden transition-all duration-300">
                    {/* Condition of Instruction - Persistent Research Question */}
                    <div className="flex-none bg-white/60 backdrop-blur-sm border-b border-slate-100 flex items-center justify-center py-2 px-4 z-20 gap-3">
                        <Target size={14} className="text-indigo-400 opacity-60 flex-none" />
                        <div className="text-sm sm:text-base font-semibold text-slate-700 text-center leading-relaxed max-w-2xl px-2 [&_strong]:font-bold [&_strong]:text-slate-900">
                            <ReactMarkdown
                                components={{ p: ({ children }) => <span>{children}</span> }}
                            >
                                {t('fine.header.title')}
                            </ReactMarkdown>
                        </div>
                    </div>

                    {/* Reading Zone - Responsive Placement */}
                    {isMobile && <ReadingZone variant="mobile" />}

                    <div
                        className="flex-1 w-full h-full relative overflow-hidden bg-slate-100 cursor-grab active:cursor-grabbing"
                        ref={wrapperRef}
                    >
                        <div className="absolute top-4 right-4 z-50 flex flex-col gap-1 bg-white/90 backdrop-blur p-1.5 rounded-lg border border-slate-200 shadow-md">
                            <button
                                type="button"
                                onClick={zoomIn}
                                className="p-2 hover:bg-slate-100 rounded text-slate-600"
                                aria-label={t('fine.toolbar.zoom_in')}
                            >
                                <ZoomIn size={20} />
                            </button>
                            <button
                                type="button"
                                onClick={zoomOut}
                                className="p-2 hover:bg-slate-100 rounded text-slate-600"
                                aria-label={t('fine.toolbar.zoom_out')}
                            >
                                <ZoomOut size={20} />
                            </button>
                            <div className="h-px bg-slate-200 my-0.5"></div>
                            <button
                                type="button"
                                onClick={performAutoFit}
                                className="p-2 hover:bg-slate-100 rounded text-slate-600"
                                aria-label={t('fine.toolbar.fit_screen')}
                            >
                                <RotateCcw size={20} />
                            </button>
                        </div>

                        <TransformWrapper
                            ref={transformRef}
                            initialScale={0.8}
                            minScale={0.1}
                            maxScale={3.0}
                            centerOnInit={false}
                            limitToBounds={false}
                            wheel={{ step: 0.1 }}
                            panning={{ excluded: ['dnd-prevent-pan'] }}
                            doubleClick={{ disabled: true }}
                            onTransformed={onTransformed}
                        >
                            <TransformComponent wrapperClass="w-full h-full !overflow-hidden">
                                <div
                                    data-testid="grid-container"
                                    ref={contentRef}
                                    className="flex flex-col items-center gap-8 px-4 relative"
                                >
                                    <div
                                        ref={pyramidRef}
                                        className="flex flex-row gap-2 items-end flex-nowrap outline-none"
                                        role="grid"
                                        tabIndex={-1} // Container not focusable, slots are
                                        onKeyDown={handleGridKeyDown}
                                    >
                                        {gridColumns.map((col, colIndex) => (
                                            <div
                                                key={col.score}
                                                id={`column-${col.score}`}
                                                className="flex flex-col gap-2 items-center flex-shrink-0"
                                            >
                                                {/* Top Column Score Label */}
                                                <div
                                                    id={`header-score-${col.score}`}
                                                    className="text-slate-400 mb-1"
                                                >
                                                    <span className="text-3xl font-bold leading-none">
                                                        {col.score > 0
                                                            ? `+${col.score}`
                                                            : col.score}
                                                    </span>
                                                </div>

                                                <div
                                                    className="flex flex-col gap-2"
                                                    role="row"
                                                    tabIndex={-1}
                                                >
                                                    {Array.from({ length: col.capacity }).map(
                                                        (_, rowIndex) => (
                                                            <DroppableSlot
                                                                key={`${colIndex}-${rowIndex}`}
                                                                id={`slot_${colIndex}_${rowIndex}`}
                                                                role="gridcell"
                                                                onClick={() =>
                                                                    onSlotClick?.(
                                                                        colIndex,
                                                                        rowIndex
                                                                    )
                                                                }
                                                                style={{
                                                                    width: cardDimensions.width,
                                                                    height: cardDimensions.height,
                                                                }}
                                                                className={`border-2 border-dashed border-slate-300/80 rounded-2xl flex items-center justify-center ${getColumnTint(col.score)} bg-opacity-40 transition-all duration-300 shadow-sm ${selectedCardId ? 'ring-2 ring-indigo-400/50 bg-indigo-50/30 cursor-pointer hover:bg-indigo-100/50 hover:ring-indigo-500 hover:scale-[1.02]' : ''}`}
                                                            >
                                                                {renderSlotContent(
                                                                    colIndex,
                                                                    rowIndex,
                                                                    cardDimensions
                                                                )}
                                                            </DroppableSlot>
                                                        )
                                                    )}
                                                </div>
                                                <div
                                                    id={`footer-${col.score}`}
                                                    className="text-slate-400 mt-1"
                                                >
                                                    <span className="text-3xl font-bold leading-none">
                                                        {col.score > 0
                                                            ? `+${col.score}`
                                                            : col.score}
                                                    </span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="w-full flex flex-col gap-3 pt-4 border-t border-slate-200/50">
                                        <div className="flex justify-between items-end w-full font-bold uppercase tracking-widest opacity-60 px-2 gap-4">
                                            {(() => {
                                                const l1 = t('fine.legend.disagree');
                                                const l2 = t('fine.legend.neutral');
                                                const l3 = t('fine.legend.agree');
                                                const fs = getLegendFontSize(
                                                    Math.max(l1.length, l2.length, l3.length)
                                                );
                                                return (
                                                    <>
                                                        <span
                                                            className={`text-red-600 flex-1 text-left whitespace-nowrap overflow-hidden text-ellipsis ${fs}`}
                                                        >
                                                            {l1}
                                                        </span>
                                                        <span
                                                            className={`text-slate-400 flex-1 text-center whitespace-nowrap overflow-hidden text-ellipsis ${fs}`}
                                                        >
                                                            {l2}
                                                        </span>
                                                        <span
                                                            className={`text-green-600 flex-1 text-right whitespace-nowrap overflow-hidden text-ellipsis ${fs}`}
                                                        >
                                                            {l3}
                                                        </span>
                                                    </>
                                                );
                                            })()}
                                        </div>
                                        <div className="w-full h-5 bg-gradient-to-r from-red-500/30 via-slate-200 to-green-500/30 rounded-md relative backdrop-blur-sm overflow-hidden ring-1 ring-slate-200/50">
                                            <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-slate-400/50 -translate-x-1/2"></div>
                                            {/* Removed side dividers to prevent glitches at corners */}
                                        </div>
                                    </div>
                                </div>
                            </TransformComponent>
                        </TransformWrapper>
                    </div>
                </div>

                {/* PANEL: SOURCE INVENTORY (Deck) */}
                <div
                    className={`
          w-full lg:w-[360px] flex-none
          bg-white lg:border-r border-t lg:border-t-0 border-gray-200
          z-40 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] lg:shadow-md
          flex flex-col lg:h-full transition-all duration-300
        overflow-hidden
        `}
                    style={{
                        height: isMobile ? 'auto' : '100%',
                    }}
                >
                    {/* Reading Zone - Desktop Sidebar version */}
                    {!isMobile && (
                        <div className="flex-none p-4 pb-0">
                            <ReadingZone variant="desktop" />
                        </div>
                    )}

                    {/* Category selector (Piles) */}
                    <div className="flex-none p-4 pb-2">
                        <div className="flex lg:grid lg:grid-cols-3 gap-2" role="tablist">
                            {(['disagree', 'neutral', 'agree'] as const).map((pile) => {
                                const isActive = activePile === pile;
                                const cards =
                                    pile === 'disagree'
                                        ? disagreeCards
                                        : pile === 'agree'
                                          ? agreeCards
                                          : neutralCards;
                                const Icon =
                                    pile === 'disagree' ? Frown : pile === 'agree' ? Smile : Meh;

                                const pileStyles = {
                                    disagree: {
                                        icon: 'text-red-500',
                                        activeBg: 'bg-red-50 border-red-300',
                                        activeText: 'text-red-700',
                                        activeBadge: 'bg-red-600 text-white border-white',
                                        activeBar: 'bg-red-200',
                                    },
                                    neutral: {
                                        icon: 'text-gray-500',
                                        activeBg: 'bg-gray-100 border-gray-300',
                                        activeText: 'text-gray-700',
                                        activeBadge: 'bg-gray-600 text-white border-white',
                                        activeBar: 'bg-gray-200',
                                    },
                                    agree: {
                                        icon: 'text-green-500',
                                        activeBg: 'bg-green-50 border-green-300',
                                        activeText: 'text-green-700',
                                        activeBadge: 'bg-green-600 text-white border-white',
                                        activeBar: 'bg-green-200',
                                    },
                                };
                                const style = pileStyles[pile as PileType];

                                return (
                                    <DroppablePile
                                        key={pile}
                                        id={`deck-${pile}`}
                                        className={`
                                            relative flex-1 flex flex-col items-center justify-center p-2 rounded-xl border transition-all duration-200
                                            ${isActive ? style.activeBg : 'bg-slate-50 border-slate-200 hover:bg-slate-100'}
                                            ${isActive ? 'shadow-sm scale-[1.02]' : ''}
                                        `}
                                        onClick={() => {
                                            setActivePile(pile as PileType);
                                            if (isMobile) {
                                                setHasPerformedZonalFocus(true);
                                            }
                                        }}
                                        active={isActive}
                                        role="tab"
                                        aria-selected={isActive}
                                        aria-label={`${t(`common.${pile}`)}: ${cards.length} ${t('common.cards')}`}
                                    >
                                        <Icon size={24} className={`lg:hidden ${style.icon}`} />
                                        <span
                                            className={`hidden lg:block text-[10px] font-bold uppercase tracking-wider mb-1 ${isActive ? style.activeText : 'text-slate-600'}`}
                                        >
                                            {t(`common.${pile}`)}
                                        </span>
                                        <div
                                            className={`hidden lg:block w-8 h-1 rounded-full mb-1 ${isActive ? style.activeBar : 'bg-slate-100'}`}
                                        ></div>
                                        <div
                                            className={`hidden lg:block w-6 h-1 rounded-full ${isActive ? style.activeBar : 'bg-slate-100'}`}
                                        ></div>
                                        <motion.span
                                            key={cards.length}
                                            className={`absolute -top-2 -right-2 w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold border-2 shadow-sm z-20 ${isActive ? style.activeBadge : 'bg-slate-200 text-slate-700 border-white'}`}
                                        >
                                            {cards.length}
                                        </motion.span>
                                    </DroppablePile>
                                );
                            })}
                        </div>
                    </div>

                    <DroppableDeckArea
                        id={`deck-area-${activePile}`}
                        className={`
                            flex-col overflow-hidden relative
                            ${isMobile ? 'h-[150px] flex-none' : 'flex-1 min-h-0 flex'}
                        `}
                    >
                        <div
                            key={activePile}
                            className={`
                        flex-1 p-1 px-2 flex flex-row gap-2 overflow-x-auto overflow-y-hidden min-h-0 items-stretch justify-start custom-scrollbar
                        ${activeCards.length === 0 ? 'justify-center' : ''}
                        lg:grid lg:grid-cols-2 lg:gap-2 lg:content-start lg:overflow-y-auto lg:overflow-x-hidden lg:p-3
                        ${activeCards.length === 0 ? 'lg:place-content-center' : ''}
                    `}
                            data-testid="deck-cards-container"
                        >
                            {renderDeckCards()}
                        </div>
                    </DroppableDeckArea>
                    {/* PANEL FOOTER: Guidance or Validation */}
                    <div className="w-full lg:w-[360px] p-4 border-t-2 border-indigo-100 bg-white shadow-[0_-8px_20px_rgba(0,0,0,0.1)] z-[100] min-h-[150px] flex-none pb-[calc(1rem+env(safe-area-inset-bottom))]">
                        {isAllPlaced ? (
                            <button
                                type="button"
                                onClick={onValidate}
                                className="w-full flex items-center justify-center gap-2 py-3 bg-green-600 text-white rounded-xl font-bold text-sm shadow-md hover:bg-green-700 transition-all active:scale-95 animate-in fade-in zoom-in-95 duration-500"
                            >
                                {t('fine.actions.validate')} <Check size={18} strokeWidth={3} />
                            </button>
                        ) : (
                            <div className="flex items-center justify-center min-h-[48px] bg-indigo-50 border border-indigo-100 rounded-xl px-4 w-full">
                                <div className="flex items-center gap-3 text-slate-500">
                                    {selectedCardId ? (
                                        <>
                                            <span className="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-indigo-500 text-[10px] text-white font-black">
                                                2
                                            </span>
                                            <span className="text-xs font-bold uppercase tracking-wide animate-pulse">
                                                {t('fine.workbench.place_on_grid')}
                                            </span>
                                        </>
                                    ) : (
                                        <>
                                            <span className="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-slate-200 text-[10px] text-slate-500 font-black">
                                                1
                                            </span>
                                            <span className="text-xs font-bold uppercase tracking-wide">
                                                {isAllPlaced // Fallback if selectedId prevents button
                                                    ? t('fine.actions.finish')
                                                    : t('fine.workbench.initial_instruction')}
                                            </span>
                                        </>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    }
);

export default GridSort;
