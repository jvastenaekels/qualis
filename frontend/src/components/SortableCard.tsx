/*
 * Open-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import React from 'react';
import { motion } from 'framer-motion';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import ReactMarkdown from 'react-markdown';
import { useUIStore } from '../store/useUIStore';

interface SortableCardProps {
  id: number;
  text: string;
  isOverlay?: boolean;
  variant?: 'hand' | 'grid' | 'compact';
  isSelected?: boolean;
  onClick?: () => void;
  dimensions?: { width: number; height: number };
  aspectRatio?: number;
  disableHoverZoom?: boolean;
  allowScroll?: boolean;
}

const SortableCard: React.FC<SortableCardProps> = React.memo(({ 
    id, 
    text, 
    isOverlay, 
    variant = 'grid',
    isSelected,
    onClick,
    dimensions,
    aspectRatio,
    disableHoverZoom = false,
    allowScroll = false
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id });

  const setHoveredCard = useUIStore((state) => state.setHoveredCard);
  const hoverTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

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
     setHoveredCard({ id, text });
  };

  const handleMouseLeave = () => {
     setHoveredCard(null);
  };

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
    // Add dynamic dimensions if provided
    ...(dimensions && { width: dimensions.width, height: dimensions.height })
  };

  // Typography Logic
  let textSizeClass = '';
  let containerPadding = '';
  
  switch(variant) {
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
      case 'grid': 
      default:
          textSizeClass = 'text-sm font-medium leading-snug text-slate-800';
          if (!allowScroll) textSizeClass += ' line-clamp-4';
          containerPadding = 'p-3'; 
          break;
  }

  // Aspect Ratio Logic: Use prop if provided, otherwise default to 3/4
  const aspectStyle = aspectRatio ? { aspectRatio: `${aspectRatio}` } : {};
  const aspectClass = !aspectRatio && !dimensions ? 'aspect-[3/4]' : '';

  return (
    <>
        <div
            ref={setNodeRef}
            style={{ ...style, ...aspectStyle }}
            {...attributes}
            {...listeners}
            data-testid={`card-${id}`}
            onClick={() => {
                if (hoverTimerRef.current) {
                    clearTimeout(hoverTimerRef.current);
                    hoverTimerRef.current = null;
                }
                if (onClick) {
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
                touch-none dnd-prevent-pan
                [touch-action:none]
                ${isOverlay ? 'z-50 cursor-grabbing' : ''}
            `}
        >
            <motion.div
                layoutId={isOverlay ? undefined : `card-${id}`}
                transition={{ 
                    type: "spring", 
                    stiffness: 350, 
                    damping: 25,
                    duration: 0.4
                }}
                className={`
                    w-full h-full
                    bg-white rounded-2xl shadow-sm border 
                    ${isSelected 
                        ? 'border-blue-500 ring-2 ring-blue-300 shadow-md scale-[1.02] z-10' 
                        : 'border-slate-200 hover:border-indigo-300 hover:shadow-md hover:scale-[1.05]'
                    }
                    flex items-center justify-center ${containerPadding}
                    transition-colors
                    select-none group
                    ${isOverlay ? 'shadow-xl ring-2 ring-indigo-500' : ''}
                `}
            >
                <div className={`w-full h-full flex items-center justify-center ${allowScroll ? 'overflow-y-auto custom-scrollbar' : 'overflow-hidden'}`}>
                    <div 
                        className={`w-full text-center font-medium text-slate-800 ${textSizeClass}`}
                    >
                        <ReactMarkdown components={{ p: ({ children }) => <span>{children}</span> }}>
                            {text}
                        </ReactMarkdown>
                    </div>
                </div>
                
                {!disableHoverZoom && (
                    <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                         <span className="text-base text-indigo-400">🔍</span>
                    </div>
                )}
            </motion.div>
        </div>
    </>
  );
});

export default SortableCard;
