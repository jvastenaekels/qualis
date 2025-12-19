import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { createPortal } from 'react-dom';

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
}

const SortableCard: React.FC<SortableCardProps> = ({ 
    id, 
    text, 
    isOverlay, 
    variant = 'grid',
    isSelected,
    onClick,
    dimensions,
    aspectRatio,
    disableHoverZoom = false
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id });

  const [showZoom, setShowZoom] = useState(false);

  // ... (ZoomPortal remains same) ...

  const ZoomPortal = () => createPortal(
    <div className="fixed inset-0 z-[9999] pointer-events-none flex items-center justify-center">
        <div className="bg-white/95 backdrop-blur-sm p-6 rounded-xl shadow-2xl border-2 border-indigo-500 max-w-sm mx-4 transform scale-110 max-h-[80vh] overflow-y-auto flex flex-col">
            <p className="text-lg font-medium text-slate-800 text-center leading-relaxed my-auto">
                {text}
            </p>
        </div>
    </div>,
    document.body
  );

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
          textSizeClass = 'text-sm sm:text-base leading-relaxed line-clamp-5';
          containerPadding = 'px-2 py-2';
          break;
      case 'compact': 
          textSizeClass = 'text-xs leading-tight line-clamp-4 text-slate-700'; // Smaller text for mobile deck
          containerPadding = 'p-2';
          break;
      case 'grid': 
      default:
          textSizeClass = 'text-sm font-medium leading-snug text-slate-800 line-clamp-4';
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
            onClick={() => {
                if (onClick) {
                    onClick();
                }
            }}
            onMouseEnter={() => !isDragging && !isOverlay && setShowZoom(true)}
            onMouseLeave={() => setShowZoom(false)}
            className={`
                relative
                ${!dimensions ? 'w-full' : ''} ${aspectClass}
                flex items-center justify-center p-0
                cursor-grab active:cursor-grabbing
                touch-manipulation dnd-prevent-pan
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
                    bg-white rounded-lg shadow-sm border 
                    ${isSelected 
                        ? 'border-blue-500 ring-2 ring-blue-300 shadow-md scale-[1.02] z-10' 
                        : 'border-slate-200 hover:border-indigo-300 hover:shadow-md'
                    }
                    flex items-center justify-center ${containerPadding}
                    transition-colors
                    select-none group
                    ${isOverlay ? 'scale-105 shadow-xl ring-2 ring-indigo-500' : ''}
                `}
            >
                <div className="w-full h-full flex items-center justify-center overflow-hidden">
                    <p 
                        className={`text-center font-medium text-slate-800 ${textSizeClass}`}
                    >
                        {text}
                    </p>
                </div>
                
                <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                     <span className="text-base text-indigo-400">🔍</span>
                </div>
            </motion.div>
        </div>

        {showZoom && !isDragging && !disableHoverZoom && <ZoomPortal />}
    </>
  );
};

export default SortableCard;
