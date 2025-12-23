import React, { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Smile, Frown, Meh, ThumbsUp, ThumbsDown } from 'lucide-react';

// --- Configuration ---

// ROUGH SORT
// Targets relative from common center? No, let's keep relative to Deck.
// Deck is at (0,0).
// Targets (Up):
// Layout: Disagree (Left/Up), Agree (Right/Up), Neutral (Center/Down)
// Calibrated to match the visual "Inverted Triangle"
const ROUGH_TARGETS = [
    { x: -50, y: -90, pileId: 'disagree' },
    { x: 50, y: -90, pileId: 'agree' },
    { x: 0, y: -45, pileId: 'neutral' },
    { x: -50, y: -90, pileId: 'disagree' },
    { x: 0, y: -45, pileId: 'neutral' }
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
        <div className="w-full flex flex-col justify-center items-center gap-12 py-6 select-none pointer-events-none" aria-hidden="true">

            {/* --- ROUGH SORT (Compact) --- */}
            <div className={`relative flex flex-col items-center gap-8 transition-all duration-700 z-10 ${phase === 'ROUGH' ? 'opacity-100' : 'opacity-50 grayscale-[0.5]'}`}>
                {/* Background Number */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[140px] font-bold text-slate-200 z-0 leading-none">1</div>

                {/* Piles */}
                {/* Render only in ROUGH phase so they can 'move' to FINE phase via layoutId */}
                {/* Piles (Triangle Layout) */}
                {/* Render only in ROUGH phase so they can 'move' to FINE phase via layoutId */}
                <div className="relative z-10 mb-8 flex flex-col items-center gap-2"> 
                    {phase === 'ROUGH' && (
                        <>
                            {/* Top Row: Opposites */}
                            <div className="flex gap-16">
                                <DynamicStack count={roughPileCounts.disagree} icon={Frown} type="pile" layoutId="pile-disagree" />
                                <DynamicStack count={roughPileCounts.agree} icon={Smile} type="pile" layoutId="pile-agree" />
                            </div>
                            {/* Bottom Row: Neutral */}
                            <div>
                                <DynamicStack count={roughPileCounts.neutral} icon={Meh} type="pile" layoutId="pile-neutral" />
                            </div>
                        </>
                    )}
                </div>
                {/* Deck */}
                <div className="relative z-10">
                    <DynamicStack count={roughDeckCount} type="deck" />
                    <AnimatePresence>
                        {activeRoughTarget && (
                            <motion.div
                                key={`rough-fly-${step}`}
                                initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                                animate={{ x: activeRoughTarget.x, y: activeRoughTarget.y, scale: 0.9 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: ROUGH_DURATION, ease: "easeInOut" }}
                                className="absolute top-0 left-0 w-8 h-11 bg-blue-50 border-2 border-blue-600 rounded-sm shadow-xl z-50 pointer-events-none"
                            />
                        )}
                    </AnimatePresence>
                </div>
            </div>

            {/* --- FINE SORT (Compact) --- */}
            <div className={`relative flex flex-col items-center gap-2 transition-all duration-700 z-10 ${phase === 'FINE' ? 'opacity-100' : 'opacity-50 grayscale-[0.5]'}`}>
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

const DynamicStack: React.FC<StackProps> = ({ count, icon: Icon, type, layoutId }) => {
    // Determine visual style based on type
    const isSource = type === 'source';

    // Base dimensions
    // Consistency: Rough Sort uses "Big Cards". Fine Sort uses "Small Cards".

    const isSmall = isSource; // Fine sort uses small cards
    const width = isSmall ? 'w-[18px]' : 'w-8';
    const height = isSmall ? 'h-[24px]' : 'h-11';

    return (
        <motion.div 
            layoutId={layoutId} 
            transition={{ duration: 0.8, ease: "easeInOut" }}
            className={`relative ${width} ${height} flex-shrink-0 transition-opacity duration-300 ${count === 0 ? 'opacity-30' : 'opacity-100'}`}
        >
            {/* Placeholder / Empty Slot border */}
            <div className={`absolute inset-0 border-2 border-dashed border-slate-300 rounded-[3px] ${count === 0 ? 'block' : 'hidden'}`} />

            {/* Stack Layers */}
            {count > 2 && (
                <div className={`absolute top-0 left-0 ${width} ${height} bg-white border border-slate-300 rounded-[3px] shadow-sm translate-x-[3px] -translate-y-[3px] z-0`} />
            )}
            {count > 1 && (
                <div className={`absolute top-0 left-0 ${width} ${height} bg-white border border-slate-300 rounded-[3px] shadow-sm translate-x-[1.5px] -translate-y-[1.5px] z-10`} />
            )}
            {/* Top Card */}
            {count > 0 && (
                <div className={`absolute top-0 left-0 ${width} ${height} bg-white border border-slate-400 rounded-[3px] shadow-sm z-20 flex items-center justify-center`}>
                    {Icon && <Icon size={isSmall ? 10 : 14} className="text-slate-500" />}
                    {!Icon && !isSmall && <div className="w-5 h-8 border border-slate-100 rounded-[2px]" />}
                </div>
            )}
        </motion.div>
    );
};


export default SortingAnimation;
