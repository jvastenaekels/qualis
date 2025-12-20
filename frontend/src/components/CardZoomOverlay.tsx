/*
 * Open-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import React from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import { useStudyStore } from '../store/useStudyStore';

const CardZoomOverlay: React.FC = () => {
    const zoomedCard = useStudyStore((state) => state.zoomedCard);
    
    return createPortal(
        <AnimatePresence>
            {zoomedCard && (
                <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[9999] pointer-events-none flex items-center justify-center p-4"
                >
                    {/* Backdrop (visual only since pointer-events-none on parent) */}
                    <div className="absolute inset-0 bg-slate-900/5" />

                    <motion.div 
                        initial={{ scale: 0.9, y: 10, opacity: 0 }}
                        animate={{ scale: 1, y: 0, opacity: 1 }}
                        exit={{ scale: 0.9, y: 10, opacity: 0 }}
                        className="relative bg-white p-8 rounded-2xl shadow-2xl border-2 border-indigo-500 max-w-sm mx-auto flex flex-col pointer-events-auto"
                    >
                        <div className="text-xl font-medium text-slate-800 text-center leading-relaxed my-auto font-sans">
                            <ReactMarkdown components={{ p: ({ children }) => <span>{children}</span> }}>
                                {zoomedCard.text}
                            </ReactMarkdown>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>,
        document.body
    );
};

export default CardZoomOverlay;
