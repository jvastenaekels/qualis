import React, { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Smile, Frown, Meh, ThumbsUp, ThumbsDown } from 'lucide-react';

// --- Configuration ---

// ROUGH SORT
// Targets relative from common center? No, let's keep relative to Deck.
// Deck is at (0,0).
// Targets (Up):
// Targets (Up):
// Layout: Starburst / Swipe Mimic
// Deck is Center (0,0)
// Disagree: Top-Left (Tightened for smaller cards)
// Agree: Top-Right
// Neutral: Bottom (Swipe Down)
const ROUGH_TARGETS = [
    { x: -32, y: -24, pileId: 'disagree' },
    { x: 32, y: -24, pileId: 'agree' },
    { x: 0, y: 32, pileId: 'neutral' },
    { x: -32, y: -24, pileId: 'disagree' },
    { x: 0, y: 32, pileId: 'neutral' }
];

// FINE SORT
// 9 Steps.
const COL_W = 18; // Smaller width
const COL_GAP = 2; // Smaller gap
const COL_OFFSET = COL_W + COL_GAP;
const ROW_H = 26; // 24h + 2g for correct stacking

// Steps: { id, x, y, source }
// Source 0=Left, 1=Mid, 2=Right
// Grid Base (Row 0) Y position relative to Source Piles (Y=0).
// The grid container is h-32 (128px). Items are flex-end.
// Source piles are in a div below with pt-2 (8px).
// So distance from Source Top to Grid Bottom is roughly 8px gap + source border?
// Let's use a calibrated value.
const GRID_BASE_Y = -48; // Calibrated for smooth landing

const FINE_STEPS = [
    { id: 'L2_0', x: -2 * COL_OFFSET, y: 0, source: 0 },
    { id: 'R2_0', x: 2 * COL_OFFSET, y: 0, source: 2 },
    { id: 'L1_0', x: -1 * COL_OFFSET, y: 0, source: 0 },
    { id: 'R1_0', x: 1 * COL_OFFSET, y: 0, source: 2 },
    { id: 'C0_0', x: 0, y: 0, source: 1 },
    { id: 'L1_1', x: -1 * COL_OFFSET, y: -ROW_H, source: 0 },
    { id: 'R1_1', x: 1 * COL_OFFSET, y: -ROW_H, source: 2 },
    { id: 'C0_1', x: 0, y: -ROW_H, source: 1 },
    { id: 'C0_2', x: 0, y: -ROW_H * 2, source: 1 },
];

const SortingAnimation: React.FC = () => {
    const [phase, setPhase] = useState<'ROUGH' | 'FINE'>('ROUGH');
    const [step, setStep] = useState(0);

    const ROUGH_DURATION = 0.6;
    const FINE_DURATION = 1.0;
    const PAUSE = 1200;

    useEffect(() => {
        let timer: ReturnType<typeof setTimeout>;
        if (phase === 'ROUGH') {
            if (step < ROUGH_TARGETS.length) {
                timer = setTimeout(() => setStep(s => s + 1), ROUGH_DURATION * 1000 + 200);
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

    // --- Derived Counts for ROUGH ---
    // Deck: If ROUGH, decreases. If FINE, empty (finished).
    const roughDeckCount = phase === 'ROUGH' ? Math.max(0, ROUGH_TARGETS.length - step) : 0;

    // Piles: Count how many of each type have been *completed*
    const roughPileCounts = useMemo(() => {
        const counts = { disagree: 0, neutral: 0, agree: 0 };
        // If FINE phase, Rough is complete (full piles)
        const effectiveStep = phase === 'ROUGH' ? step : ROUGH_TARGETS.length;

        for (let i = 0; i < effectiveStep; i++) {
            if (i < ROUGH_TARGETS.length) {
                const pid = ROUGH_TARGETS[i].pileId as keyof typeof counts;
                counts[pid]++;
            }
        }
        return counts;
    }, [step, phase]);

    // --- Derived Counts for FINE ---
    const fineSourceCounts = useMemo(() => {
        // Initial totals based on usage in FINE_STEPS
        const totals = [0, 0, 0];
        FINE_STEPS.forEach(s => totals[s.source]++);

        // If ROUGH phase, Fine hasn't started (Full Source Piles)
        const effectiveStep = phase === 'FINE' ? step : 0;

        // Subtract used
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

    // Active Targets
    const activeRoughTarget = phase === 'ROUGH' && step < ROUGH_TARGETS.length ? ROUGH_TARGETS[step] : null;
    const activeFineStep = phase === 'FINE' && step < FINE_STEPS.length ? FINE_STEPS[step] : null;

    // Fine card flying positions
    const fineSourceX = activeFineStep ? (activeFineStep.source === 0 ? -36 : activeFineStep.source === 2 ? 36 : 0) : 0;
    const fineTargetX = activeFineStep ? activeFineStep.x : 0;
    const fineTargetY = activeFineStep ? (GRID_BASE_Y + activeFineStep.y) : 0;

    return (
        <div className="relative w-full h-56 md:h-auto md:flex md:flex-col md:justify-center md:items-center py-6 select-none pointer-events-none md:gap-8" aria-hidden="true">

            {/* --- ROUGH SORT (Compact) --- */}
            {/* --- ROUGH SORT (Centered Starburst) --- */}
            <div className={`
                absolute top-0 left-0 w-full h-full flex items-center justify-center transition-all duration-700 ease-in-out
                md:relative md:w-full md:h-48
                ${phase === 'ROUGH' ? 'opacity-100 scale-100 z-20 md:filter-none' : 'opacity-0 scale-90 z-10 md:opacity-40 md:grayscale-[0.8] md:scale-100'}
            `}>
                {/* Background Number */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[140px] font-bold text-slate-200 z-0 leading-none">1</div>

                {/* Deck (Center) */}
                <div className="relative z-20">
                    <DynamicStack count={roughDeckCount} type="deck" />
                    <AnimatePresence>
                        {activeRoughTarget && (
                            <motion.div
                                key={`rough-fly-${step}`}
                                initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                                animate={{ x: activeRoughTarget.x, y: activeRoughTarget.y, scale: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: ROUGH_DURATION, ease: "easeInOut" }}
                                className="absolute top-0 left-0 w-[18px] h-[24px] bg-blue-50 border-2 border-blue-600 rounded-[2px] shadow-xl z-50 pointer-events-none"
                            />
                        )}
                    </AnimatePresence>
                </div>

                {/* Piles (Absolute Positions) */}
                {phase === 'ROUGH' && (
                    <>
                        {/* Disagree: Top Left */}
                        <div className="absolute top-[calc(50%-48px)] left-[calc(50%-48px)] z-10">
                            <DynamicStack count={roughPileCounts.disagree} icon={Frown} type="pile" layoutId="pile-disagree" />
                        </div>
                        {/* Agree: Top Right */}
                        <div className="absolute top-[calc(50%-48px)] right-[calc(50%-48px)] z-10">
                            <DynamicStack count={roughPileCounts.agree} icon={Smile} type="pile" layoutId="pile-agree" />
                        </div>
                        {/* Neutral: Bottom Center */}
                        <div className="absolute bottom-[calc(50%-56px)] left-1/2 -translate-x-1/2 z-10">
                            <DynamicStack count={roughPileCounts.neutral} icon={Meh} type="pile" layoutId="pile-neutral" />
                        </div>
                    </>
                )}
            </div>

            {/* --- FINE SORT (Compact) --- */}
            <div className={`
                absolute top-0 left-0 w-full h-full flex flex-col items-center justify-center gap-2 transition-all duration-700 ease-in-out
                md:relative md:w-full md:h-48
                ${phase === 'FINE' ? 'opacity-100 scale-100 z-20 md:filter-none' : 'opacity-0 scale-90 z-10 md:opacity-40 md:grayscale-[0.8] md:scale-100'}
            `}>
                {/* Background Number */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[140px] font-bold text-slate-200 z-0 leading-none">2</div>

                {/* Grid Container with Side Thumbs */}
                <div className="flex items-end gap-2 mb-4 z-10">
                    {/* Left Thumb */}
                    <div className="flex items-center pb-1 opacity-40">
                        <ThumbsDown size={16} className="text-slate-500" />
                    </div>

                    {/* Pyramid Grid */}
                    <div className="flex items-end gap-[2px]">
                        <div className="flex flex-col gap-[2px]"><MiniSlot filled={fineFilledIds.has('L2_0')} /></div>
                        <div className="flex flex-col gap-[2px]"><MiniSlot filled={fineFilledIds.has('L1_1')} /><MiniSlot filled={fineFilledIds.has('L1_0')} /></div>
                        <div className="flex flex-col gap-[2px]"><MiniSlot filled={fineFilledIds.has('C0_2')} /><MiniSlot filled={fineFilledIds.has('C0_1')} /><MiniSlot filled={fineFilledIds.has('C0_0')} /></div>
                        <div className="flex flex-col gap-[2px]"><MiniSlot filled={fineFilledIds.has('R1_1')} /><MiniSlot filled={fineFilledIds.has('R1_0')} /></div>
                        <div className="flex flex-col gap-[2px]"><MiniSlot filled={fineFilledIds.has('R2_0')} /></div>
                    </div>

                    {/* Right Thumb */}
                    <div className="flex items-center pb-1 opacity-40">
                        <ThumbsUp size={16} className="text-slate-500" />
                    </div>
                </div>

                {/* Source Piles */}
                <div className="relative flex gap-6 pt-2 h-[24px] z-10">
                     {/* Render only in FINE phase to accept the layoutId transition */}
                    {phase === 'FINE' && (
                        <>
                            <DynamicStack count={fineSourceCounts[0]} icon={Frown} type="source" layoutId="pile-disagree" />
                            <DynamicStack count={fineSourceCounts[1]} icon={Meh} type="source" layoutId="pile-neutral" />
                            <DynamicStack count={fineSourceCounts[2]} icon={Smile} type="source" layoutId="pile-agree" />
                        </>
                    )}

                    {/* Flying Card Overlay */}
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-0 h-0">
                        <AnimatePresence>
                            {activeFineStep && (
                                <motion.div
                                    key={`fine-fly-${step}`}
                                    initial={{ x: fineSourceX, y: 8, opacity: 1 }}
                                    animate={{ x: fineTargetX, y: fineTargetY }}
                                    exit={{ opacity: 0 }}
                                    transition={{ duration: FINE_DURATION, ease: "easeInOut" }}
                                    className="absolute top-0 left-[-9px] w-[18px] h-[24px] bg-blue-50 border-2 border-blue-600 rounded-[2px] shadow-xl z-50 pointer-events-none"
                                />
                            )}
                        </AnimatePresence>
                    </div>
                </div>
            </div>

        </div>
    );
};

// --- Sub-Components ---

const MiniSlot = ({ filled }: { filled: boolean }) => (
    <div className={`w-[18px] h-[24px] rounded-[2px] border ${filled ? 'bg-slate-400 border-slate-500' : 'bg-white border-slate-300'} transition-colors duration-300 shadow-sm`} />
);

interface StackProps {
    count: number;
    icon?: React.ElementType;
    type: 'deck' | 'pile' | 'source';
    layoutId?: string;
}

const DynamicStack: React.FC<StackProps> = ({ count, icon: Icon, layoutId }) => {
    // Determine visual style
    
    // Base dimensions
    // Consistency: User requested identical size for both phases.
    // We align on the Fine Sort size (small) to fit the grid.
    const width = 'w-[18px]';
    const height = 'h-[24px]';

    return (
        <motion.div 
            layoutId={layoutId} 
            transition={{ duration: 0.8, ease: "easeInOut" }}
            className={`relative ${width} ${height} flex-shrink-0 transition-opacity duration-300 ${count === 0 ? 'opacity-30' : 'opacity-100'}`}
        >
            {/* Placeholder / Empty Slot border */}
            <div className={`absolute inset-0 border-2 border-dashed border-slate-300 rounded-[2px] ${count === 0 ? 'block' : 'hidden'}`} />

            {/* Stack Layers */}
            {count > 2 && (
                <div className={`absolute top-0 left-0 ${width} ${height} bg-white border border-slate-300 rounded-[2px] shadow-sm translate-x-[2px] -translate-y-[2px] z-0`} />
            )}
            {count > 1 && (
                <div className={`absolute top-0 left-0 ${width} ${height} bg-white border border-slate-300 rounded-[2px] shadow-sm translate-x-[1px] -translate-y-[1px] z-10`} />
            )}
            {/* Top Card */}
            {count > 0 && (
                <div className={`absolute top-0 left-0 ${width} ${height} bg-white border border-slate-400 rounded-[2px] shadow-sm z-20 flex items-center justify-center`}>
                    {Icon && <Icon size={10} className="text-slate-500" />}
                    {!Icon && <div className="w-5 h-8 border border-slate-100 rounded-[1px]" />}
                </div>
            )}
        </motion.div>
    );
};


export default SortingAnimation;
