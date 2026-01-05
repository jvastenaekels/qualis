/*
 * Open-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

/**
 * Sortable Card Component
 *
 * Represents a single statement card that can be dragged.
 * Supports multiple variants (hand, grid, compact) and handles selection/hover states.
 */

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { motion } from 'framer-motion';
import { Eye } from 'lucide-react';
import React from 'react';
import ReactMarkdown from 'react-markdown';
import { useUIStore } from '../store/useUIStore';

interface SortableCardProps {
    id: number;
    text: string;
    code?: string;
    isOverlay?: boolean;
    variant?: 'hand' | 'grid' | 'compact';
    isSelected?: boolean;
    onClick?: () => void;
    onAction?: (id: number) => void;
    dimensions?: { width: number; height: number };
    aspectRatio?: number | 'auto';
    disableHoverZoom?: boolean;
    allowScroll?: boolean;
}

const CARD_SPRING_TRANSITION = {
    type: 'spring',
    stiffness: 350,
    damping: 25,
    duration: 0.4,
};

const CARD_PULSE_ANIMATION = {
    scale: [1, 1.03, 1],
    filter: ['brightness(1)', 'brightness(1.1)', 'brightness(1)'],
    transition: {
        duration: 0.5,
        ease: 'easeInOut',
        times: [0, 0.5, 1],
        type: 'tween',
    },
};

const SortableCard: React.FC<SortableCardProps> = React.memo(
    ({
        id,
        text,
        code,
        isOverlay,
        variant = 'grid',
        isSelected,
        onClick,
        dimensions,
        aspectRatio,
        disableHoverZoom = false,
        allowScroll = false,
    }) => {
        const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
            useSortable({ id });

        const setHoveredCard = useUIStore((state) => state.setHoveredCard);
        const hoverTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

        const scrollRef = React.useRef<HTMLDivElement>(null);

        // Cleanup timer on unmount
        React.useEffect(() => {
            return () => {
                if (hoverTimerRef.current) {
                    clearTimeout(hoverTimerRef.current);
                }
            };
        }, []);

        const handleMouseEnter = () => {
            // Immediate hover feedback for Reading Zone
            setHoveredCard({ id, text, code });
        };

        const handleMouseLeave = () => {
            setHoveredCard(null);
        };

        const style = {
            transform: CSS.Transform.toString(transform),
            transition,
            opacity: isDragging ? 0.3 : 1,
            // Add dynamic dimensions if provided
            ...(dimensions && { width: dimensions.width, height: dimensions.height }),
        };

        // Typography Logic
        let textSizeClass = '';
        let containerPadding = '';

        switch (variant) {
            case 'hand':
                textSizeClass = 'text-sm sm:text-base leading-relaxed';
                if (!allowScroll) textSizeClass += ' line-clamp-5';
                containerPadding = 'px-2 py-2';
                break;
            case 'compact':
                textSizeClass = 'text-xs leading-tight text-slate-700';
                if (!allowScroll) textSizeClass += ' line-clamp-4';
                containerPadding = 'p-1.5';
                break;
            default:
                textSizeClass = 'text-sm font-medium leading-snug text-slate-800';
                if (!allowScroll) textSizeClass += ' line-clamp-4';
                containerPadding = 'p-3';
                break;
        }

        // Aspect Ratio Logic: Use prop if provided, otherwise default to 3/4
        const aspectStyle =
            aspectRatio && aspectRatio !== 'auto' ? { aspectRatio: `${aspectRatio}` } : {};
        const aspectClass =
            !aspectRatio && !dimensions ? 'aspect-[3/4]' : aspectRatio === 'auto' ? 'h-full' : '';

        const handlePointerDown = (e: React.PointerEvent) => {
            // On touch devices, we want immediate feedback in the Reading Zone
            if (e.pointerType === 'touch') {
                handleMouseEnter();
            }
        };

        return (
            <div
                ref={setNodeRef}
                {...attributes}
                {...listeners}
                role="button"
                tabIndex={0}
                style={{ ...style, ...aspectStyle }}
                data-testid={`card-${id}`}
                onPointerDown={(e) => {
                    handlePointerDown(e);
                    listeners?.onPointerDown?.(e);
                }}
                onKeyDown={(e) => {
                    // Chain dnd-kit listener
                    if (listeners?.onKeyDown) {
                        listeners.onKeyDown(e);
                    }

                    if (e.key === 'Enter' || e.key === ' ') {
                        // Prevent default is handled by dnd-kit for Space, but we might check defaultPrevented
                        if (!e.defaultPrevented) {
                            e.preventDefault();
                        }

                        // Only trigger click if not dragging
                        // Note: isDragging might not be immediate
                        if (onAction) {
                            onAction(id);
                        } else if (onClick) {
                            onClick();
                        }
                    }
                }}
                onClick={() => {
                    // Prevent event from bubbling if it's a drag activation
                    if (isDragging) return;

                    if (hoverTimerRef.current) {
                        clearTimeout(hoverTimerRef.current);
                        hoverTimerRef.current = null;
                    }
                    if (onAction) {
                        onAction(id);
                    } else if (onClick) {
                        onClick();
                    }
                }}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
                className={`
                relative
                ${!dimensions ? 'w-full' : ''} ${aspectClass}
                flex items-center justify-center p-0
                cursor-grab active:cursor-grabbing
                dnd-prevent-pan
                ${isDragging ? '[touch-action:none]' : '[touch-action:manipulation]'}
                ${isOverlay ? 'z-50 cursor-grabbing' : ''}
            `}
            >
                <motion.div
                    layoutId={
                        process.env.NODE_ENV === 'test'
                            ? undefined
                            : isOverlay
                              ? undefined
                              : `card-${id}`
                    }
                    // biome-ignore lint/suspicious/noExplicitAny: framer type mismatch
                    transition={CARD_SPRING_TRANSITION as any}
                    // Trigger a subtle pulse/flash when the card content (id) changes or on mount
                    animate={
                        process.env.NODE_ENV === 'test'
                            ? undefined
                            : // biome-ignore lint/suspicious/noExplicitAny: framer type mismatch
                              (CARD_PULSE_ANIMATION as any)
                    }
                    key={id} // Ensure animation re-triggers if ID changes in this slot
                    className={`
                    w-full h-full
                    bg-white rounded-2xl shadow-sm border
                    ${
                        isSelected
                            ? 'border-blue-500 ring-2 ring-blue-300 shadow-md scale-[1.02] z-10'
                            : 'border-slate-200 hover:border-indigo-300 hover:shadow-md hover:scale-[1.05]'
                    }
                    flex items-center justify-center ${containerPadding}
                    transition-colors
                    select-none group
                    ${isOverlay ? 'shadow-xl ring-2 ring-indigo-500' : ''}
                `}
                >
                    {/* Statement Code Watermark */}
                    {code && (
                        <div className="absolute top-2 left-2.5 z-10">
                            <span className="text-[10px] font-bold text-slate-300/80 uppercase tracking-wider select-none">
                                {code}
                            </span>
                        </div>
                    )}

                    <div
                        ref={scrollRef}
                        className={`w-full h-full flex items-center justify-center ${allowScroll ? 'overflow-y-auto custom-scrollbar' : 'overflow-hidden'}`}
                    >
                        <div
                            className={`w-full text-center font-medium text-slate-800 ${textSizeClass}`}
                        >
                            {/[*_~#]/.test(text) ? (
                                <ReactMarkdown
                                    components={{
                                        p: ({ children }) => <span>{children}</span>,
                                    }}
                                >
                                    {text}
                                </ReactMarkdown>
                            ) : (
                                <span>{text}</span>
                            )}
                        </div>
                    </div>

                    {!disableHoverZoom && (
                        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-70 transition-opacity">
                            <div className="bg-indigo-50/50 p-1 rounded-full text-indigo-400">
                                <Eye size={14} strokeWidth={2.5} />
                            </div>
                        </div>
                    )}
                </motion.div>
            </div>
        );
    }
);

export default SortableCard;
