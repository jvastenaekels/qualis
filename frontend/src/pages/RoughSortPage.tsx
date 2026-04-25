/*
 * Libre-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

/**
 * Rough Sort Page (Step 3)
 *
 * Declarative shell — all durable logic lives in useRoughSort().
 *
 * Framer-motion MotionValues and derived transforms stay here because they must
 * be passed to both <CardStack> (x/y) and <motion.button> elements (scale/opacity).
 * The hook subscribes to x/y for the tip auto-dismiss side-effect.
 */

import {
    AnimatePresence,
    type MotionValue,
    motion,
    useMotionValue,
    useTransform,
} from 'framer-motion';
import { ArrowRight, Check, Frown, Keyboard, Meh, RotateCcw, Smile, Target, X } from 'lucide-react';
import { BREAKPOINTS } from '@/constants/breakpoints';
import React, { startTransition, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SafeMarkdown } from '../components/SafeMarkdown';
import CardStack, { type CardStackHandle } from '../components/CardStack';
import { useViewport } from '@/contexts/ViewportContext';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { useRoughSort } from '../hooks/participant/useRoughSort';

interface RoughSortPageProps {
    highlightKey?: string | null;
}

const RoughSortPage: React.FC<RoughSortPageProps> = ({ highlightKey }) => {
    // JSX-local motion state (MotionValues — cannot move to hook, they're framer primitives)
    const x = useMotionValue(0);
    const y = useMotionValue(0);
    const cardStackRef = useRef<CardStackHandle>(null);
    const [showTip, setShowTip] = useState(true);

    // All durable logic delegated to the hook
    const rough = useRoughSort(showTip, setShowTip, x, y, cardStackRef);

    const {
        config,
        showCodes,
        unsortedCards,
        currentCard,
        progress,
        agreeCount,
        disagreeCount,
        neutralCount,
        hoveredCard,
        setHoveredCard,
        roughHistory,
        sharedFontSize,
        handleUndo,
        handleVote,
        onVoteComplete,
        slug,
        location,
        navigate,
    } = rough;

    const { t } = useTranslation();

    // Micro-interaction transforms — depend on x/y MotionValues, must stay in component
    const scaleAgree = useTransform(x, [50, 150], [1, 1.15]);
    const scaleDisagree = useTransform(x, [-50, -150], [1, 1.15]);
    const scaleNeutral = useTransform(y, [50, 150], [1, 1.1]);

    const opacityDisagree = useTransform([x, y], ([latestX, latestY]: number[]): number => {
        if (latestX > 50) return 0.5;
        if (latestY > 50) return 0.5;
        return 1;
    });

    const opacityAgree = useTransform([x, y], ([latestX, latestY]: number[]): number => {
        if (latestX < -50) return 0.5;
        if (latestY > 50) return 0.5;
        return 1;
    });

    const opacityNeutral = useTransform(x, (latestX: number): number => {
        if (Math.abs(latestX) > 50) return 0.5;
        return 1;
    });

    if (!config) return null;

    // Completed State
    if (!currentCard) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-6 animate-in zoom-in duration-300 px-4 relative z-[60] pointer-events-auto">
                <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center text-green-600 mb-4">
                    <Check size={40} />
                </div>
                <h2 className="text-2xl font-bold">{t('rough.complete.title')}</h2>
                <p className="text-gray-600 max-w-md">{t('rough.complete.subtitle')}</p>

                <div className="flex flex-col gap-4 mt-4 items-center">
                    <button
                        type="button"
                        data-testid="rough-sort-next-btn"
                        onClick={() =>
                            startTransition(() =>
                                navigate(`/study/${slug}/fine-sort${location.search}`)
                            )
                        }
                        style={{ backgroundColor: 'var(--brand-accent)' }}
                        className="px-10 py-4 text-white rounded-full font-bold text-lg hover:brightness-110 shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all flex items-center justify-center gap-3 animate-pulse hover:animate-none w-full sm:w-auto"
                    >
                        {config.ui_labels?.['common.next'] || t('common.next')}{' '}
                        <ArrowRight size={18} />
                    </button>

                    <button
                        type="button"
                        onClick={handleUndo}
                        className="flex items-center justify-center gap-2 px-8 py-3 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100/50 transition-all text-sm font-bold active:scale-95 touch-manipulation"
                    >
                        <RotateCcw size={16} />
                        {config.ui_labels?.['common.undo'] || t('common.undo')}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="w-full px-2 sm:px-4 md:px-6 lg:max-w-7xl lg:mx-auto flex flex-col h-full overflow-hidden relative select-none">
            {/* 1. Slim Progress Bar */}
            <Progress
                value={progress}
                aria-label={t(
                    'rough.progress_label',
                    'Rough sort progress: {{percent}}% complete',
                    { percent: Math.round(progress) }
                )}
                className="h-1 w-full rounded-none bg-gray-100 flex-none z-30"
                indicatorClassName="bg-transparent transition-all duration-300 ease-out"
                indicatorStyle={{ backgroundColor: 'var(--brand-accent)' }}
            />

            {/* 2. Instruction Bar */}
            <div className="relative flex-none bg-white/60 backdrop-blur-sm border-b border-slate-100 flex items-center justify-center py-2 px-4 z-20 gap-3">
                <Target size={14} className="text-indigo-400 opacity-60 flex-none" />
                <div className="text-sm sm:text-base font-semibold text-slate-700 text-center leading-relaxed max-w-2xl px-2 [&_strong]:font-bold [&_strong]:text-slate-900 flex items-center gap-2">
                    <SafeMarkdown
                        components={{
                            p: ({ children }) => <span>{children}</span>,
                        }}
                    >
                        {config.pre_instruction || config.condition_of_instruction}
                    </SafeMarkdown>
                    <span className="text-slate-400 text-2xs sm:text-xs font-medium bg-slate-100 rounded-full px-2 py-0.5 border border-slate-200/50">
                        {config &&
                            `${config.statements.length - unsortedCards.length + 1}/${config.statements.length}`}
                    </span>
                </div>

                {/* INLINE TIP */}
                <AnimatePresence>
                    {showTip && (
                        <motion.div
                            key="rough-tip-inline"
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="absolute top-full left-0 right-0 z-30 flex justify-center pt-2 px-4 pointer-events-none"
                        >
                            <div className="bg-yellow-50 border border-yellow-100 rounded-lg p-2.5 flex items-center justify-center gap-2.5 relative mx-auto text-center shadow-md max-w-sm pointer-events-auto">
                                <span className="text-lg">💡</span>
                                <div className="text-xs text-yellow-800 font-medium leading-tight text-left [&_strong]:font-bold">
                                    <SafeMarkdown
                                        components={{
                                            p: ({ children }) => <span>{children}</span>,
                                        }}
                                    >
                                        {t('rough.header.hint')}
                                    </SafeMarkdown>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setShowTip(false)}
                                    aria-label="Close tip"
                                    className="p-1 text-yellow-600 hover:text-yellow-800 rounded-full hover:bg-yellow-100 transition-colors flex-none"
                                >
                                    <X size={14} />
                                </button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* 3. The Control Cluster */}
            <div className="flex-1 min-h-0 flex flex-col items-center justify-center w-full px-0 sm:px-2 pt-12 pb-4 relative gap-2 sm:gap-8 md:gap-12">
                {/* Row A: Horizon (Disagree - Card - Agree) */}
                <div className="flex flex-row items-center justify-center gap-2 sm:gap-8 md:gap-12 w-full">
                    {/* Left Button (Disagree) */}
                    <DeckButton
                        type="disagree"
                        count={disagreeCount}
                        onClick={() => handleVote('disagree')}
                        scale={scaleDisagree}
                        opacity={opacityDisagree}
                        highlightKey={highlightKey}
                        sharedFontSize={sharedFontSize}
                        uiLabels={config?.ui_labels}
                    />

                    {/* Card Zone */}
                    <div className="relative flex-1 h-auto aspect-[3/4] sm:aspect-[4/3] flex justify-center items-center z-10 sm:max-w-sm md:max-w-md min-w-[6rem] min-h-[8rem] sm:min-w-[12rem] sm:min-h-[9rem]">
                        <div className="w-full h-full relative">
                            <CardStack
                                ref={cardStackRef}
                                key={currentCard.id}
                                statement={{
                                    ...currentCard,
                                    code: showCodes ? currentCard.code : undefined,
                                }}
                                onVote={onVoteComplete}
                                x={x}
                                y={y}
                            />
                        </div>
                    </div>

                    {/* Right Button (Agree) */}
                    <DeckButton
                        type="agree"
                        count={agreeCount}
                        onClick={() => handleVote('agree')}
                        scale={scaleAgree}
                        opacity={opacityAgree}
                        highlightKey={highlightKey}
                        sharedFontSize={sharedFontSize}
                        uiLabels={config?.ui_labels}
                    />
                </div>

                {/* Row B: Anchor (Neutral Pill + Undo) */}
                <div className="flex flex-col items-center gap-8 w-full px-2">
                    <DeckButton
                        type="neutral"
                        count={neutralCount}
                        onClick={() => handleVote('neutral')}
                        scale={scaleNeutral}
                        opacity={opacityNeutral}
                        highlightKey={highlightKey}
                        sharedFontSize={sharedFontSize}
                        uiLabels={config?.ui_labels}
                    />

                    <div className="flex items-center gap-4">
                        <button
                            type="button"
                            onClick={handleUndo}
                            disabled={roughHistory.length === 0}
                            className="flex items-center gap-2 px-6 py-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-50 disabled:opacity-0 transition-all text-xs sm:text-sm font-bold active:scale-95 touch-manipulation"
                            aria-keyshortcuts="z"
                        >
                            <RotateCcw size={14} />
                            {config.ui_labels?.['common.undo'] || t('common.undo')}
                        </button>
                        {/* Desktop Keyboard Shortcuts Hint */}
                        <div className="hidden lg:flex items-center gap-1.5 text-2xs text-slate-400 font-medium">
                            <kbd className="px-1.5 py-0.5 bg-slate-100 rounded border border-slate-200">
                                ←
                            </kbd>
                            <kbd className="px-1.5 py-0.5 bg-slate-100 rounded border border-slate-200">
                                ↓
                            </kbd>
                            <kbd className="px-1.5 py-0.5 bg-slate-100 rounded border border-slate-200">
                                →
                            </kbd>
                            <Keyboard size={14} className="text-slate-400" />
                        </div>
                    </div>
                </div>
            </div>

            <AnimatePresence>
                {hoveredCard && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 sm:p-8"
                        onClick={() => setHoveredCard(null)}
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.9, opacity: 0, y: 20 }}
                            onClick={(e) => e.stopPropagation()}
                            className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
                        >
                            <div className="p-6 sm:p-8 overflow-y-auto custom-scrollbar">
                                <div className="text-xl sm:text-2xl font-medium text-gray-800 leading-relaxed">
                                    <SafeMarkdown
                                        components={{
                                            p: ({ children }) => (
                                                <p className="mb-4 last:mb-0">{children}</p>
                                            ),
                                        }}
                                    >
                                        {hoveredCard.text}
                                    </SafeMarkdown>
                                </div>
                            </div>
                            <div className="p-4 bg-gray-50 border-t border-gray-100 flex justify-end">
                                <button
                                    type="button"
                                    onClick={() => setHoveredCard(null)}
                                    className="px-6 py-2 bg-slate-900 text-white rounded-full font-bold text-sm tracking-wide hover:bg-slate-800 transition-colors"
                                >
                                    {t('common.close')}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default RoughSortPage;

interface DeckButtonProps {
    type: 'agree' | 'disagree' | 'neutral';
    count: number;
    onClick: () => void;
    scale: MotionValue<number>;
    opacity: MotionValue<number>;
    highlightKey?: string | null;
    sharedFontSize: string;
    isNeutral?: boolean;
    uiLabels?: Record<string, string>;
}

const DeckButton: React.FC<DeckButtonProps> = ({
    type,
    count,
    onClick,
    scale,
    opacity,
    highlightKey,
    sharedFontSize,
    uiLabels,
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: DeckButton visual complexity is inherent (3 types × animation states); TODO(quality-roadmap): split into per-type sub-components
}) => {
    const { t } = useTranslation();
    const { width } = useViewport();
    const styleConfig = React.useMemo(() => {
        const base =
            'flex flex-col items-center justify-center rounded-2xl border-2 shadow-sm transition-all duration-200 gap-0.5 sm:gap-1 px-1.5 w-full h-full';
        switch (type) {
            case 'agree':
                return {
                    className: cn(
                        base,
                        'bg-green-50 text-green-600 hover:bg-green-100 border-green-100'
                    ),
                    icon: (
                        <Smile size={18} strokeWidth={2.5} className="sm:w-7 sm:h-7 opacity-80" />
                    ),
                    badgeClass: 'bg-green-600',
                    bgCardClass: 'bg-green-50 border-green-100',
                    ariaKey: 'ArrowRight',
                    testid: 'rough-agree-btn',
                };
            case 'disagree':
                return {
                    className: cn(base, 'bg-red-50 text-red-600 hover:bg-red-100 border-red-100'),
                    icon: (
                        <Frown size={18} strokeWidth={2.5} className="sm:w-7 sm:h-7 opacity-80" />
                    ),
                    badgeClass: 'bg-red-600',
                    bgCardClass: 'bg-red-50 border-red-100',
                    ariaKey: 'ArrowLeft',
                    testid: 'rough-disagree-btn',
                };
            case 'neutral':
                return {
                    className: cn(
                        base,
                        'bg-blue-50 text-blue-600 hover:bg-blue-100 border-blue-100'
                    ),
                    icon: <Meh size={18} strokeWidth={2.5} className="sm:w-7 sm:h-7 opacity-80" />,
                    badgeClass: 'bg-blue-600',
                    bgCardClass: 'bg-blue-50 border-blue-100',
                    ariaKey: 'ArrowDown',
                    testid: 'rough-neutral-btn',
                };
        }
    }, [type]);

    // Adaptive stack effect values
    const isMobile = width < BREAKPOINTS.SM;
    const rotate1 =
        type === 'agree'
            ? isMobile
                ? 2
                : 4
            : type === 'disagree'
              ? isMobile
                  ? -2
                  : -4
              : isMobile
                ? 1
                : 2;
    const rotate2 =
        type === 'agree'
            ? isMobile
                ? -1.5
                : -3
            : type === 'disagree'
              ? isMobile
                  ? 1.5
                  : 3
              : isMobile
                ? -1
                : -2;
    const offset1 = isMobile ? 2 : 3;
    const offset2 = isMobile ? 4 : 6;

    return (
        <div className="relative group flex-none w-24 h-32 sm:w-48 sm:h-36 z-20">
            {/* Visual Stack Effect (Background Cards) */}
            <AnimatePresence>
                {count > 0 && (
                    <>
                        <motion.div
                            initial={{ scale: 1, opacity: 0 }}
                            animate={{
                                opacity: 1,
                                rotate: rotate1,
                                y: offset1,
                            }}
                            exit={{ opacity: 0 }}
                            className={cn(
                                'absolute inset-0 rounded-2xl border-2 z-0 transform',
                                styleConfig.bgCardClass
                            )}
                        />
                        {count > 3 && (
                            <motion.div
                                initial={{ scale: 1, opacity: 0 }}
                                animate={{
                                    opacity: 0.8,
                                    rotate: rotate2,
                                    y: offset2,
                                }}
                                exit={{ opacity: 0 }}
                                className={cn(
                                    'absolute inset-0 rounded-2xl border-2 z-0 transform bg-white',
                                    styleConfig.bgCardClass
                                )}
                            />
                        )}
                    </>
                )}
            </AnimatePresence>

            <motion.button
                style={{ scale, opacity }}
                onClick={onClick}
                data-testid={styleConfig.testid}
                className={cn(
                    styleConfig.className,
                    'absolute inset-0 z-10',
                    highlightKey === `common.${type}` &&
                        'ring-4 ring-[var(--brand-accent)] ring-offset-2 animate-pulse z-[100] relative shadow-[0_0_20px_color-mix(in_srgb,var(--brand-accent),transparent_50%)]'
                )}
                aria-label={uiLabels?.[`common.${type}`] || t(`common.${type}`)}
                aria-keyshortcuts={styleConfig.ariaKey}
            >
                <div className="flex flex-col items-center">
                    {styleConfig.icon}
                    <span
                        lang={t('common.lang_code', { defaultValue: 'en' })}
                        className={cn(
                            sharedFontSize,
                            'font-bold text-center leading-[1.1] break-words hyphens-auto text-xs sm:text-sm px-0.5'
                        )}
                    >
                        {uiLabels?.[`common.${type}`] || t(`common.${type}`)}
                    </span>
                </div>
            </motion.button>
            <AnimatePresence>
                {count > 0 && (
                    <motion.span
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0, opacity: 0 }}
                        className={cn(
                            'absolute -top-2 -right-2 sm:-top-3 sm:-right-3 w-6 h-6 sm:w-7 sm:h-7 flex items-center justify-center rounded-full text-2xs sm:text-xs font-bold border-2 shadow-sm z-30 text-white border-white',
                            styleConfig.badgeClass
                        )}
                    >
                        {count}
                    </motion.span>
                )}
            </AnimatePresence>
        </div>
    );
};
