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

    // Responsive Breakpoint
    const [isDesktop, setIsDesktop] = useState(false);

    useEffect(() => {
        const checkDesktop = () => setIsDesktop(window.matchMedia('(min-width: 768px)').matches);
        checkDesktop();
        window.addEventListener('resize', checkDesktop);
        return () => window.removeEventListener('resize', checkDesktop);
    }, []);

    // --- SHARED GEOMETRY CONSTANTS ---
    // These drive BOTH the CSS Positioning AND the Animation Coordinates.
    // Origin (0,0) is the CENTER of the container.
    //
    // MOBILE:
    // Grid Row 0 (Bottom Row) Center Y: -12px (Slightly up from center)
    // Source Piles Center Y: +40px (Below grid)
    //
    // DESKTOP:
    // Grid Row 0 (Bottom Row) Center Y: +28px (Grid is strictly centered vertically in left area? No, we center the whole visual block)
    // Let's align Desktop Grid vertical center ~0.
    // Grid Height ~80px. Top -40, Bottom +40. Row 0 is at bottom (+28 is correct for center of card 12px from bottom).
    // Deck Center Y: 0 (Middle pile). Top -32, Bot +32.
    // Deck Offset X: 66px.
    
    // MOBILE
    const MOBILE_GRID_ROW0_Y = -12;
    const MOBILE_SOURCE_CENTER_Y = 40;

    // DESKTOP
    const DESKTOP_GRID_ROW0_Y = 28;
    const DESKTOP_DECK_OFFSET_X = 66;

    // Active Targets
    const activeRoughTarget = phase === 'ROUGH' && step < ROUGH_TARGETS.length ? ROUGH_TARGETS[step] : null;
    const activeFineStep = phase === 'FINE' && step < FINE_STEPS.length ? FINE_STEPS[step] : null;

    // --- FINE CARD ANIMATION COORDINATES ---
    // Calculated based on Layout Mode using constants.
    
    // Grid Base Y (Row 0)
    const currentGridBaseY = isDesktop ? DESKTOP_GRID_ROW0_Y : MOBILE_GRID_ROW0_Y;

    // Source Deck Base Y (Center of middle pile / Center of row)
    const currentSourceBaseY = isDesktop ? 0 : MOBILE_SOURCE_CENTER_Y;

    // Source Base X (Center of deck group)
    const currentSourceBaseX = isDesktop ? DESKTOP_DECK_OFFSET_X : 0; // Mobile is 0

    // Source Coordinates (Flying Card Start)
    // X: Base + Offset (Mobile side piles)
    // Y: Base + Offset (Desktop vertical piles)
    
    const fineSourceX = useMemo(() => {
        if (!activeFineStep) return 0;
        const offset = isDesktop 
            ? 0 
            : (activeFineStep.source === 0 ? -36 : activeFineStep.source === 2 ? 36 : 0);
        return currentSourceBaseX + offset;
    }, [isDesktop, activeFineStep, currentSourceBaseX]);

    const fineSourceY = useMemo(() => {
        if (!activeFineStep) return 0;
        const offset = isDesktop
            ? (activeFineStep.source === 0 ? -32 : activeFineStep.source === 2 ? 32 : 0)
            : 0;
        return currentSourceBaseY + offset;
    }, [isDesktop, activeFineStep, currentSourceBaseY]);

    // Target Coordinates (Flying Card End)
    const fineTargetX = (activeFineStep ? activeFineStep.x : 0) + (isDesktop ? 0 : 0); // Mobile grid x is 0 offset
    const fineTargetY = currentGridBaseY + (activeFineStep ? activeFineStep.y : 0);


    return (
        <div className="relative w-full h-56 md:h-auto md:flex md:flex-col md:justify-center md:items-center py-6 select-none pointer-events-none md:gap-4" aria-hidden="true">

            {/* --- ROUGH SORT (Compact) --- */}
            <div className={`
                absolute top-0 left-0 w-full h-full flex items-center justify-center transition-all duration-700 ease-in-out
                md:relative md:w-full md:h-40
                ${phase === 'ROUGH' ? 'opacity-100 scale-[1.5] md:scale-100 z-20 md:filter-none' : 'opacity-0 scale-[1.35] z-10 md:opacity-40 md:grayscale-[0.8] md:scale-100'}
            `}>
                {/* Step Number (Left, above other elements) */}
                <div className="absolute -left-8 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400 z-50">1</div>

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

            {/* --- FINE SORT (Layout via Geometry Constants) --- */}
            <div className={`
                absolute top-0 left-0 w-full h-full flex flex-col items-center justify-center gap-2 transition-all duration-700 ease-in-out
                md:relative md:w-full md:h-40
                ${phase === 'FINE' ? 'opacity-100 scale-[1.5] md:scale-100 z-20 md:filter-none' : 'opacity-0 scale-[1.35] z-10 md:opacity-40 md:grayscale-[0.8] md:scale-100'}
            `}>
                {/* Step Number (Left, above other elements) */}
                <div className="absolute -left-8 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400 z-50">2</div>

                {/* 
                   GRID CONTAINER 
                   Positioned so that the Center of the Bottom Row is at `currentGridBaseY` relative to container center.
                   Grid Slots align `items-end`. 
                   Center of Bottom Card is 12px from Grid Bottom.
                   So Grid Bottom Edge should be at `currentGridBaseY + 12px`.
                   We position the container using bottom/transform.
                   If we use `top: 50%`, then we margin-top based on the offset.
                   Actually simpler: Position the `div` center at `currentGridBaseY` but offset by half grid height?
                   Better: Use calculate style.
                   
                   Grid Bottom aligned to: `50% + (currentGridBaseY + 12)px`.
                */}
                <div 
                    className="absolute z-10 flex items-end justify-center left-1/2"
                    style={{
                        // 26px = 12px (half card) + safety. 
                        // The `bottom` edge of this div aligns with the bottom of the slots.
                        // We want `bottom` edge to be at CenterY + GridBaseY + 12px.
                        top: `calc(50% + ${currentGridBaseY + 12}px)`,
                        transform: 'translate(-50%, -100%)'
                    }}
                >
                     {/* Pyramid Grid (Flex Row) */}
                     {/* Mobile Side Thumbs included here to keep relative position simple */}
                     <div className="flex items-end gap-2">
                        {/* Left Thumb (Mobile) */}
                        <div className={`flex items-center pb-1 opacity-40 md:hidden`}>
                            <ThumbsDown size={16} className="text-slate-500" />
                        </div>

                        {/* Slots */}
                        <div className="flex items-end gap-[2px]">
                            <div className="flex flex-col gap-[2px]"><MiniSlot filled={fineFilledIds.has('L2_0')} /></div>
                            <div className="flex flex-col gap-[2px]"><MiniSlot filled={fineFilledIds.has('L1_1')} /><MiniSlot filled={fineFilledIds.has('L1_0')} /></div>
                            <div className="flex flex-col gap-[2px]"><MiniSlot filled={fineFilledIds.has('C0_2')} /><MiniSlot filled={fineFilledIds.has('C0_1')} /><MiniSlot filled={fineFilledIds.has('C0_0')} /></div>
                            <div className="flex flex-col gap-[2px]"><MiniSlot filled={fineFilledIds.has('R1_1')} /><MiniSlot filled={fineFilledIds.has('R1_0')} /></div>
                            <div className="flex flex-col gap-[2px]"><MiniSlot filled={fineFilledIds.has('R2_0')} /></div>
                        </div>

                        {/* Right Thumb (Mobile) */}
                        <div className={`flex items-center pb-1 opacity-40 md:hidden`}>
                            <ThumbsUp size={16} className="text-slate-500" />
                        </div>
                    </div>
                </div>

                {/* DESKTOP BOTTOM THUMBS */}
                {/* Positioned relative to Grid Bottom. Grid Bottom is at GridBaseY+12. */}
                {/* We want these slightly below. Say +4px gap. */}
                {/* Center Y = GridBaseY + 12 + 4 + 7 (half thumb height 14) = GridBaseY + 23. */}
                <div 
                    className="hidden md:flex absolute left-1/2 -translate-x-1/2 items-center gap-[2px] opacity-60 z-10"
                    style={{ top: `calc(50% + ${currentGridBaseY + 23}px - 7px)` }} // Top = Center - HalfHeight
                >
                        <div className="w-[18px] flex justify-center"><ThumbsDown size={14} className="text-slate-500" /></div>
                        <div className="w-[18px]" />
                        <div className="w-[18px]" />
                        <div className="w-[18px]" />
                        <div className="w-[18px] flex justify-center"><ThumbsUp size={14} className="text-slate-500" /></div>
                </div>

                {/* SOURCE PILES */}
                {/* 
                    Mobile: Row of 3. Center at `MOBILE_SOURCE_CENTER_Y`.
                    Desktop: Col of 3. Center at 0. Offset X `DESKTOP_DECK_OFFSET_X`.
                    We position the CENTER of this container at (BaseX, BaseY).
                */}
                <div 
                    className={`
                        absolute z-10 flex gap-6 md:gap-2 items-center justify-center
                        ${isDesktop ? 'flex-col' : 'flex-row'}
                    `}
                    style={{
                        top: `calc(50% + ${currentSourceBaseY}px)`, // Top becomes Center Y
                        left: `calc(50% + ${currentSourceBaseX}px)`, // Left becomes Center X
                        transform: 'translate(-50%, -50%)' // Center the div itself
                    }}
                >
                     {/* Render only in FINE phase to accept the layoutId transition */}
                    {phase === 'FINE' && (
                        <>
                            <DynamicStack count={fineSourceCounts[0]} icon={Frown} type="source" layoutId="pile-disagree" />
                            <DynamicStack count={fineSourceCounts[1]} icon={Meh} type="source" layoutId="pile-neutral" />
                            <DynamicStack count={fineSourceCounts[2]} icon={Smile} type="source" layoutId="pile-agree" />
                        </>
                    )}
                </div>

                {/* Flying Card Overlay */}
                <div className="absolute top-1/2 left-1/2 w-0 h-0 z-50">
                    <AnimatePresence>
                        {activeFineStep && (
                            <motion.div
                                key={`fine-fly-${step}`}
                                // Source/Target are calculated relative to Center (0,0).
                                // This div is at Center.
                                // We offset by -9, -12 to center the 18x24 card on the point.
                                initial={{ x: fineSourceX - 9, y: fineSourceY - 12, opacity: 1 }}
                                animate={{ x: fineTargetX - 9, y: fineTargetY - 12 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: FINE_DURATION, ease: "easeInOut" }}
                                className="absolute top-0 left-0 w-[18px] h-[24px] bg-blue-50 border-2 border-blue-600 rounded-[2px] shadow-xl pointer-events-none"
                            />
                        )}
                    </AnimatePresence>
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
