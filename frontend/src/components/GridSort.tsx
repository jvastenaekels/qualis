/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { useDroppable } from '@dnd-kit/core';
import { AnimatePresence, motion } from 'framer-motion';
import { cva } from 'class-variance-authority';
import {
    Check,
    Maximize2,
    Frown,
    Meh,
    RotateCcw,
    Smile,
    Target,
    X,
    ZoomIn,
    ZoomOut,
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SafeMarkdown } from './SafeMarkdown';
import { TransformComponent, TransformWrapper } from 'react-zoom-pan-pinch';
import { useDeckManagement } from '../hooks/useDeckManagement';
import { useGridCalculations } from '../hooks/useGridCalculations';
import { useGridZoom } from '../hooks/useGridZoom';
import type { InteractionUtils } from '../types/grid';
import DroppableSlot from './DroppableSlot';
import ReadingZone from './ReadingZone';
import SortableCard from './SortableCard';
import type { TFunction } from 'i18next';
import { useViewport } from '@/contexts/ViewportContext';

import { cn } from '@/lib/utils';
import { inlineMarkdownComponents } from './markdown-config';

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
            data-testid={id}
            onClick={onClick}
            className={cn(
                className,
                isOver && !active && 'ring-2 ring-blue-400 bg-blue-50/80 scale-105'
            )}
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
            data-testid={id}
            className={cn(className, isOver && 'ring-2 ring-indigo-400 bg-indigo-50/10')}
        >
            {children}
        </div>
    );
});

// --- UI Variants ---

const pileTabVariants = cva(
    'relative flex-1 basis-0 w-full h-full flex flex-col items-center justify-center p-1.5 sm:p-2 min-h-[60px] sm:min-h-[75px] lg:min-h-[90px] rounded-xl border transition-all duration-200 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-indigo-400',
    {
        variants: {
            variant: {
                disagree: 'bg-red-50 border-red-300 text-red-700',
                neutral: 'bg-blue-50 border-blue-300 text-blue-700',
                agree: 'bg-green-50 border-green-300 text-green-700',
                inactive:
                    'bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-600 shadow-none',
            },
            active: {
                true: 'scale-[1.02] z-10',
                false: '',
            },
        },
        defaultVariants: {
            variant: 'inactive',
            active: false,
        },
    }
);

const pileIconVariants = cva('', {
    variants: {
        type: {
            disagree: 'text-red-500',
            neutral: 'text-blue-500',
            agree: 'text-green-500',
        },
    },
});

const pileBadgeVariants = cva(
    'absolute -top-2 -right-2 w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold border-2 shadow-sm z-20',
    {
        variants: {
            variant: {
                disagree: 'bg-red-600 text-white border-white',
                neutral: 'bg-blue-600 text-white border-white',
                agree: 'bg-green-600 text-white border-white',
                inactive: 'bg-slate-200 text-slate-700 border-white',
            },
        },
    }
);

// --- Sub-components ---

const InstructionHeader: React.FC<{
    instruction: string | null;
    defaultText: string;
    emphasizeCollapse?: boolean;
    forceMobile?: boolean;
}> = React.memo(({ instruction, defaultText, emphasizeCollapse, forceMobile }) => {
    const { isMobile } = useViewport();
    const { t } = useTranslation();
    const useMobileLayout = isMobile || forceMobile;
    // Start minimized in landscape mobile to maximize grid space
    const [isMinimized, setIsMinimized] = useState(!!emphasizeCollapse);

    // Desktop: Regular flow
    if (!useMobileLayout) {
        return (
            <div
                className="flex-none bg-white/60 backdrop-blur-sm border-b border-slate-100 flex items-center justify-center py-2 px-4 z-20 gap-3"
                role="status"
                aria-live="polite"
            >
                <Target
                    size={14}
                    className="text-indigo-400 opacity-60 flex-none"
                    aria-hidden="true"
                />
                <div className="text-sm sm:text-base font-semibold text-slate-700 text-center leading-relaxed max-w-2xl px-2 [&_strong]:font-bold [&_strong]:text-slate-900">
                    <SafeMarkdown components={inlineMarkdownComponents}>
                        {instruction || defaultText}
                    </SafeMarkdown>
                </div>
            </div>
        );
    }

    // Mobile: Overlay with Toggle
    return (
        <React.Fragment>
            {/* Minimized State (Always present to allow expanding) */}
            <AnimatePresence mode="wait">
                {isMinimized ? (
                    <motion.button
                        key="minimized"
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        onClick={() => setIsMinimized(false)}
                        className={cn(
                            'absolute inset-x-0 mx-auto w-fit bg-white/90 backdrop-blur-md shadow-sm border border-slate-200/50 rounded-full px-3 py-1.5 flex items-center justify-center gap-2 text-xs font-bold text-indigo-600',
                            emphasizeCollapse ? 'top-2 z-header' : 'top-[112px] z-modal'
                        )}
                        aria-label="Expand instructions"
                    >
                        <Target size={14} />
                        <span>{t('fine.header.instruction_label', 'Instruction')}</span>
                        <Maximize2 size={14} />
                    </motion.button>
                ) : (
                    <motion.div
                        key="expanded"
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className="absolute top-0 left-0 right-0 z-modal bg-white/95 backdrop-blur-md shadow-md border-b border-slate-100/50 flex flex-col items-center p-3 gap-2"
                    >
                        <div
                            className="flex items-start justify-center gap-3 w-full"
                            role="status"
                            aria-live="polite"
                        >
                            <Target
                                size={14}
                                className="text-indigo-400 opacity-60 flex-none mt-1"
                                aria-hidden="true"
                            />
                            <div className="text-sm font-medium text-slate-700 text-center leading-relaxed max-w-[90%] [&_strong]:font-bold [&_strong]:text-indigo-700">
                                <SafeMarkdown components={inlineMarkdownComponents}>
                                    {instruction || defaultText}
                                </SafeMarkdown>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => setIsMinimized(true)}
                            className="flex items-center justify-center transition-colors gap-1.5 mx-auto mt-1 px-4 py-1 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700 text-xs font-medium"
                            aria-label="Minimize instructions"
                        >
                            <Check size={14} />
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>
        </React.Fragment>
    );
});

const GridToolbar: React.FC<{
    onZoomIn: () => void;
    onZoomOut: () => void;
    onReset: () => void;
    labels: { in: string; out: string; fit: string };
}> = React.memo(({ onZoomIn, onZoomOut, onReset, labels }) => (
    <div
        className="absolute top-4 right-4 z-toolbar flex flex-col gap-1 bg-white/90 backdrop-blur p-1.5 rounded-lg border border-slate-200 shadow-md"
        role="toolbar"
        aria-label="Grid controls"
    >
        <button
            type="button"
            onClick={onZoomIn}
            className="p-3 min-w-[44px] min-h-[44px] hover:bg-slate-100 rounded text-slate-600 touch-manipulation"
            aria-label={labels.in}
        >
            <ZoomIn size={20} />
        </button>
        <button
            type="button"
            onClick={onZoomOut}
            className="p-3 min-w-[44px] min-h-[44px] hover:bg-slate-100 rounded text-slate-600 touch-manipulation"
            aria-label={labels.out}
        >
            <ZoomOut size={20} />
        </button>
        <div className="h-px bg-slate-200 my-0.5" />
        <button
            type="button"
            onClick={onReset}
            className="p-3 min-w-[44px] min-h-[44px] hover:bg-slate-100 rounded text-slate-600 touch-manipulation"
            aria-label={labels.fit}
        >
            <RotateCcw size={20} />
        </button>
    </div>
));

const ScoreLabel: React.FC<{ score: number; className?: string; id?: string }> = React.memo(
    ({ score, className, id }) => (
        <div id={id} className={cn('text-slate-400 font-bold leading-none', className)}>
            <span className="text-3xl">{score > 0 ? `+${score}` : score}</span>
        </div>
    )
);

const LegendLabel: React.FC<{
    label: string;
    type: 'disagree' | 'neutral' | 'agree';
    highlight: boolean;
    fontSize: string;
    testId?: string;
}> = React.memo(({ label, type, highlight, fontSize, testId }) => {
    const typeStyles = {
        disagree: 'text-red-600 text-left',
        neutral: 'text-blue-600 text-center',
        agree: 'text-green-600 text-right',
    };

    return (
        <span
            data-testid={testId}
            className={cn(
                'flex-1 whitespace-nowrap overflow-hidden text-ellipsis transition-all',
                typeStyles[type],
                fontSize,
                highlight &&
                    'ring-4 ring-[var(--brand-accent)] ring-offset-2 motion-safe:animate-pulse z-[100] relative rounded px-1 shadow-[0_0_20px_color-mix(in_srgb,var(--brand-accent),transparent_50%)]'
            )}
        >
            {label}
        </span>
    );
});

const GridLegend: React.FC<{
    highlightKey?: string | null;
    t: TFunction;
    getLegendFontSize: (maxLen: number) => string;
    uiLabels?: Record<string, string>;
}> = React.memo(({ highlightKey, t, getLegendFontSize, uiLabels }) => {
    const legends = ['disagree', 'agree'] as const;
    const fs = getLegendFontSize(Math.max(...legends.map((key) => t(`fine.legend.${key}`).length)));

    return (
        <div className="w-full h-auto flex flex-col gap-3 pt-4 border-t border-slate-200/50">
            <div
                className="flex justify-between items-end w-full font-bold opacity-60 px-2 gap-4"
                role="group"
                aria-label="Grid legend"
            >
                {legends.map((key) => (
                    <LegendLabel
                        key={key}
                        type={key}
                        label={uiLabels?.[`fine.legend.${key}`] || t(`fine.legend.${key}`)}
                        fontSize={fs}
                        highlight={highlightKey === `fine.legend.${key}`}
                        testId={`legend-${key}`}
                    />
                ))}
            </div>
            <div
                className="w-full h-5 bg-gradient-to-r from-red-500/30 via-slate-200 to-green-500/30 rounded-md relative backdrop-blur-sm overflow-hidden ring-1 ring-slate-200/50"
                aria-hidden="true"
            >
                <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-slate-400/50 -translate-x-1/2" />
            </div>
        </div>
    );
});

const PileTab: React.FC<{
    pile: PileType;
    isActive: boolean;
    count: number;
    label: string;
    cardsLabel: string;
    onClick: () => void;
    compact?: boolean;
}> = React.memo(({ pile, isActive, count, label, cardsLabel, onClick, compact }) => {
    const Icon = {
        disagree: Frown,
        neutral: Meh,
        agree: Smile,
    }[pile];

    return (
        <DroppablePile
            id={`deck-${pile}`}
            className={cn(
                pileTabVariants({
                    variant: isActive ? pile : 'inactive',
                    active: isActive,
                }),
                compact && '!min-h-0 !p-1.5'
            )}
            onClick={onClick}
            active={isActive}
            role="tab"
            aria-selected={isActive}
            aria-label={`${label}: ${count} ${cardsLabel}`}
        >
            <Icon
                size={compact ? 20 : isActive ? 28 : 24}
                strokeWidth={2.5}
                className={cn(
                    'opacity-80 transition-transform',
                    !compact && 'mb-1 lg:mb-2',
                    pileIconVariants({ type: pile })
                )}
            />
            {!compact && (
                <span className="hidden sm:block text-2xs font-bold mb-1 line-clamp-2 text-center px-1 leading-tight">
                    {label}
                </span>
            )}
            {!compact && (
                <>
                    <div
                        className={cn(
                            'hidden lg:block w-8 h-1 rounded-full mb-1 sm:opacity-40',
                            isActive ? 'bg-current' : 'bg-slate-200'
                        )}
                    />
                    <div
                        className={cn(
                            'hidden lg:block w-6 h-1 rounded-full sm:opacity-40',
                            isActive ? 'bg-current' : 'bg-slate-200'
                        )}
                    />
                </>
            )}
            <motion.span
                key={count}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className={pileBadgeVariants({ variant: isActive ? pile : 'inactive' })}
            >
                {count}
            </motion.span>
        </DroppablePile>
    );
});

const ValidationFooter: React.FC<{
    isAllPlaced: boolean;
    selectedCardId?: number | null;
    onValidate?: () => void;
    onCancelSelection?: () => void;
    labels: {
        validate: string;
        place: string;
        initial: string;
        finish: string;
    };
    highlightKey?: string | null;
    compact?: boolean;
}> = React.memo(
    ({
        isAllPlaced,
        selectedCardId,
        onValidate,
        onCancelSelection,
        labels,
        highlightKey,
        compact,
    }) => (
        <div
            data-testid="validation-footer"
            className={cn(
                'lg:p-4 border-t border-indigo-100 bg-white z-[100] flex-none pb-[calc(0.5rem+env(safe-area-inset-bottom))]',
                compact
                    ? 'w-full min-h-0 p-1.5'
                    : 'w-full p-2 lg:w-[360px] min-h-[72px] lg:min-h-[100px] shadow-[0_-8px_20px_rgba(0,0,0,0.1)]'
            )}
        >
            {isAllPlaced ? (
                <button
                    type="button"
                    data-testid="fine-sort-validate-btn"
                    onClick={() => onValidate?.()}
                    style={{ backgroundColor: 'var(--brand-accent)' }}
                    className={cn(
                        cn(
                            'w-full flex items-center justify-center gap-2 text-white rounded-full font-bold shadow-lg hover:brightness-110 hover:shadow-xl hover:-translate-y-0.5 transition-all active:scale-95 animate-in fade-in zoom-in-95 duration-500',
                            compact ? 'py-2 text-sm' : 'py-3 lg:py-4 text-base'
                        ),
                        highlightKey === 'fine.actions.validate' &&
                            'ring-4 ring-[var(--brand-accent)] ring-offset-2 motion-safe:animate-pulse z-[100] relative shadow-[0_0_20px_color-mix(in_srgb,var(--brand-accent),transparent_50%)]'
                    )}
                >
                    {labels.validate} <Check size={18} strokeWidth={3} />
                </button>
            ) : (
                <div className="flex items-center justify-center min-h-[44px] bg-indigo-50 border border-indigo-100 rounded-xl px-4 w-full">
                    <div className="flex items-center gap-3 text-slate-500">
                        {selectedCardId ? (
                            <>
                                <span
                                    className="flex h-5 w-5 flex-none items-center justify-center rounded-full text-2xs text-white font-black"
                                    style={{ backgroundColor: 'var(--brand-accent)' }}
                                >
                                    2
                                </span>
                                <span
                                    className="text-xs font-bold motion-safe:animate-pulse"
                                    style={{ color: 'var(--brand-accent)' }}
                                >
                                    {labels.place}
                                </span>
                                {onCancelSelection && (
                                    <button
                                        type="button"
                                        onClick={onCancelSelection}
                                        className="ml-auto flex-none p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full hover:bg-indigo-100 text-slate-500 hover:text-slate-700 transition-colors"
                                        aria-label="Cancel selection"
                                    >
                                        <X size={16} strokeWidth={2.5} aria-hidden="true" />
                                    </button>
                                )}
                            </>
                        ) : (
                            <>
                                <span className="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-slate-200 text-2xs text-slate-500 font-black">
                                    1
                                </span>
                                <span className="text-xs font-bold">
                                    {isAllPlaced ? labels.finish : labels.initial}
                                </span>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
);

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
    highlightKey?: string | null;
    conditionOfInstruction?: string | null;
    uiLabels?: Record<string, string>;
    readOnly?: boolean;
    sidebarContent?: React.ReactNode;
}

type PileType = 'disagree' | 'neutral' | 'agree';

const getColumnTint = (score: number) => {
    if (score <= -3) return 'bg-red-50/50';
    if (score < 0) return 'bg-orange-50/30';
    if (score === 0) return 'bg-slate-50/50';
    if (score < 3) return 'bg-green-50/30';
    if (score <= 4) return 'bg-green-50/50';
    return 'bg-transparent';
};

const getLegendFontSize = (maxLen: number) => {
    if (maxLen < 12) return 'text-xl sm:text-2xl';
    if (maxLen < 25) return 'text-lg sm:text-xl';
    return 'text-base sm:text-lg';
};

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
        highlightKey,
        conditionOfInstruction,

        uiLabels,
        readOnly = false,
        sidebarContent,
    }) => {
        const { t } = useTranslation();

        const { isMobile, isDesktop, isLandscape, height } = useViewport();
        // Include landscape phones >= 768px (e.g., iPhone 14 Pro at 844x390)
        // that fall into the "tablet" zone but need the landscape-mobile layout
        const isLandscapeMobile =
            (isMobile && isLandscape) || (isLandscape && height < 500 && !isDesktop);

        // Deck Management Hook
        const { activePile, setActivePile, activeCards } = useDeckManagement({
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

        // Zoom Hook
        const { zoomIn, zoomOut, performAutoFit, transformRef, onTransformed } = useGridZoom({
            wrapperRef,
            contentRef,
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
                if (!match || !match[1] || !match[2]) return;

                const col = parseInt(match[1], 10);
                const row = parseInt(match[2], 10);
                const maxCols = gridColumns.length;
                const currentColumn = gridColumns[col];
                if (!currentColumn) return;

                let nextCol = col;
                let nextRow = row;

                switch (e.key) {
                    case 'ArrowUp':
                        nextRow = Math.max(0, row - 1);
                        break;
                    case 'ArrowDown': {
                        const maxRowsInCol = currentColumn.capacity;
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
                    const newColCapacity = gridColumns[nextCol]?.capacity ?? 0;
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

        useEffect(() => {
            // Perform initial auto-fit
            const tFit = setTimeout(() => performAutoFit(), 100);
            return () => clearTimeout(tFit);
        }, [performAutoFit]);

        // Responsive: Disable autofit on mobile selection so viewport resize
        // doesn't fight with the user placing a card. We intentionally do NOT
        // re-enable it on deselection — doing so triggers performAutoFit which
        // resets the zoom level after every card placement on mobile.
        useEffect(() => {
            if (selectedCardId && !isDesktop) {
                setAutoFitEnabled(false);
            }
        }, [selectedCardId, isDesktop]);

        useEffect(() => {
            if (!autoFitEnabled) return;
            const t = setTimeout(performAutoFit, 100);
            return () => clearTimeout(t);
        }, [autoFitEnabled, performAutoFit]);

        const handleCancelSelection = useCallback(() => {
            if (selectedCardId && onCardClick) onCardClick(selectedCardId);
        }, [selectedCardId, onCardClick]);

        const inventoryLabels = useMemo(
            () => ({
                validate: uiLabels?.['fine.actions.validate'] || t('fine.actions.validate'),
                place:
                    uiLabels?.['fine.workbench.place_on_grid'] || t('fine.workbench.place_on_grid'),
                initial:
                    isMobile || isLandscapeMobile
                        ? uiLabels?.['fine.workbench.initial_instruction_mobile'] ||
                          t('fine.workbench.initial_instruction_mobile', 'Tap statement')
                        : uiLabels?.['fine.workbench.initial_instruction'] ||
                          t('fine.workbench.initial_instruction'),
                finish: uiLabels?.['fine.actions.finish'] || t('fine.actions.finish'),
            }),
            [t, uiLabels, isMobile, isLandscapeMobile]
        );

        const toolbarLabels = useMemo(
            () => ({
                in: t('fine.toolbar.zoom_in'),
                out: t('fine.toolbar.zoom_out'),
                fit: t('fine.toolbar.fit_screen'),
            }),
            [t]
        );

        const renderDeckCards = useCallback(() => {
            const mobileRatio = 1.5;
            const gridRatio =
                cardDimensions && cardDimensions.height > 0
                    ? cardDimensions.width / cardDimensions.height
                    : 1.5;

            if (activeCards.length === 0) {
                return (
                    <div className="w-full h-full flex flex-col items-center justify-center text-center text-slate-400 py-4 col-span-2 lg:h-full place-self-center">
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
            }

            return activeCards.map((card) => (
                <div
                    key={card.id}
                    className={cn(
                        'flex-none lg:w-full lg:flex-none',
                        isLandscapeMobile
                            ? 'w-full h-[60px]'
                            : isMobile
                              ? 'h-[80px]'
                              : 'h-full w-[130px] sm:w-[140px]'
                    )}
                    style={{
                        aspectRatio: isLandscapeMobile
                            ? undefined
                            : isMobile
                              ? mobileRatio
                              : gridRatio,
                    }}
                >
                    <SortableCard
                        id={card.id}
                        text={card.text}
                        code={showCodes ? card.code : undefined}
                        variant="compact"
                        isSelected={selectedCardId === card.id}
                        onAction={onCardClick}
                        aspectRatio={
                            isLandscapeMobile ? 'auto' : isMobile ? mobileRatio : gridRatio
                        }
                        disableHoverZoom={disableHoverZoom || isMobile}
                    />
                </div>
            ));
        }, [
            activeCards,
            selectedCardId,
            onCardClick,
            isMobile,
            isLandscapeMobile,
            disableHoverZoom,
            t,
            showCodes,
            cardDimensions,
        ]);

        return (
            <div
                className={cn(
                    'flex h-full bg-slate-50 w-full max-w-[1920px] mx-auto overflow-hidden relative',
                    isLandscapeMobile ? 'flex-row' : 'flex-col lg:flex-row'
                )}
            >
                {/* PANEL: THE GRID (Canvas) */}
                <div className="flex-1 min-h-0 bg-slate-50 relative flex flex-col overflow-hidden transition-all duration-300 pl-safe">
                    <InstructionHeader
                        instruction={conditionOfInstruction || null}
                        defaultText={t('fine.header.title')}
                        emphasizeCollapse={isLandscapeMobile}
                        forceMobile={isLandscapeMobile}
                    />

                    {isMobile && !isLandscapeMobile && <ReadingZone variant="mobile" />}

                    <div
                        className="flex-1 w-full h-full relative overflow-hidden bg-slate-100 cursor-grab active:cursor-grabbing touch-none"
                        ref={wrapperRef}
                    >
                        {isLandscapeMobile && <ReadingZone variant="overlay" />}

                        <GridToolbar
                            onZoomIn={zoomIn}
                            onZoomOut={zoomOut}
                            onReset={performAutoFit}
                            labels={toolbarLabels}
                        />

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
                                        className="flex flex-row gap-2 items-end flex-nowrap outline-none"
                                        role="grid"
                                        aria-label={t('fine.grid.label', 'Sorting grid')}
                                        tabIndex={-1}
                                        onKeyDown={handleGridKeyDown}
                                    >
                                        {gridColumns.map((col, colIndex) => (
                                            <div
                                                key={col.score}
                                                id={`column-${col.score}`}
                                                className="flex flex-col gap-2 items-center flex-shrink-0"
                                            >
                                                <ScoreLabel
                                                    score={col.score}
                                                    id={`header-score-${col.score}`}
                                                    className="mb-1"
                                                />

                                                <div
                                                    className="flex flex-col gap-2"
                                                    role="row"
                                                    tabIndex={-1}
                                                >
                                                    {Array.from({ length: col.capacity }).map(
                                                        (_, rowIndex) =>
                                                            readOnly ? (
                                                                <div
                                                                    key={`${colIndex}-${rowIndex}`}
                                                                    className={cn(
                                                                        'border-2 border-dashed border-slate-300/80 rounded-2xl flex items-center justify-center bg-opacity-40 transition-all duration-300 shadow-sm',
                                                                        getColumnTint(col.score),
                                                                        selectedCardId &&
                                                                            'ring-2 ring-[var(--brand-accent)] ring-opacity-50 bg-[color-mix(in_srgb,var(--brand-accent),transparent_95%)] cursor-pointer hover:bg-[color-mix(in_srgb,var(--brand-accent),transparent_90%)] hover:ring-opacity-80 hover:scale-[1.02]'
                                                                    )}
                                                                    style={{
                                                                        width: cardDimensions.width,
                                                                        height: cardDimensions.height,
                                                                    }}
                                                                    role="button"
                                                                    tabIndex={0}
                                                                    aria-label={t(
                                                                        'fine.grid.slot_label',
                                                                        {
                                                                            score: col.score,
                                                                            row: rowIndex + 1,
                                                                            defaultValue: `Score ${col.score}, row ${rowIndex + 1}`,
                                                                        }
                                                                    )}
                                                                    onClick={() =>
                                                                        onSlotClick?.(
                                                                            colIndex,
                                                                            rowIndex
                                                                        )
                                                                    }
                                                                    onKeyDown={(e) => {
                                                                        if (
                                                                            e.key === 'Enter' ||
                                                                            e.key === ' '
                                                                        ) {
                                                                            onSlotClick?.(
                                                                                colIndex,
                                                                                rowIndex
                                                                            );
                                                                        }
                                                                    }}
                                                                >
                                                                    {renderSlotContent(
                                                                        colIndex,
                                                                        rowIndex,
                                                                        cardDimensions
                                                                    )}
                                                                </div>
                                                            ) : (
                                                                <DroppableSlot
                                                                    key={`${colIndex}-${rowIndex}`}
                                                                    id={`slot_${colIndex}_${rowIndex}`}
                                                                    role="gridcell"
                                                                    aria-label={t(
                                                                        'fine.grid.slot_label',
                                                                        {
                                                                            score: col.score,
                                                                            row: rowIndex + 1,
                                                                            defaultValue: `Score ${col.score}, row ${rowIndex + 1}`,
                                                                        }
                                                                    )}
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
                                                                    className={cn(
                                                                        'border-2 border-dashed border-slate-300/80 rounded-2xl flex items-center justify-center bg-opacity-40 transition-all duration-300 shadow-sm',
                                                                        getColumnTint(col.score),
                                                                        selectedCardId &&
                                                                            'ring-2 ring-[var(--brand-accent)] ring-opacity-50 bg-[color-mix(in_srgb,var(--brand-accent),transparent_95%)] cursor-pointer hover:bg-[color-mix(in_srgb,var(--brand-accent),transparent_90%)] hover:ring-opacity-80 hover:scale-[1.02]'
                                                                    )}
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
                                                <ScoreLabel
                                                    score={col.score}
                                                    id={`footer-${col.score}`}
                                                    className="mt-1"
                                                />
                                            </div>
                                        ))}
                                    </div>
                                    <GridLegend
                                        highlightKey={highlightKey}
                                        t={t}
                                        getLegendFontSize={getLegendFontSize}
                                        uiLabels={uiLabels}
                                    />
                                </div>
                            </TransformComponent>
                        </TransformWrapper>
                    </div>
                </div>

                {/* PANEL: SOURCE INVENTORY (Deck) */}
                <div
                    className={cn(
                        'flex-none bg-white border-gray-200 z-40 flex flex-col transition-all duration-300 overflow-hidden',
                        isLandscapeMobile
                            ? 'w-[min(280px,40vw)] h-full border-l shadow-md pr-safe'
                            : 'w-full lg:w-[360px] lg:border-r border-t lg:border-t-0 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] lg:shadow-md lg:h-full',
                        !isLandscapeMobile && (isMobile ? 'h-auto' : 'h-full')
                    )}
                >
                    {readOnly && sidebarContent ? (
                        <div className="h-full w-full overflow-hidden flex flex-col">
                            {sidebarContent}
                        </div>
                    ) : (
                        <>
                            {!isMobile && !isLandscapeMobile && (
                                <div className="flex-none pb-0 p-4">
                                    <ReadingZone variant="desktop" />
                                </div>
                            )}

                            {/* Category selector (Piles) */}
                            <div
                                className={cn(
                                    'flex-none lg:p-4 lg:pb-2',
                                    isLandscapeMobile ? 'p-2 pb-1' : 'p-2 pb-1 sm:p-3 sm:pb-1.5'
                                )}
                            >
                                <div
                                    className={cn(
                                        'flex w-full lg:grid lg:grid-cols-3',
                                        isLandscapeMobile ? 'gap-1' : 'gap-2'
                                    )}
                                    role="tablist"
                                >
                                    {(['disagree', 'neutral', 'agree'] as const).map((pile) => (
                                        <PileTab
                                            key={pile}
                                            pile={pile}
                                            isActive={activePile === pile}
                                            count={
                                                pile === 'disagree'
                                                    ? disagreeCards.length
                                                    : pile === 'agree'
                                                      ? agreeCards.length
                                                      : neutralCards.length
                                            }
                                            label={t(`common.${pile}`)}
                                            cardsLabel={t('common.cards')}
                                            compact={isLandscapeMobile}
                                            onClick={() => {
                                                setActivePile(pile);
                                            }}
                                        />
                                    ))}
                                </div>
                            </div>

                            <DroppableDeckArea
                                id={`deck-area-${activePile}`}
                                className={cn(
                                    'flex-col overflow-hidden relative',
                                    isLandscapeMobile
                                        ? 'flex-1 min-h-0 flex'
                                        : isMobile
                                          ? 'h-[100px] flex-none'
                                          : 'flex-1 min-h-0 flex'
                                )}
                            >
                                <div
                                    key={activePile}
                                    className={cn(
                                        'flex-1 min-h-0 custom-scrollbar',
                                        isLandscapeMobile
                                            ? 'grid grid-cols-2 gap-1.5 content-start overflow-y-auto overflow-x-hidden p-1.5'
                                            : 'p-1 px-2 flex flex-row gap-2 overflow-x-auto overflow-y-hidden items-stretch justify-start lg:grid lg:grid-cols-2 lg:gap-2 lg:content-start lg:overflow-y-auto lg:overflow-x-hidden lg:p-3',
                                        activeCards.length === 0 &&
                                            'justify-center lg:place-content-center'
                                    )}
                                    data-testid="deck-cards-container"
                                >
                                    {renderDeckCards()}
                                </div>
                                {/* Scroll hint: right-edge gradient for horizontal deck (portrait mobile only) */}
                                {isMobile && !isLandscapeMobile && activeCards.length > 0 && (
                                    <div
                                        className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-white to-transparent pointer-events-none z-10"
                                        aria-hidden="true"
                                    />
                                )}
                            </DroppableDeckArea>

                            <ValidationFooter
                                isAllPlaced={isAllPlaced}
                                selectedCardId={selectedCardId}
                                onValidate={onValidate}
                                onCancelSelection={
                                    selectedCardId && onCardClick
                                        ? handleCancelSelection
                                        : undefined
                                }
                                labels={inventoryLabels}
                                highlightKey={highlightKey}
                                compact={isLandscapeMobile}
                            />
                        </>
                    )}
                </div>
            </div>
        );
    }
);

export default GridSort;
