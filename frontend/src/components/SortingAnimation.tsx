import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const SortingAnimation: React.FC = () => {
  // A small, schematic grid structure (rows x cols)
  // Let's define a simple 3-4-3-2 inverted pyramid or similar "bell curve"ish shape
  // Actually, standard Q is roughly normal. logical capacity: 2, 3, 4, 3, 2 = 14 slots for a quick demo
  const gridStructure = [
    { score: -2, capacity: 2 },
    { score: -1, capacity: 3 },
    { score: 0, capacity: 4 },
    { score: 1, capacity: 3 },
    { score: 2, capacity: 2 },
  ];

  // Pre-calculate slot positions
  // We'll treat them as (colIndex, rowIndex) coordinates for rendering
  const slots: { col: number; row: number; id: string }[] = [];
  gridStructure.forEach((col, colIdx) => {
    for (let i = 0; i < col.capacity; i++) {
      slots.push({ col: colIdx, row: i, id: `slot-${colIdx}-${i}` });
    }
  });

  // State to track filled slots for the "persist" effect before resetting
  const [filledSlots, setFilledSlots] = useState<string[]>([]);
  
  // We want to animate cards flying in one by one.
  // We can use a recursive timeout or an interval.
  useEffect(() => {
    let currentIndex = 0;
    // We want a nice sequence:
    // 1. Clear board
    // 2. Fly in 14 cards
    // 3. Pause
    // 4. Repeat

    const interval = setInterval(() => {
       setFilledSlots(prev => {
           if (prev.length >= slots.length) {
               // Full, wait a bit then clear?
               // Actually for a pure visual loop, we might want to clear periodically.
               // Let's just handle "reset" differently.
               return prev; 
           }
           return [...prev, slots[currentIndex++].id];
       });
    }, 600); // Add a card every 600ms

    // Reset loop
    const totalDuration = (slots.length * 600) + 2000; // time to fill + 2s pause
    const resetTimer = setInterval(() => {
        setFilledSlots([]);
        currentIndex = 0;
    }, totalDuration);

    return () => {
        clearInterval(interval);
        clearInterval(resetTimer);
    };
  }, []); // Logic relies on constant gridStructure defined in component body which is effectively static for this demo


  return (
    <div className="flex flex-col items-center justify-center p-6 w-full max-w-lg mx-auto select-none pointer-events-none" aria-hidden="true">
        
        {/* The Deck (Source) */}
        <div className="relative w-12 h-16 bg-white border-2 border-blue-200 rounded-lg shadow-sm mb-12 flex items-center justify-center z-20">
             <div className="w-8 h-12 bg-blue-100/50 rounded flex items-center justify-center">
                 <div className="w-4 h-6 border border-blue-200 bg-white rounded-sm"></div>
             </div>
             
             {/* Flying Card (Concept - hard to sync with interval perfectly in pure React state without complex keys, 
                 so let's simplify: Just animate the slots appearing "as if" they landed, 
                 OR animate a shared layoutID moving from deck to slot? 
                 LayoutID is best for "moving" effect.
             */}
        </div>

        {/* The Grid */}
        <div className="flex items-end gap-2">
            {gridStructure.map((col, colIdx) => (
                <div key={colIdx} className="flex flex-col gap-1.5 items-center">
                    {Array.from({ length: col.capacity }).map((_, rowIdx) => {
                        const slotId = `slot-${colIdx}-${rowIdx}`;
                        const isFilled = filledSlots.includes(slotId);
                        
                        // Color coding based on column
                        let bgClass = "bg-slate-100 border-slate-200";
                        if (col.score < 0) bgClass = "bg-red-50 border-red-100";
                        if (col.score > 0) bgClass = "bg-green-50 border-green-100";

                        let fillClass = "bg-slate-400";
                        if (col.score < 0) fillClass = "bg-red-400";
                        if (col.score > 0) fillClass = "bg-green-400";

                        return (
                            <div 
                                key={rowIdx} 
                                className={`w-8 h-10 rounded border ${bgClass} relative flex items-center justify-center overflow-hidden transition-colors duration-300`}
                            >
                                <AnimatePresence mode='popLayout'>
                                    {isFilled && (
                                        <motion.div
                                            layoutId={`card-${slotId}`} // Unique ID for separate animations, but maybe we want "from deck"
                                            initial={{ opacity: 0, y: -100, x: 0, scale: 0.5 }}
                                            animate={{ opacity: 1, y: 0, x: 0, scale: 1 }}
                                            exit={{ opacity: 0, scale: 0 }}
                                            transition={{ type: "spring", stiffness: 200, damping: 20 }}
                                            className={`w-5 h-7 rounded-sm ${fillClass} shadow-sm`}
                                        />
                                    )}
                                </AnimatePresence>
                            </div>
                        );
                    })}
                </div>
            ))}
        </div>
    </div>
  );
};

export default SortingAnimation;
