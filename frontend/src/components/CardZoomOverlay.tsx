/*
 * Open-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import React from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import { useUIStore } from '../store/useUIStore';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

const CardZoomOverlay: React.FC = () => {
    const zoomedCard = useUIStore((state) => state.zoomedCard);
    const setZoomedCard = useUIStore((state) => state.setZoomedCard);
    const { t } = useTranslation();
    
    // Simple responsive check
    const [isMobile, setIsMobile] = React.useState(typeof window !== 'undefined' && window.innerWidth < 1024);

    React.useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 1024);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Clear overlay on navigation
    const location = useLocation();
    React.useEffect(() => {
        setZoomedCard(null);
    }, [location.pathname, setZoomedCard]);

    return createPortal(
        <AnimatePresence>
            {zoomedCard && (
                <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    // Desktop: Bottom Right Bubble (near deck) | Mobile: Full Width Bottom Sheet
                    className={`
                        fixed z-[9999] flex 
                        ${isMobile 
                            ? 'inset-x-0 bottom-0 items-end justify-center pointer-events-auto' 
                            : 'bottom-8 right-8 items-end justify-end max-w-sm pointer-events-none'
                        }
                    `}
                    onClick={() => isMobile && setZoomedCard(null)} // Dismiss on tap for mobile
                >
                    <motion.div 
                        initial={isMobile 
                            ? { y: '100%', opacity: 0.5 } 
                            : { scale: 0.9, x: 20, opacity: 0 }
                        }
                        animate={isMobile 
                            ? { y: 0, opacity: 1 } 
                            : { scale: 1, x: 0, opacity: 1 }
                        }
                        exit={isMobile 
                            ? { y: '100%', opacity: 0 } 
                            : { scale: 0.9, x: 20, opacity: 0 }
                        }
                        transition={{ type: "spring", damping: 25, stiffness: 300 }}
                        onClick={(e) => e.stopPropagation()} // Prevent dismissal when clicking content
                        className={`
                            relative bg-white shadow-2xl touch-manipulation
                            ${isMobile 
                                ? 'w-full rounded-t-[2.5rem] border-t-4 border-indigo-500 p-8 pb-12 pointer-events-auto' 
                                : 'p-6 rounded-2xl border-2 border-indigo-500 flex flex-col pointer-events-none select-none'
                            }
                        `}
                    >
                        {/* Mobile Handle */}
                        {isMobile && (
                            <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-6" />
                        )}

                        <div className={`
                            font-medium text-slate-800 font-sans leading-relaxed
                            overflow-y-auto custom-scrollbar
                            ${isMobile 
                                ? 'text-xl leading-normal text-center px-4 py-2 max-h-[60vh]' 
                                : 'text-lg max-h-[400px] pr-2'
                            }
                        `}>
                            <ReactMarkdown components={{ p: ({ children }) => <span>{children}</span> }}>
                                {zoomedCard.text}
                            </ReactMarkdown>
                        </div>
                        
                        {/* Mobile Instruction */}
                        {isMobile && (
                            <div className="mt-8 text-center">
                                <span className="text-xs font-bold text-slate-300 uppercase tracking-widest">
                                    {t('common.tap_to_close', 'Tap to close')}
                                </span>
                            </div>
                        )}
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>,
        document.body
    );
};

export default CardZoomOverlay;
