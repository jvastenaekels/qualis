/*
 * Open-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import { XCircle, ArrowDown } from 'lucide-react';
import { motion } from 'framer-motion';

interface WorkbenchPanelProps {
    card: { id: number; text: string } | null;
    onClose: () => void;
    className?: string;
}

const WorkbenchPanel: React.FC<WorkbenchPanelProps> = ({ card, onClose, className = '' }) => {
    const { t } = useTranslation();

    if (!card) return null;

    return (
        <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className={`
                absolute bottom-0 left-0 right-0 
                h-[35vh] lg:h-auto lg:relative lg:flex-1
                bg-white border-t-4 border-indigo-500 shadow-[0_-8px_30px_rgba(0,0,0,0.12)]
                z-50 flex flex-col
                ${className}
            `}
        >
            {/* Header / Actions */}
            <div className="flex-none flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50/50">
                <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-indigo-600 uppercase tracking-widest bg-indigo-50 px-2 py-1 rounded-md">
                        {t('fine.workbench.active_card', 'Active Card')}
                    </span>
                    <span className="text-xs text-slate-400 font-medium hidden sm:inline-block">
                        #{card.id}
                    </span>
                </div>
                
                <button 
                    onClick={onClose}
                    className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors touch-manipulation"
                    aria-label={t('common.cancel')}
                >
                    <XCircle size={24} />
                </button>
            </div>

            {/* Content "The Stage" */}
            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar touch-manipulation">
                <div className="max-w-3xl mx-auto">
                    <div className="prose prose-lg prose-indigo text-slate-800 leading-relaxed font-medium">
                        <ReactMarkdown components={{ p: ({ children }) => <span className="block mb-4 last:mb-0">{children}</span> }}>
                            {card.text}
                        </ReactMarkdown>
                    </div>
                </div>
            </div>

            {/* Instruction Footer (Subtle) */}
            <div className="flex-none py-2 bg-slate-50 border-t border-slate-100 text-center">
                <div className="flex items-center justify-center gap-2 text-xs font-bold text-indigo-400/80 uppercase tracking-wider animate-pulse">
                    <ArrowDown size={14} className="rotate-180" /> {/* Pointing UP to grid */}
                    {t('fine.workbench.place_on_grid', 'Tap Grid to Place')}
                </div>
            </div>
        </motion.div>
    );
};

export default WorkbenchPanel;
