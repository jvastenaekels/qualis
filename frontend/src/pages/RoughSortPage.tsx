/*
 * Open-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMotionValue, useTransform, motion, AnimatePresence } from 'framer-motion';
import { useConfigStore } from '../store/useConfigStore';
import { useResponseStore } from '../store/useResponseStore';
import { useSessionStore } from '../store/useSessionStore';
import CardStack, { type CardStackHandle } from '../components/CardStack';
import { Check, X, RotateCcw, ArrowRight, Frown, Smile, Meh, Eye } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useUIStore } from '../store/useUIStore';


const RoughSortPage: React.FC = () => {
    const { slug } = useParams();
    const navigate = useNavigate();
    
    // Config Store
    const config = useConfigStore((state) => state.config);
    
    // Response Store
    const responses = useResponseStore((state) => ({ rough: state.rough }));
    const categorizeCard = useResponseStore((state) => state.categorizeCard);
    const undoRoughSort = useResponseStore((state) => state.undoRoughSort);
    
    // Session Store
    const setStep = useSessionStore((state) => state.setStep);
    
    const cardStackRef = useRef<CardStackHandle>(null);
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

    const unsortedCards = useMemo(() => {
        if (!config) return [];
        const sortedIds = new Set(responses.rough.history);
        return config.statements.filter(s => !sortedIds.has(s.id));
    }, [config, responses.rough.history]);


    const currentCard = unsortedCards[0];
    const progress = config ? ((config.statements.length - unsortedCards.length) / config.statements.length) * 100 : 0;

    // --- Micro-interactions ---

    // Scaling (Active State)
    const scaleAgree = useTransform(x, [50, 150], [1, 1.15]);
    const scaleDisagree = useTransform(x, [-50, -150], [1, 1.15]);
    const scaleNeutral = useTransform(y, [50, 150], [1, 1.1]); // Slightly less scale for the wide dock

    // Opacity (Dimming Inactive)
    const opacityDisagree = useTransform(
        [x, y], 
        ([latestX, latestY]: number[]) => {
            if (latestX > 50) return 0.5; // Dragging Right
            if (latestY > 50) return 0.5; // Dragging Down
            return 1;
        }
    );

    const opacityAgree = useTransform(
        [x, y],
        ([latestX, latestY]: number[]) => {
            if (latestX < -50) return 0.5; // Dragging Left
            if (latestY > 50) return 0.5; // Dragging Down
            return 1;
        }
    );

    const opacityNeutral = useTransform(
        x,
        (latestX: number) => {
            if (Math.abs(latestX) > 50) return 0.5; // Dragging Left or Right
            return 1;
        }
    );

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
            switch(e.key) {
                case 'ArrowLeft': cardStackRef.current.swipe('disagree'); break;
                case 'ArrowRight': cardStackRef.current.swipe('agree'); break;
                case 'ArrowDown': cardStackRef.current.swipe('neutral'); break;
                case 'z': if(responses.rough.history.length > 0) undoRoughSort(); break; 
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [currentCard, responses.rough.history.length, undoRoughSort]);

    // Calculate shared font size for buttons (Harmonization)
    const sharedFontSize = useMemo(() => {
        if (typeof window === 'undefined' || window.innerWidth >= 1024) return 'text-sm';
        
        const labels = [t('common.disagree'), t('common.agree'), t('common.neutral')];
        // Extract words and find the longest one
        const words = labels.flatMap(l => l.split(/[\s/]+/));
        const maxWordLength = Math.max(...words.map(w => w.length));
        
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
                 <p className="text-gray-600 max-w-md">
                     {t('rough.complete.subtitle')}
                 </p>
                  
                  <div className="flex flex-col gap-4 mt-4 items-center">
                    <button
                        onClick={() => navigate(`/study/${slug}/sort`)} 
                        className="px-8 py-3 bg-blue-600 text-white rounded-md font-bold text-base hover:bg-blue-700 shadow-md flex items-center justify-center gap-2 animate-pulse hover:animate-none transition-all w-full sm:w-auto"
                    >
                        {t('common.next')} <ArrowRight size={18} />
                    </button>

                     <button
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
                    <h3 className="font-bold text-slate-700 leading-tight text-center transition-all duration-500 text-base sm:text-lg">
                        {t('rough.header.title')}
                    </h3>
                </div>

                <div className="w-12 lg:w-20 hidden sm:block" />
            </div>



            {/* 3. The Control Cluster (Centered Stage) */}
            <div className="flex-1 min-h-0 flex flex-col items-center justify-center w-full px-2 py-4 relative">
                
                {/* FLOATING TIP */}
                <AnimatePresence>
                    {showTip && (
                        <motion.div 
                            key="rough-tip"
                            className="absolute top-4 left-4 z-40 max-w-xs block select-none pointer-events-auto"
                            initial={{ opacity: 0, x: -100, scale: 0.9 }}
                            animate={{ opacity: 1, x: 0, scale: 1 }}
                            exit={{ opacity: 0, x: 300, scale: 0.9, rotate: 5 }}
                            transition={{ 
                                type: "spring", 
                                stiffness: 300, 
                                damping: 25,
                                opacity: { duration: 0.3 }
                            }}
                        >
                            <motion.div 
                                drag="x"
                                dragConstraints={{ left: 0, right: 0 }}
                                dragElastic={0.5}
                                onDragEnd={(_, info) => {
                                    if (Math.abs(info.offset.x) > 30 || Math.abs(info.velocity.x) > 100) {
                                        setShowTip(false);
                                    }
                                }}
                                className="bg-white/90 backdrop-blur-sm border border-blue-100 shadow-lg rounded-xl p-4 flex gap-3 relative pr-8 cursor-grab active:cursor-grabbing"
                            >
                                <span className="text-lg">💡</span>
                                <p className="text-sm text-slate-600 leading-relaxed font-medium">
                                    {t('rough.header.hint')}
                                </p>
                                <button 
                                    onClick={() => setShowTip(false)}
                                    className="absolute top-2 right-2 p-1 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors"
                                >
                                    <X size={14} />
                                </button>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>


                {/* Row A: Horizon (Disagree - Card - Agree) */}
                <div className="flex flex-row items-center justify-center gap-2 sm:gap-8 md:gap-12 w-full">
                    {/* Left Button (Disagree) */}
                    <motion.button
                        style={{ scale: scaleDisagree, opacity: opacityDisagree }}
                        onClick={() => handleVote('disagree')}
                        className="z-20 flex-none flex flex-col items-center justify-center w-20 min-h-24 h-auto py-3 sm:w-[9.1rem] sm:h-[9.1rem] rounded-2xl bg-red-50 text-red-600 hover:bg-red-100 border-2 border-red-100 shadow-sm transition-colors gap-1 px-1"
                        aria-label={t('common.disagree')}
                    >
                        <div className="flex flex-col items-center gap-0.5 sm:gap-1">
                             <Frown size={20} strokeWidth={2.5} className="sm:w-7 sm:h-7 opacity-80" />
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
                            {/* Tips Overlay */}
                            <AnimatePresence>
                                {showTip && (
                                    <motion.div 
                                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                        exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
                                        className="absolute -top-12 left-1/2 -translate-x-1/2 z-50 w-full max-w-[240px] pointer-events-none"
                                    >
                                        <div className="bg-indigo-600 text-white text-[10px] font-bold uppercase tracking-widest py-2 px-4 rounded-full shadow-lg flex items-center justify-center gap-2 border border-indigo-400/30 whitespace-nowrap">
                                            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                                            {window.innerWidth < 1024 
                                                ? t('fine.workbench.drag_or_tap') 
                                                : "Glissez ou cliquez pour trier"}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            <CardStack 
                                ref={cardStackRef}
                                key={currentCard.id} 
                                statement={currentCard} 
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
                        className="z-20 flex-none flex flex-col items-center justify-center w-20 min-h-24 h-auto py-3 sm:w-[9.1rem] sm:h-[9.1rem] rounded-2xl bg-green-50 text-green-600 hover:bg-green-100 border-2 border-green-100 shadow-sm transition-colors gap-1 px-1"
                        aria-label={t('common.agree')}
                    >
                        <div className="flex flex-col items-center gap-0.5 sm:gap-1">
                            <Smile size={20} strokeWidth={2.5} className="sm:w-7 sm:h-7 opacity-80" />
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
                <div className="mt-8 flex flex-col items-center gap-6">
                    <motion.button
                        style={{ scale: scaleNeutral, opacity: opacityNeutral }}
                        onClick={() => handleVote('neutral')}
                        className="w-[18.2rem] h-[5.6rem] rounded-2xl bg-gray-100 text-gray-500 hover:bg-gray-200 border-2 border-gray-200 hover:border-gray-300 flex items-center justify-center gap-2 font-bold uppercase tracking-wide shadow-sm transition-colors"
                        aria-label={t('common.neutral')}
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
                        onClick={undoRoughSort}
                        disabled={responses.rough.history.length === 0}
                        className="flex items-center gap-2 px-6 py-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-0 transition-all text-xs font-bold uppercase tracking-widest"
                    >
                        <RotateCcw size={14} />
                        {t('common.undo')}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default RoughSortPage;
