/*
 * Open-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronUp, X } from 'lucide-react';
import { motion } from 'framer-motion';
import SortableCard from './SortableCard';

interface WorkbenchPanelProps {
    card: { id: number; text: string } | null;
    onClose: () => void;
    className?: string;
    height?: number;
    cardDimensions?: { width: number; height: number };
}

const WorkbenchPanel: React.FC<WorkbenchPanelProps> = ({ card, onClose, className = '', height, cardDimensions }) => {
    const { t } = useTranslation();

    if (!card) return null;
    
    // Calculate aspect ratio from card dimensions (default to 3/4 if not provided)
    const aspectRatio = cardDimensions 
        ? cardDimensions.width / cardDimensions.height 
        : 0.75;

    return (
        <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className={`
                absolute bottom-0 left-0 right-0 
                bg-gradient-to-b from-white to-slate-50 rounded-t-3xl 
                shadow-[0_-8px_30px_rgba(0,0,0,0.15)]
                z-50 flex flex-col
                ${className}
            `}
            style={{
                height: height ? `${height}px` : '220px',
            }}
        >
            {/* Header with Slide Handle and Close */}
            <div className="flex-none flex items-center justify-between px-4 pt-2 pb-1">
                <div className="w-8" />
                <div className="flex flex-col items-center">
                    <div className="w-10 h-1 bg-slate-300 rounded-full" />
                </div>
                <button 
                    onClick={onClose}
                    className="p-1 text-slate-400 hover:text-red-500 rounded-full transition-colors"
                    aria-label={t('common.cancel')}
                >
                    <X size={18} />
                </button>
            </div>

            {/* Card + Instruction - Horizontal layout */}
            <div className="flex-1 flex items-center justify-center gap-3 px-4 pb-3 min-h-0">
                {/* Instruction - Left side */}
                <div className="flex-none flex items-center">
                    <div className="flex flex-col items-center gap-1 text-[9px] font-bold text-indigo-500 uppercase tracking-wider">
                        <ChevronUp size={12} className="animate-bounce" />
                        <span className="writing-mode-vertical">{t('fine.workbench.drag_or_tap', 'Drag or Tap')}</span>
                    </div>
                </div>

                {/* Draggable Card - Using SortableCard for dnd-kit integration */}
                <div 
                    className="flex-1 flex items-center justify-center"
                    style={{ 
                        maxHeight: '100%',
                        maxWidth: '55%'
                    }}
                >
                    <SortableCard 
                        id={card.id} 
                        text={card.text}
                        aspectRatio={aspectRatio}
                        variant="grid"
                        isSelected={true}
                        disableHoverZoom={true}
                        allowScroll={true}
                    />
                </div>

                {/* Instruction - Right side */}
                <div className="flex-none flex items-center">
                    <div className="flex flex-col items-center gap-1 text-[9px] font-bold text-indigo-500 uppercase tracking-wider">
                        <ChevronUp size={12} className="animate-bounce" />
                    </div>
                </div>
            </div>
        </motion.div>
    );
};

export default WorkbenchPanel;
