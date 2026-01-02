/*
 * Open-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { AnimatePresence, motion, useMotionValue, useTransform } from 'framer-motion';
import { ArrowRight, Check, Frown, Meh, RotateCcw, Smile, X } from 'lucide-react';
import type React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import { useNavigate, useParams } from 'react-router-dom';
import CardStack, { type CardStackHandle } from '../components/CardStack';
import { useConfigStore } from '../store/useConfigStore';
import { useResponseStore } from '../store/useResponseStore';
import { useSessionStore } from '../store/useSessionStore';
import { useUIStore } from '../store/useUIStore';

const RoughSortPage: React.FC = () => {
    const { slug } = useParams();
    const navigate = useNavigate();

    // Config Store
    const config = useConfigStore((state) => state.config);
    const showCodes = config?.show_statement_codes ?? false;

    // Response Store
    const responses = useResponseStore((state) => ({ rough: state.rough }));
    const categorizeCard = useResponseStore((state) => state.categorizeCard);
    const undoRoughSort = useResponseStore((state) => state.undoRoughSort);

    // Session Store
    const setStep = useSessionStore((state) => state.setStep);

    const cardStackRef = useRef<CardStackHandle>(null);
    const hoveredCard = useUIStore((state) => state.hoveredCard);
    const setHoveredCard = useUIStore((state) => state.setHoveredCard);

    const { t } = useTranslation();

    const [showTip, setShowTip] = useState(false);

    // Show tip after 1.5s delay for user orientation
    useEffect(() => {
        const timer = setTimeout(() => setShowTip(true), 1500);
        return () => clearTimeout(timer);
    }, []);

    // Motion Values lifted from CardStack
    const x = useMotionValue(0);
    const y = useMotionValue(0);

    // Set Step 3 on mount
    useEffect(() => {
        setStep(3);
    }, [setStep]);

    // Auto-dismiss tip on first interaction (mobile only)
    useEffect(() => {
        if (!showTip || typeof window === 'undefined' || window.innerWidth >= 1024) return;

        const unsubscribeX = x.on('change', (latest) => {
            if (Math.abs(latest) > 5) {
                setShowTip(false);
            }
        });

        const unsubscribeY = y.on('change', (latest) => {
            if (Math.abs(latest) > 5) {
                setShowTip(false);
            }
        });

        return () => {
            unsubscribeX();
            unsubscribeY();
        };
    }, [showTip, x, y]);

    // Auto-dismiss tip after 5 cards sorted (all devices)
    useEffect(() => {
        if (showTip && responses.rough.history.length >= 5) {
            setShowTip(false);
        }
    }, [responses.rough.history.length, showTip]);

    const unsortedCards = useMemo(() => {
        if (!config?.statements) return [];
        const sortedIds = new Set(responses.rough.history);
        return config.statements.filter((s) => !sortedIds.has(s.id));
    }, [config, responses.rough.history]);

    const currentCard = unsortedCards[0];
    const progress = config?.statements
        ? ((config.statements.length - unsortedCards.length) / config.statements.length) * 100
        : 0;

    // --- Micro-interactions ---

    // Scaling (Active State)
    const scaleAgree = useTransform(x, [50, 150], [1, 1.15]);
    const scaleDisagree = useTransform(x, [-50, -150], [1, 1.15]);
    const scaleNeutral = useTransform(y, [50, 150], [1, 1.1]); // Slightly less scale for the wide dock

    // Opacity (Dimming Inactive)
    const opacityDisagree = useTransform([x, y], ([latestX, latestY]: number[]) => {
        if (latestX > 50) return 0.5; // Dragging Right
        if (latestY > 50) return 0.5; // Dragging Down
        return 1;
    });

    const opacityAgree = useTransform([x, y], ([latestX, latestY]: number[]) => {
        if (latestX < -50) return 0.5; // Dragging Left
        if (latestY > 50) return 0.5; // Dragging Down
        return 1;
    });

    const opacityNeutral = useTransform(x, (latestX: number) => {
        if (Math.abs(latestX) > 50) return 0.5; // Dragging Left or Right
        return 1;
    });

    const handleVote = (direction: 'agree' | 'disagree' | 'neutral') => {
        // Auto-dismiss tip on button click (mobile only)
        if (showTip && typeof window !== 'undefined' && window.innerWidth < 1024) {
            setShowTip(false);
        }
        // We now delegate to the card stack to animate first
        if (cardStackRef.current) {
            cardStackRef.current.swipe(direction);
        }
    };

    // Called after animation finishes by CardStack
    const onVoteComplete = (direction: 'agree' | 'disagree' | 'neutral') => {
        if (currentCard) {
            categorizeCard(currentCard.id, direction);
            x.set(0);
            y.set(0);
        }
    };

    // Keyboard Support
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!currentCard || !cardStackRef.current) return;
            switch (e.key) {
                case 'ArrowLeft':
                    cardStackRef.current.swipe('disagree');
                    break;
                case 'ArrowRight':
                    cardStackRef.current.swipe('agree');
                    break;
                case 'ArrowDown':
                    cardStackRef.current.swipe('neutral');
                    break;
                case 'z':
                    if (responses.rough.history.length > 0) undoRoughSort();
                    break;
                case 'Escape':
                    setShowTip(false);
                    setHoveredCard(null);
                    break;
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [currentCard, responses.rough.history.length, undoRoughSort, setHoveredCard]);

    // Calculate shared font size for buttons (Harmonization)
    const sharedFontSize = useMemo(() => {
        if (typeof window === 'undefined' || window.innerWidth >= 1024) return 'text-sm';

        const labels = [t('common.disagree'), t('common.agree'), t('common.neutral')];
        // Extract words and find the longest one
        const words = labels.flatMap((l) => l.split(/[\s/]+/));
        const maxWordLength = Math.max(...words.map((w) => w.length));

        // Thresholds based on w-20 (80px)
        if (maxWordLength > 10) return 'text-[10px]';
        if (maxWordLength > 8) return 'text-xs';
        return 'text-sm';
    }, [t]);

    if (!config) return null;

    // Completed State
    if (!currentCard) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-6 animate-in zoom-in duration-300 px-4">
                <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center text-green-600 mb-4">
                    <Check size={40} />
                </div>
                <h2 className="text-2xl font-bold">{t('rough.complete.title')}</h2>
                <p className="text-gray-600 max-w-md">{t('rough.complete.subtitle')}</p>

                <div className="flex flex-col gap-4 mt-4 items-center">
                    <button
                        type="button"
                        onClick={() => navigate(`/study/${slug}/fine-sort`)}
                        className="px-8 py-3 bg-blue-600 text-white rounded-md font-bold text-base hover:bg-blue-700 shadow-md flex items-center justify-center gap-2 animate-pulse hover:animate-none transition-all w-full sm:w-auto"
                    >
                        {t('common.next')} <ArrowRight size={18} />
                    </button>

                    <button
                        type="button"
                        onClick={undoRoughSort}
                        className="px-6 py-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors flex items-center gap-2 text-sm font-medium"
                    >
                        <RotateCcw size={14} />
                        {t('common.undo')}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="w-full px-4 md:px-6 lg:max-w-7xl lg:mx-auto flex flex-col h-full overflow-hidden relative select-none">
            {/* 1. Slim Progress Bar (Top) */}
            <div className="w-full h-1 bg-gray-100 flex-none z-30">
                <div
                    className="h-full bg-indigo-500 transition-all duration-300 ease-out"
                    style={{ width: `${progress}%` }}
                />
            </div>

            {/* 2. Instruction Bar (Visual Separation) */}
            <div className="flex-none bg-slate-50 flex items-center justify-between border-b border-gray-100 z-20 shadow-sm relative transition-all duration-500 py-2">
                <div className="w-12 lg:w-20 hidden sm:block" />

                <div className="flex-1 px-2 flex flex-col items-center justify-center">
                    <h3 className="font-bold text-slate-700 leading-tight text-center transition-all duration-500 text-base sm:text-lg flex items-center gap-2">
                        {t('rough.header.title')}
                        <span className="text-slate-400 text-sm font-medium">
                            {config &&
                                `(${config.statements.length - unsortedCards.length + 1}/${config.statements.length})`}
                        </span>
                    </h3>

                    {/* INLINE TIP (Attached to Title) */}
                    <AnimatePresence>
                        {showTip && (
                            <motion.div
                                key="rough-tip-inline"
                                initial={{ opacity: 0, height: 0, marginTop: 0 }}
                                animate={{ opacity: 1, height: 'auto', marginTop: 8 }}
                                exit={{ opacity: 0, height: 0, marginTop: 0 }}
                                className="w-full max-w-sm overflow-hidden"
                            >
                                <div className="bg-yellow-50 border border-yellow-100 rounded-lg p-2.5 flex items-center justify-center gap-2.5 relative mx-auto text-center shadow-sm">
                                    <span className="text-lg">💡</span>
                                    <div className="text-xs text-yellow-800 font-medium leading-tight text-left [&_strong]:font-bold">
                                        <ReactMarkdown
                                            components={{
                                                p: ({ children }) => <span>{children}</span>,
                                            }}
                                        >
                                            {t('rough.header.hint')}
                                        </ReactMarkdown>
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

                <div className="w-12 lg:w-20 hidden sm:block" />
            </div>

            {/* 3. The Control Cluster (Centered Stage) */}
            <div className="flex-1 min-h-0 flex flex-col items-center justify-center w-full px-2 py-4 relative gap-2 sm:gap-8 md:gap-12">
                {/* FLOATING TIP REMOVED (Moved to Header) */}

                {/* Row A: Horizon (Disagree - Card - Agree) */}
                <div className="flex flex-row items-center justify-center gap-2 sm:gap-8 md:gap-12 w-full">
                    {/* Left Button (Disagree) */}
                    <motion.button
                        style={{ scale: scaleDisagree, opacity: opacityDisagree }}
                        onClick={() => handleVote('disagree')}
                        className="z-20 flex-none flex flex-col items-center justify-center w-20 min-h-40 h-auto py-3 sm:w-[9.1rem] sm:h-[9.1rem] rounded-2xl bg-red-50 text-red-600 hover:bg-red-100 border-2 border-red-100 shadow-sm transition-colors gap-1 px-1"
                        aria-label={t('common.disagree')}
                        aria-keyshortcuts="ArrowLeft"
                    >
                        <div className="flex flex-col items-center gap-0.5 sm:gap-1">
                            <Frown
                                size={20}
                                strokeWidth={2.5}
                                className="sm:w-7 sm:h-7 opacity-80"
                            />
                            <span
                                lang={t('common.lang_code', { defaultValue: 'en' })}
                                className={`${sharedFontSize} font-bold uppercase tracking-wide text-center leading-tight break-words hyphens-auto`}
                            >
                                {t('common.disagree')}
                            </span>
                        </div>
                    </motion.button>

                    {/* Card Zone */}
                    <div className="relative flex-1 h-auto aspect-[3/4] sm:aspect-[4/3] flex justify-center items-center z-10 sm:max-w-sm md:max-w-md">
                        <div className="w-full h-full relative">
                            {/* Desktop/Tablet Hover Tip (Keep absolute for large screens, hidden on mobile) */}
                            <AnimatePresence>
                                {showTip && window.innerWidth >= 1024 && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                        exit={{
                                            opacity: 0,
                                            scale: 0.9,
                                            transition: { duration: 0.2 },
                                        }}
                                        className="absolute -top-12 left-1/2 -translate-x-1/2 z-50 w-full max-w-[240px] pointer-events-none"
                                    >
                                        <div className="text-slate-500 text-xs font-semibold uppercase tracking-wider py-2 px-4 flex items-center justify-center gap-2 whitespace-nowrap opacity-80">
                                            {t('rough.instructions.desktop_tip')}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>

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
                    <motion.button
                        style={{ scale: scaleAgree, opacity: opacityAgree }}
                        onClick={() => handleVote('agree')}
                        className="z-20 flex-none flex flex-col items-center justify-center w-20 min-h-40 h-auto py-3 sm:w-[9.1rem] sm:h-[9.1rem] rounded-2xl bg-green-50 text-green-600 hover:bg-green-100 border-2 border-green-100 shadow-sm transition-colors gap-1 px-1"
                        aria-label={t('common.agree')}
                        aria-keyshortcuts="ArrowRight"
                    >
                        <div className="flex flex-col items-center gap-0.5 sm:gap-1">
                            <Smile
                                size={20}
                                strokeWidth={2.5}
                                className="sm:w-7 sm:h-7 opacity-80"
                            />
                            <span
                                lang={t('common.lang_code', { defaultValue: 'en' })}
                                className={`${sharedFontSize} font-bold uppercase tracking-wide text-center leading-tight break-words hyphens-auto`}
                            >
                                {t('common.agree')}
                            </span>
                        </div>
                    </motion.button>
                </div>

                {/* Row B: Anchor (Neutral Pill + Undo) */}
                <div className="flex flex-col items-center gap-4 w-full px-2">
                    <motion.button
                        style={{ scale: scaleNeutral, opacity: opacityNeutral }}
                        onClick={() => handleVote('neutral')}
                        className="w-auto min-w-[160px] max-w-[240px] px-8 sm:max-w-none sm:w-[18.2rem] h-16 sm:h-[5.6rem] rounded-2xl bg-gray-100 text-gray-500 hover:bg-gray-200 border-2 border-gray-200 hover:border-gray-300 flex items-center justify-center gap-2 font-bold uppercase tracking-wide shadow-sm transition-colors"
                        aria-label={t('common.neutral')}
                        aria-keyshortcuts="ArrowDown"
                    >
                        <div className="flex items-center gap-2 text-gray-600">
                            <Meh size={20} strokeWidth={2.5} className="opacity-80" />
                            <span
                                lang={t('common.lang_code', { defaultValue: 'en' })}
                                className={`${sharedFontSize} font-bold tracking-wide break-words hyphens-auto`}
                            >
                                {t('common.neutral')}
                            </span>
                        </div>
                    </motion.button>

                    <button
                        type="button"
                        onClick={undoRoughSort}
                        disabled={responses.rough.history.length === 0}
                        className="flex items-center gap-2 px-6 py-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-0 transition-all text-xs font-bold uppercase tracking-widest"
                        aria-keyshortcuts="z"
                    >
                        <RotateCcw size={14} />
                        {t('common.undo')}
                    </button>
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
                            onClick={(e) => e.stopPropagation()} // Prevent closing on content click
                            className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
                        >
                            <div className="p-6 sm:p-8 overflow-y-auto custom-scrollbar">
                                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4">
                                    {t('common.statement')} {hoveredCard.id}{' '}
                                    {hoveredCard.code && <span>• {hoveredCard.code}</span>}
                                </h3>
                                <div className="text-xl sm:text-2xl font-medium text-gray-800 leading-relaxed">
                                    <ReactMarkdown
                                        components={{
                                            p: ({ children }) => (
                                                <p className="mb-4 last:mb-0">{children}</p>
                                            ),
                                        }}
                                    >
                                        {hoveredCard.text}
                                    </ReactMarkdown>
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
