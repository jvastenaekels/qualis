/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
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
import { Eye, MessageSquare, Mic } from 'lucide-react';
import React from 'react';
import { SafeMarkdown } from './SafeMarkdown';
import { inlineMarkdownComponents } from './markdown-config';
import { useUIStore } from '../store/useUIStore';
import { cn } from '@/lib/utils';
import { cva } from 'class-variance-authority';
import { useHyphenation } from '@/hooks/useHyphenation';

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
    hasComment?: boolean;
    hasAudio?: boolean;
    readOnly?: boolean;
}

const CARD_SPRING_TRANSITION = {
    type: 'spring' as const,
    stiffness: 350,
    damping: 25,
    duration: 0.4,
};

const CARD_PULSE_ANIMATION = {
    scale: [1, 1.03, 1],
    filter: ['brightness(1)', 'brightness(1.1)', 'brightness(1)'],
    transition: {
        duration: 0.5,
        ease: 'easeInOut' as const,
        times: [0, 0.5, 1],
        type: 'tween' as const,
    },
};

const cardStyles = cva(
    'relative flex items-center justify-center p-0 cursor-grab active:cursor-grabbing dnd-prevent-pan focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:outline-none',
    {
        variants: {
            isDragging: {
                true: '[touch-action:none]',
                false: '[touch-action:manipulation]',
            },
            isOverlay: {
                true: 'z-50 cursor-grabbing',
            },
        },
    }
);

const innerCardStyles = cva(
    'w-full h-full bg-white rounded-2xl shadow-sm border transition-colors select-none group',
    {
        variants: {
            variant: {
                hand: 'px-2 py-2',
                compact: 'p-1.5',
                grid: 'px-3 py-2',
            },
            isSelected: {
                true: 'border-blue-500 ring-2 ring-blue-300 shadow-md scale-[1.02] z-10',
                false: 'border-slate-200 hover:border-indigo-300 hover:shadow-md hover:scale-[1.05]',
            },
            isOverlay: {
                true: 'shadow-xl ring-2 ring-indigo-500',
            },
        },
        defaultVariants: {
            variant: 'grid',
            isSelected: false,
        },
    }
);

const textStyles = cva('w-full text-center font-medium text-slate-800 [hyphens:manual]', {
    variants: {
        variant: {
            hand: 'text-sm sm:text-base leading-relaxed',
            compact: 'text-xs lg:text-sm leading-tight text-slate-700',
            grid: 'text-xs sm:text-sm font-medium leading-tight text-slate-800',
        },
        allowScroll: {
            false: '',
        },
    },
    compoundVariants: [
        { variant: 'hand', allowScroll: false, className: 'line-clamp-5' },
        { variant: 'compact', allowScroll: false, className: 'line-clamp-3 lg:line-clamp-5' },
        { variant: 'grid', allowScroll: false, className: 'line-clamp-4' },
    ],
    defaultVariants: {
        variant: 'grid',
        allowScroll: false,
    },
});

const SortableCard: React.FC<SortableCardProps> = React.memo(
    ({
        id,
        text,
        code,
        isOverlay,
        variant = 'grid',
        isSelected,
        onClick,
        onAction,
        dimensions,
        aspectRatio,
        disableHoverZoom = false,
        allowScroll = false,
        hasComment = false,
        hasAudio = false,
        readOnly = false,
    }) => {
        const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
            useSortable({ id, disabled: readOnly });

        const setHoveredCard = useUIStore((state) => state.setHoveredCard);
        const hyphenate = useHyphenation();

        const scrollRef = React.useRef<HTMLDivElement>(null);
        const textRef = React.useRef<HTMLDivElement>(null);
        const [dynamicLineClamp, setDynamicLineClamp] = React.useState<number | undefined>(
            undefined
        );

        // Dynamic line clamp: measure available container height and compute max lines.
        // Uses useLayoutEffect to compute before paint, avoiding a visible reflow
        // from the static CSS fallback to the dynamic value.
        //
        // scrollRef has h-full so its clientHeight reflects the card's available space,
        // independent of text content. lineHeight is read from textRef which inherits
        // the variant's font-size/leading via CSS.
        //
        // When dimensions are provided (grid-placed cards), compute once without an
        // observer. Reserve ResizeObserver for CSS-sized cards (deck/sidebar) only.
        // biome-ignore lint/correctness/useExhaustiveDependencies: variant changes font-size/line-height without resizing the container; dimensions?.height triggers recomputation when the grid resizes
        React.useLayoutEffect(() => {
            if (allowScroll) {
                setDynamicLineClamp(undefined);
                return;
            }

            const container = scrollRef.current;
            const text = textRef.current;
            if (!container || !text) return;

            const computeLines = () => {
                const lineHeight = parseFloat(getComputedStyle(text).lineHeight);
                if (!lineHeight || lineHeight <= 0) return;
                // clientHeight includes padding; subtract it to get the actual
                // content box available for text (matters for compact's pt-0.5).
                const cs = getComputedStyle(container);
                const available =
                    container.clientHeight -
                    parseFloat(cs.paddingTop) -
                    parseFloat(cs.paddingBottom);
                if (available <= 0) return;
                setDynamicLineClamp((prev) => {
                    const lines = Math.max(1, Math.floor(available / lineHeight));
                    return prev === lines ? prev : lines;
                });
            };

            computeLines();

            // Only CSS-sized cards (no dimensions prop) need an observer —
            // their size can change without a prop update (e.g. viewport resize).
            // Grid cards recompute via the dimensions?.height dependency instead.
            if (dimensions) return;

            const observer = new ResizeObserver(computeLines);
            observer.observe(container);
            return () => observer.disconnect();
        }, [allowScroll, variant, dimensions?.height]);

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
                aria-label={code ? `${code}: ${text}` : text}
                aria-pressed={isSelected}
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
                onClick={(e) => {
                    if (isDragging) return;

                    // When deselecting (tapping the already-selected card),
                    // stop propagation so the parent DroppableSlot doesn't
                    // re-place the card. For other cards, let it bubble so
                    // the slot can handle swap/placement.
                    if (isSelected) {
                        e.stopPropagation();
                    }

                    if (onAction) {
                        onAction(id);
                    } else if (onClick) {
                        onClick();
                    }
                }}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
                className={cn(
                    cardStyles({ isDragging, isOverlay }),
                    !dimensions && 'w-full',
                    aspectClass
                )}
            >
                <motion.div
                    layoutId={
                        process.env.NODE_ENV === 'test'
                            ? undefined
                            : isOverlay
                              ? undefined
                              : `card-${id}`
                    }
                    transition={CARD_SPRING_TRANSITION}
                    animate={process.env.NODE_ENV === 'test' ? undefined : CARD_PULSE_ANIMATION}
                    key={id} // Ensure animation re-triggers if ID changes in this slot
                    className={innerCardStyles({ variant, isSelected, isOverlay })}
                >
                    {/* Statement Code Watermark */}
                    {code && (
                        <div className="absolute top-2 left-2.5 z-10">
                            <span className="text-2xs font-bold text-slate-300/80 select-none">
                                {code}
                            </span>
                        </div>
                    )}

                    <div
                        ref={scrollRef}
                        className={`w-full h-full flex ${variant === 'compact' ? 'items-start pt-0.5' : 'items-center'} justify-center ${allowScroll ? 'overflow-y-auto custom-scrollbar' : 'overflow-hidden'}`}
                    >
                        <div
                            ref={textRef}
                            className={textStyles({ variant, allowScroll })}
                            style={
                                dynamicLineClamp != null
                                    ? { WebkitLineClamp: dynamicLineClamp }
                                    : undefined
                            }
                        >
                            {/[*_~#]/.test(text) ? (
                                <SafeMarkdown
                                    components={inlineMarkdownComponents}
                                    className="!prose-none text-inherit"
                                >
                                    {text}
                                </SafeMarkdown>
                            ) : (
                                <span>{hyphenate(text)}</span>
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

                    {hasComment && (
                        <div className="absolute bottom-1.5 right-1.5 z-10">
                            <div className="bg-indigo-100/90 p-1 rounded-full text-indigo-600 shadow-sm backdrop-blur-[1px] ring-1 ring-white/50">
                                <MessageSquare size={10} strokeWidth={3} />
                            </div>
                        </div>
                    )}

                    {hasAudio && (
                        <div className="absolute bottom-1.5 left-1.5 z-10">
                            <div className="bg-purple-100/90 p-1 rounded-full text-purple-600 shadow-sm backdrop-blur-[1px] ring-1 ring-white/50">
                                <Mic size={10} strokeWidth={3} />
                            </div>
                        </div>
                    )}
                </motion.div>
            </div>
        );
    }
);

export default SortableCard;
