/*
 * Open-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { type MotionValue, motion, type PanInfo, useAnimation, useTransform } from 'framer-motion';
import { Eye } from 'lucide-react';
import type React from 'react';
import { useEffect, useImperativeHandle, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { useUIStore } from '../store/useUIStore';

interface CardStackProps {
    statement: { id: number; text: string; code?: string };
    onVote: (direction: 'agree' | 'disagree' | 'neutral') => void;
    x: MotionValue<number>;
    y: MotionValue<number>;
}

export interface CardStackHandle {
    swipe: (direction: 'agree' | 'disagree' | 'neutral') => Promise<void>;
}

const CardStack: React.FC<CardStackProps & { ref?: React.Ref<CardStackHandle> }> = ({
    statement,
    onVote,
    x,
    y,
    ref,
}) => {
    const controls = useAnimation();
    const setHoveredCard = useUIStore((state) => state.setHoveredCard);
    const [isOverflowing, setIsOverflowing] = useState(false);
    const textRef = useRef<HTMLDivElement>(null);

    // Dynamic Tints
    // Left (-x): Red, Right (+x): Green, Down (+y): Gray
    const rotate = useTransform(x, [-200, 200], [-10, 10]);
    // Immediate Feedback: Start opacity change at 10px, solid by 100px
    const opacityAgree = useTransform(x, [10, 100], [0, 1]);
    const opacityDisagree = useTransform(x, [-10, -100], [0, 1]);
    const opacityNeutral = useTransform(y, [10, 100], [0, 1]);

    // Dynamic Typography
    const textLength = statement.text.length;
    let fontSizeClass = 'text-xl sm:text-2xl';
    if (textLength > 150) fontSizeClass = 'text-sm sm:text-base';
    else if (textLength > 80) fontSizeClass = 'text-lg sm:text-xl';

    // Overflow Detection
    useEffect(() => {
        const checkOverflow = () => {
            if (textRef.current) {
                const hasOverflow = textRef.current.scrollHeight > textRef.current.clientHeight;
                setIsOverflowing(hasOverflow);
            }
        };

        checkOverflow();
        // Re-check on statement change or window resize (typography auto-scale might change things)
        window.addEventListener('resize', checkOverflow);
        return () => window.removeEventListener('resize', checkOverflow);
    }, []);

    useImperativeHandle(ref, () => ({
        swipe: async (direction) => {
            // Trigger animation matching gestures
            switch (direction) {
                case 'agree':
                    await controls.start({
                        x: 500,
                        opacity: 0,
                        transition: { duration: 0.2 },
                    });
                    break;
                case 'disagree':
                    await controls.start({
                        x: -500,
                        opacity: 0,
                        transition: { duration: 0.2 },
                    });
                    break;
                case 'neutral':
                    await controls.start({
                        y: 500,
                        opacity: 0,
                        transition: { duration: 0.2 },
                    });
                    break;
            }
            onVote(direction);
            // Reset position instantly after voting
            controls.set({ x: 0, y: 0, opacity: 1 });
        },
    }));

    const handleDragEnd = async (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
        const threshold = 100;
        const { x: offsetX, y: offsetY } = info.offset;

        if (offsetX > threshold) {
            await controls.start({
                x: 500,
                opacity: 0,
                transition: { duration: 0.2 },
            });
            onVote('agree');
        } else if (offsetX < -threshold) {
            await controls.start({
                x: -500,
                opacity: 0,
                transition: { duration: 0.2 },
            });
            onVote('disagree');
        } else if (offsetY > threshold) {
            await controls.start({
                y: 500,
                opacity: 0,
                transition: { duration: 0.2 },
            });
            onVote('neutral');
        } else {
            controls.start({ x: 0, y: 0, transition: { type: 'spring' } });
        }
    };

    return (
        <div className="relative w-full h-full flex items-center justify-center">
            {/* Dummy Cards for Depth Effect */}
            <div className="absolute w-full h-full bg-white rounded-3xl border border-gray-200 shadow-sm scale-90 translate-y-4 opacity-50 z-0" />
            <div className="absolute w-full h-full bg-white rounded-3xl border border-gray-200 shadow-sm scale-95 translate-y-2 opacity-80 z-0" />

            {/* Interactable Card */}
            <motion.div
                drag
                dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }} // Snap back origin
                dragElastic={0.7} // Resistance
                onDragStart={() => {
                    setHoveredCard(null);
                }}
                onDragEnd={handleDragEnd}
                animate={controls}
                style={{ x, y, rotate }}
                data-testid={`card-${statement.id}`}
                className="absolute w-full h-full bg-white rounded-3xl border border-gray-200 shadow-xl z-10 flex flex-col items-center justify-center p-6 sm:p-8 cursor-pointer active:cursor-grabbing touch-none overflow-hidden"
            >
                {/* Color Overlays */}
                <motion.div
                    style={{ opacity: opacityAgree }}
                    className="absolute inset-0 bg-green-100/50 pointer-events-none flex items-center justify-center border-4 border-green-500 rounded-3xl"
                >
                    <span className="text-4xl font-bold text-green-600 tracking-wider rotate-[-12deg] border-4 border-green-600 px-4 py-2 rounded-lg opacity-80">
                        AGREE
                    </span>
                </motion.div>
                <motion.div
                    style={{ opacity: opacityDisagree }}
                    className="absolute inset-0 bg-red-100/50 pointer-events-none flex items-center justify-center border-4 border-red-500 rounded-3xl"
                >
                    <span className="text-4xl font-bold text-red-600 tracking-wider rotate-[12deg] border-4 border-red-600 px-4 py-2 rounded-lg opacity-80">
                        DISAGREE
                    </span>
                </motion.div>
                <motion.div
                    style={{ opacity: opacityNeutral }}
                    className="absolute inset-0 bg-gray-100/50 pointer-events-none border-4 border-gray-500 rounded-3xl"
                />

                {/* Statement Code Watermark - Similar to SortableCard style */}
                {statement.code && (
                    <div className="absolute top-3 left-4 z-20">
                        <span className="text-xs font-bold text-slate-300/80 uppercase tracking-wider select-none">
                            {statement.code}
                        </span>
                    </div>
                )}

                {/* Content - No scroll to avoid drag conflict */}
                <div className="flex-1 w-full flex flex-col p-2 overflow-hidden pointer-events-none">
                    <div
                        ref={textRef}
                        className={`${fontSizeClass} font-medium text-gray-800 text-center select-none m-auto leading-relaxed line-clamp-[10] sm:line-clamp-none`}
                    >
                        <ReactMarkdown
                            components={{ p: ({ children }) => <span>{children}</span> }}
                        >
                            {statement.text}
                        </ReactMarkdown>
                    </div>
                </div>

                {/* Zoom Trigger Info - ONLY if overflowing */}
                {isOverflowing && (
                    <motion.button
                        whileTap={{ scale: 0.9 }}
                        onClick={(e) => {
                            e.stopPropagation();
                            setHoveredCard({
                                id: statement.id,
                                text: statement.text,
                                code: statement.code,
                            });
                        }}
                        className="absolute bottom-2 right-2 p-1.5 bg-indigo-50/90 rounded-full text-indigo-600 shadow-sm lg:p-1.5 transition-colors hover:bg-indigo-100 z-20"
                        aria-label="Read statement"
                    >
                        <Eye size={20} strokeWidth={3} />
                    </motion.button>
                )}
            </motion.div>
        </div>
    );
};

export default CardStack;
