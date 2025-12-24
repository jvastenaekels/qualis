import React, { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Smile, Frown, Meh, ThumbsUp, ThumbsDown } from 'lucide-react';

// --- Configuration ---

// ROUGH SORT
// 6 Cards sorted in a "random-looking" sequence
// Disagree (Left), Agree (Right), Neutral (Down)
const ROUGH_TARGETS = [
    { x: -32, y: -24, pileId: 'disagree' }, // 1. Disagree
    { x: 32, y: -24, pileId: 'agree' },     // 2. Agree
    { x: 0, y: 32, pileId: 'neutral' },     // 3. Neutral
    { x: 32, y: -24, pileId: 'agree' },     // 4. Agree
    { x: -32, y: -24, pileId: 'disagree' }, // 5. Disagree
    { x: 0, y: 32, pileId: 'neutral' }      // 6. Neutral
];

// FINE SORT
const COL_W = 18; 
const COL_GAP = 2; 
const COL_OFFSET = COL_W + COL_GAP;
const ROW_H = 26; 

const FINE_STEPS = [
    { id: 'L2_0', x: -2 * COL_OFFSET, y: 0, source: 0 },
    { id: 'R2_0', x: 2 * COL_OFFSET, y: 0, source: 2 },
    { id: 'L1_0', x: -1 * COL_OFFSET, y: 0, source: 0 },
    { id: 'R1_0', x: 1 * COL_OFFSET, y: 0, source: 2 },
    { id: 'L1_1', x: -1 * COL_OFFSET, y: -ROW_H, source: 0 },
    { id: 'R1_1', x: 1 * COL_OFFSET, y: -ROW_H, source: 2 },
    { id: 'C0_0', x: 0, y: 0, source: 1 },
    { id: 'C0_1', x: 0, y: -ROW_H, source: 1 },
    { id: 'C0_2', x: 0, y: -ROW_H * 2, source: 1 },
];

const SortingAnimation: React.FC = () => {
    const [phase, setPhase] = useState<'ROUGH' | 'FINE'>('ROUGH');
    const [step, setStep] = useState(0);

    const ROUGH_DURATION = 0.5; // Slightly faster for 6 cards
    const FINE_DURATION = 0.8;
    const PAUSE = 1200;

    useEffect(() => {
        let timer: ReturnType<typeof setTimeout>;
        if (phase === 'ROUGH') {
            if (step < ROUGH_TARGETS.length) {
                timer = setTimeout(() => setStep(s => s + 1), ROUGH_DURATION * 1000 + 100);
            } else {
                timer = setTimeout(() => { setPhase('FINE'); setStep(0); }, PAUSE);
            }
        } else {
            if (step < FINE_STEPS.length) {
                timer = setTimeout(() => setStep(s => s + 1), FINE_DURATION * 1000 + 100);
            } else {
                timer = setTimeout(() => { setPhase('ROUGH'); setStep(0); }, PAUSE);
            }
        }
        return () => clearTimeout(timer);
    }, [phase, step]);

    // ROUGH COUNTS
    // Deck decreases from N to 0.
    const roughDeckCount = phase === 'ROUGH' ? Math.max(0, ROUGH_TARGETS.length - step) : 0;

    // Piles accumulate
    const roughPileCounts = useMemo(() => {
        // Start with base base to look "played"
        const counts = { disagree: 2, neutral: 1, agree: 2 };
        const effectiveStep = phase === 'ROUGH' ? step : ROUGH_TARGETS.length;

        for (let i = 0; i < effectiveStep; i++) {
            if (i < ROUGH_TARGETS.length) {
                const pid = ROUGH_TARGETS[i].pileId as keyof typeof counts;
                counts[pid]++;
            }
        }
        return counts;
    }, [step, phase]);

    // FINE COUNTS
    const fineSourceCounts = useMemo(() => {
        const totals = [0, 0, 0];
        // Calculate initial source pile sizes based on what will be used in FINE steps
        FINE_STEPS.forEach(s => totals[s.source]++);
        
        // Add some "extra" cards that remain in piles to make them look fuller
        totals[0] += 2; 
        totals[1] += 2;
        totals[2] += 2;

        const effectiveStep = phase === 'FINE' ? step : 0;
        for (let i = 0; i < effectiveStep; i++) {
            if (i < FINE_STEPS.length) totals[FINE_STEPS[i].source]--;
        }
        return totals;
    }, [step, phase]);

    const fineFilledIds = useMemo(() => {
        const filled = new Set<string>();
        if (phase === 'FINE') {
            for (let i = 0; i < step; i++) filled.add(FINE_STEPS[i].id);
        }
        return filled;
    }, [phase, step]);

    // Geometry
    const [isDesktop, setIsDesktop] = useState(false);
    useEffect(() => {
        const check = () => setIsDesktop(window.matchMedia('(min-width: 768px)').matches);
        check();
        window.addEventListener('resize', check);
        return () => window.removeEventListener('resize', check);
    }, []);

    const MOBILE_GRID_ROW0_Y = -12;
    const MOBILE_SOURCE_CENTER_Y = 40;
    const DESKTOP_GRID_ROW0_Y = 0;
    const DESKTOP_GRID_OFFSET_X = -40;
    const DESKTOP_DECK_OFFSET_X = 60;

    const currentGridBaseY = isDesktop ? DESKTOP_GRID_ROW0_Y : MOBILE_GRID_ROW0_Y;
    const currentSourceBaseY = isDesktop ? 0 : MOBILE_SOURCE_CENTER_Y;
    const currentSourceBaseX = isDesktop ? DESKTOP_DECK_OFFSET_X : 0;

    const activeRoughTarget = phase === 'ROUGH' && step < ROUGH_TARGETS.length ? ROUGH_TARGETS[step] : null;
    const activeFineStep = phase === 'FINE' && step < FINE_STEPS.length ? FINE_STEPS[step] : null;

    const fineSourceX = useMemo(() => {
        if (!activeFineStep) return 0;
        const offset = isDesktop ? 0 : (activeFineStep.source === 0 ? -36 : activeFineStep.source === 2 ? 36 : 0);
        return currentSourceBaseX + offset;
    }, [isDesktop, activeFineStep, currentSourceBaseX]);

    const fineSourceY = useMemo(() => {
        if (!activeFineStep) return 0;
        const offset = isDesktop ? (activeFineStep.source === 0 ? -32 : activeFineStep.source === 2 ? 32 : 0) : 0;
        return currentSourceBaseY + offset;
    }, [isDesktop, activeFineStep, currentSourceBaseY]);

    const fineTargetX = (activeFineStep ? activeFineStep.x : 0) + (isDesktop ? DESKTOP_GRID_OFFSET_X : 0);
    const fineTargetY = currentGridBaseY + (activeFineStep ? activeFineStep.y : 0);


    return (
        <div className="relative w-full h-80 md:h-72 flex items-center justify-center py-6 select-none pointer-events-none" aria-hidden="true">
            
            {/* ROUGH PHASE */}
            <div 
                className={`absolute inset-0 flex items-center justify-center transition-all duration-700 ease-in-out
                ${phase === 'ROUGH' ? 'opacity-100 scale-[2.0] md:scale-[2.0] -translate-y-8 md:-translate-y-12 z-20' : 'opacity-0 scale-[1.9] z-10'}`}
            >
                <div className="relative z-20">
                    <DynamicStack count={roughDeckCount} type="deck" />
                    <AnimatePresence>
                        {activeRoughTarget && (
                            <motion.div
                                key={`rough-fly-${step}`}
                                initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                                animate={{ x: activeRoughTarget.x, y: activeRoughTarget.y, scale: 1, rotate: Math.random() * 10 - 5 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: ROUGH_DURATION, ease: "easeInOut" }}
                                className="absolute top-0 left-0 w-[18px] h-[24px] bg-white border border-slate-300 rounded-[2px] shadow-sm z-50 pointer-events-none"
                            >
                                <div className="w-full h-full bg-slate-50 rounded-[1px] flex items-center justify-center">
                                    <div className="w-2 h-0.5 bg-slate-200" />
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
                {phase === 'ROUGH' && (
                    <>
                        <div className="absolute top-[calc(50%-48px)] left-[calc(50%-48px)] z-10"><DynamicStack count={roughPileCounts.disagree} icon={Frown} type="pile" layoutId="pile-disagree" /></div>
                        <div className="absolute top-[calc(50%-48px)] right-[calc(50%-48px)] z-10"><DynamicStack count={roughPileCounts.agree} icon={Smile} type="pile" layoutId="pile-agree" /></div>
                        <div className="absolute bottom-[calc(50%-56px)] left-1/2 -translate-x-1/2 z-10"><DynamicStack count={roughPileCounts.neutral} icon={Meh} type="pile" layoutId="pile-neutral" /></div>
                    </>
                )}
            </div>

            {/* FINE PHASE */}
            <div 
                className={`absolute inset-0 flex flex-col items-center justify-center transition-all duration-700 ease-in-out
                ${phase === 'FINE' ? 'opacity-100 scale-[2.0] md:scale-[2.0] -translate-y-8 md:-translate-y-12 z-20' : 'opacity-0 scale-[1.9] z-10'}`}
            >
                 <div 
                    className="absolute z-10 flex items-end justify-center left-1/2"
                    style={{
                        top: `calc(50% + ${currentGridBaseY + 12}px)`,
                        transform: 'translate(-50%, -100%)',
                        left: isDesktop ? `calc(50% + ${DESKTOP_GRID_OFFSET_X}px)` : '50%'
                    }}
                >
                     <div className="flex items-end gap-2">
                        <div className={`flex items-center pb-1 opacity-40 md:hidden`}><ThumbsDown size={16} className="text-slate-500" /></div>
                        <div className="flex items-end gap-[2px]">
                            <div className="flex flex-col gap-[2px]"><MiniSlot filled={fineFilledIds.has('L2_0')} /></div>
                            <div className="flex flex-col gap-[2px]"><MiniSlot filled={fineFilledIds.has('L1_1')} /><MiniSlot filled={fineFilledIds.has('L1_0')} /></div>
                            <div className="flex flex-col gap-[2px]"><MiniSlot filled={fineFilledIds.has('C0_2')} /><MiniSlot filled={fineFilledIds.has('C0_1')} /><MiniSlot filled={fineFilledIds.has('C0_0')} /></div>
                            <div className="flex flex-col gap-[2px]"><MiniSlot filled={fineFilledIds.has('R1_1')} /><MiniSlot filled={fineFilledIds.has('R1_0')} /></div>
                            <div className="flex flex-col gap-[2px]"><MiniSlot filled={fineFilledIds.has('R2_0')} /></div>
                        </div>
                        <div className={`flex items-center pb-1 opacity-40 md:hidden`}><ThumbsUp size={16} className="text-slate-500" /></div>
                    </div>
                </div>

                <div 
                    className="hidden md:flex absolute left-1/2 -translate-x-1/2 items-center gap-[2px] opacity-60 z-10"
                    style={{ top: `calc(50% + ${currentGridBaseY + 23}px - 7px)`, left: `calc(50% + ${DESKTOP_GRID_OFFSET_X}px)` }}
                >
                        <div className="w-[18px] flex justify-center"><ThumbsDown size={14} className="text-slate-500" /></div>
                        <div className="w-[18px]" /><div className="w-[18px]" /><div className="w-[18px]" />
                        <div className="w-[18px] flex justify-center"><ThumbsUp size={14} className="text-slate-500" /></div>
                </div>

                <div 
                    className={`absolute z-10 flex gap-6 md:gap-4 items-center justify-center ${isDesktop ? 'flex-col' : 'flex-row'}`}
                    style={{ top: `calc(50% + ${currentSourceBaseY}px)`, left: `calc(50% + ${currentSourceBaseX}px)`, transform: 'translate(-50%, -50%)' }}
                >
                    {phase === 'FINE' && (
                        <>
                            <DynamicStack count={fineSourceCounts[0]} icon={Frown} type="source" layoutId="pile-disagree" />
                            <DynamicStack count={fineSourceCounts[1]} icon={Meh} type="source" layoutId="pile-neutral" />
                            <DynamicStack count={fineSourceCounts[2]} icon={Smile} type="source" layoutId="pile-agree" />
                        </>
                    )}
                </div>

                <div className="absolute top-1/2 left-1/2 w-0 h-0 z-50">
                    <AnimatePresence>
                        {activeFineStep && (
                            <motion.div
                                key={`fine-fly-${step}`}
                                initial={{ x: fineSourceX - 9, y: fineSourceY - 12, opacity: 1, scale: 1 }}
                                animate={{ x: fineTargetX - 9, y: fineTargetY - 12, rotate: Math.random() * 4 - 2 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: FINE_DURATION, ease: "easeInOut" }}
                                className="absolute top-0 left-0 w-[18px] h-[24px] bg-white border border-slate-300 rounded-[2px] shadow-sm pointer-events-none flex items-center justify-center z-50"
                            > 
                                {activeFineStep.source === 0 && <Frown size={10} className="text-slate-500" />}
                                {activeFineStep.source === 1 && <Meh size={10} className="text-slate-500" />}
                                {activeFineStep.source === 2 && <Smile size={10} className="text-slate-500" />}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 z-50 pointer-events-none">
                <div className={`transition-all duration-500 rounded-full flex items-center justify-center font-bold text-[10px] w-6 h-6 border ${phase === 'ROUGH' ? 'bg-blue-600 border-blue-600 text-white shadow-md scale-110' : 'bg-slate-100 border-slate-300 text-slate-400'}`}>1</div>
                <div className="w-10 h-0.5 bg-slate-200 overflow-hidden rounded-full"><div className={`h-full bg-blue-600 transition-all duration-500 ease-in-out ${phase === 'FINE' ? 'w-full' : 'w-0'}`} /></div>
                <div className={`transition-all duration-500 rounded-full flex items-center justify-center font-bold text-[10px] w-6 h-6 border ${phase === 'FINE' ? 'bg-blue-600 border-blue-600 text-white shadow-md scale-110' : 'bg-slate-100 border-slate-300 text-slate-400'}`}>2</div>
            </div>
        </div>
    );
};

const MiniSlot = ({ filled }: { filled: boolean }) => (
    <div className={`
        w-[18px] h-[24px] rounded-[2px] transition-all duration-300
        ${filled 
            ? 'bg-blue-600 border border-blue-700 shadow-sm scale-105 z-10' // Filled: High contrast (Blue card)
            : 'bg-slate-50 border-2 border-dashed border-slate-300' // Empty: Dashed placeholder
        }
    `} />
);

// --- IMPROVED DYNAMIC STACK --- //
// Renders a realistic pile using offset layers

interface StackProps {
    count: number;
    icon?: React.ElementType;
    type: 'deck' | 'pile' | 'source';
    layoutId?: string;
}

const DynamicStack: React.FC<StackProps> = ({ count, icon: Icon, layoutId }) => {
    // How many cards to visualize under the top one?
    // We cap at 4 visual layers for performance + aesthetic.
    // If count=1, layers=0. count=2, layers=1.
    const visibleLayers = Math.min(Math.max(0, count - 1), 4);
    
    // Deterministic random offsets based on count/type so it doesn't jitter during renders
    // but looks "messy" enough to be a pile.
    const getOffset = (index: number) => {
        const seed = (index * 17) % 7;
        const rotate = (seed - 3) * 1.5; // -4.5 to 4.5 deg
        const tx = (seed % 3) - 1; // -1, 0, 1 px
        const ty = ((seed * 2) % 3) - 1;
        return { rotate, tx, ty };
    };

    return (
        <motion.div 
            layoutId={layoutId} 
             // We don't animate container size, it's fixed 18x24
            className={`relative w-[18px] h-[24px] flex-shrink-0 transition-opacity duration-300 ${count === 0 ? 'opacity-40' : 'opacity-100'}`}
        >
            {/* Empty State Placeholder */}
             {count === 0 && (
                <div className="absolute inset-0 border-2 border-dashed border-slate-200 rounded-[2px]" />
            )}

            {/* Under Layers */}
            {count > 1 && Array.from({ length: visibleLayers }).map((_, i) => {
                const layerIdx = i; // 0 is bottom-most visible
                const offset = getOffset(layerIdx);
                // Stack them: index 0 is lowest in Z.
                return (
                    <div 
                        key={i}
                        className="absolute inset-0 bg-white border border-slate-300 rounded-[2px] shadow-sm"
                        style={{
                            transform: `translate(${offset.tx}px, ${offset.ty}px) rotate(${offset.rotate}deg)`,
                            zIndex: i
                        }}
                    />
                );
            })}

            {/* Top Card */}
            {count > 0 && (
                <div 
                    className="absolute inset-0 bg-white border border-slate-300 rounded-[2px] shadow-sm flex items-center justify-center z-10"
                    style={{ transform: 'rotate(-1deg)' }} // Slight organic tilt
                >
                     {Icon && <Icon size={10} className="text-slate-500" />}
                     {!Icon && <div className="w-2 h-0.5 bg-slate-200 rounded-full" />}
                </div>
            )}
        </motion.div>
    );
};

export default SortingAnimation;
