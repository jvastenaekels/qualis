import React, { useEffect, useMemo, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMotionValue, useTransform, motion } from 'framer-motion';
import { useStudyStore } from '../store/useStudyStore';
import CardStack, { type CardStackHandle } from '../components/CardStack';
import { Check, X, RotateCcw, ArrowRight, Frown, Smile, Meh } from 'lucide-react';
import { useTranslation } from 'react-i18next';


const RoughSortPage: React.FC = () => {
    const { slug } = useParams();
    const navigate = useNavigate();
    const { config, responses, categorizeCard, undoRoughSort, setStep } = useStudyStore();
    const cardStackRef = useRef<CardStackHandle>(null);
    const { t } = useTranslation();



    const [showTip, setShowTip] = React.useState(true);

    // Set Step 3 on mount
    useEffect(() => {
        setStep(3);
    }, [setStep]);



    // Motion Values lifted from CardStack
    const x = useMotionValue(0);
    const y = useMotionValue(0);

    // Filter unsorted cards
    const unsortedCards = useMemo(() => {
        if (!config) return [];
        const sortedIds = new Set(responses.rough.history);
        return config.statements.filter(s => !sortedIds.has(s.id));
    }, [config, responses.rough.history]);

    const currentCard = unsortedCards[0];
    const progress = config ? ((config.statements.length - unsortedCards.length) / config.statements.length) * 100 : 0;

    // Hoist "Next" Action when complete - REMOVED for content-aware nav
    // content-aware: button is now rendered in the body when complete

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
        // We now delegate to the card stack to animate first
        if (cardStackRef.current) {
            cardStackRef.current.swipe(direction);
        }
    };
    
    // Called after animation finishes by CardStack
    const onVoteComplete = (direction: 'agree' | 'disagree' | 'neutral') => {
        if (currentCard) {
            categorizeCard(currentCard.id, direction);
            // Reset motion values manually if needed, though card unmount usually handles it
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
                  
                {/* Actions: Context-Aware Navigation */}
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
            <div className="flex-none bg-slate-50 py-3 px-4 flex items-center justify-between border-b border-gray-100 z-20 shadow-sm relative">
                {/* Undo Button */}
                <button
                    onClick={undoRoughSort}
                    disabled={responses.rough.history.length === 0}
                    className="flex items-center gap-1 text-xs font-bold text-gray-400 hover:text-gray-700 disabled:opacity-30 uppercase tracking-widest transition-colors w-20"
                >
                    <RotateCcw size={14} />
                    {t('common.undo')}
                </button>

                {/* Pedagogical Header (Context Only - No Hint) */}
                <div className="flex-1 px-2 flex flex-col items-center justify-center">
                    <h3 className="text-lg sm:text-xl font-bold text-gray-900 leading-tight text-center">
                        {t('rough.header.title')}
                    </h3>
                </div>

                {/* Spacer */}
                <div className="w-20" />
            </div>

            {/* 3. The Control Cluster (Centered Stage) */}
            <div className="flex-1 min-h-0 flex flex-col items-center justify-center w-full px-2 py-4 relative">
                
                {/* FLOATING TIP (Top Left of Control Cluster) - Swipeable & Closable */}
                {showTip && (
                    <div className="absolute top-4 left-4 z-40 max-w-xs hidden md:block select-none pointer-events-auto">
                        <motion.div 
                            drag="x"
                            dragConstraints={{ left: 0, right: 0 }}
                            dragElastic={0.2}
                            onDragEnd={(_, info) => {
                                if (Math.abs(info.offset.x) > 100 || Math.abs(info.velocity.x) > 500) {
                                    setShowTip(false);
                                }
                            }}
                            onPointerDownCapture={(e) => e.stopPropagation()}
                            onPointerMoveCapture={(e) => e.stopPropagation()}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ duration: 1.5, ease: "easeOut" }}
                            className="bg-white/90 backdrop-blur-sm border border-blue-100 shadow-sm rounded-xl p-4 flex gap-3 relative pr-8 cursor-grab active:cursor-grabbing"
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
                    </div>
                )}

                {/* Row A: Horizon (Disagree - Card - Agree) */}
                <div className="flex flex-row items-center justify-center gap-4 sm:gap-8 md:gap-12 w-full">
                    {/* Left Button (Disagree) */}
                    <motion.button
                        style={{ scale: scaleDisagree, opacity: opacityDisagree }}
                        onClick={() => handleVote('disagree')}
                        className="z-20 flex flex-col items-center justify-center w-[7.5rem] h-[7.5rem] sm:w-[9.1rem] sm:h-[9.1rem] rounded-full bg-red-50 text-red-600 hover:bg-red-100 border-2 border-red-100 shadow-sm transition-colors gap-1"
                        aria-label={t('common.disagree')}
                    >
                        {/* Unified: Frown + Text for all screens */}
                        <div className="flex flex-col items-center gap-1">
                             <Frown size={24} strokeWidth={2.5} className="sm:w-7 sm:h-7 opacity-80" />
                             <span className="text-xs sm:text-sm font-extrabold uppercase tracking-wide">{t('common.disagree')}</span>
                        </div>
                    </motion.button>

                    {/* Card Zone */}
                    <div className="relative w-full max-w-xs sm:max-w-sm md:max-w-md h-auto aspect-[4/3] flex justify-center items-center z-10 shrink">
                        <div className="w-full h-full relative">
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
                        className="z-20 flex flex-col items-center justify-center w-[7.5rem] h-[7.5rem] sm:w-[9.1rem] sm:h-[9.1rem] rounded-full bg-green-50 text-green-600 hover:bg-green-100 border-2 border-green-100 shadow-sm transition-colors gap-1"
                        aria-label={t('common.agree')}
                    >
                        {/* Unified: Smile + Text for all screens */}
                        <div className="flex flex-col items-center gap-1">
                            <Smile size={24} strokeWidth={2.5} className="sm:w-7 sm:h-7 opacity-80" />
                            <span className="text-xs sm:text-sm font-extrabold uppercase tracking-wide">{t('common.agree')}</span>
                        </div>
                    </motion.button>
                </div>

                {/* Row B: Anchor (Neutral Pill) */}
                <motion.button
                    style={{ scale: scaleNeutral, opacity: opacityNeutral }}
                    onClick={() => handleVote('neutral')}
                    className="mt-6 w-[18.2rem] h-[5.6rem] rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 border-2 border-gray-200 hover:border-gray-300 flex items-center justify-center gap-2 font-bold uppercase tracking-wide shadow-sm transition-colors"
                    aria-label={t('common.neutral')}
                >
                     {/* Unified: Meh + Text for all screens */}
                     <div className="flex items-center gap-2 text-gray-600">
                         <Meh size={20} strokeWidth={2.5} className="opacity-80" />
                         <span className="text-sm font-bold tracking-wide">{t('common.neutral')}</span>
                    </div>
                </motion.button>
                
            </div>

        </div>
    );

};

export default RoughSortPage;
