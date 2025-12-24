/*
 * Open-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { Lightbulb, Sparkles } from 'lucide-react';

interface MethodologyTipsProps {
    variant: 'mobile' | 'desktop';
}

const MethodologyTips: React.FC<MethodologyTipsProps> = ({ variant }) => {
    const { t } = useTranslation();
    const [step, setStep] = useState(0);

    const tips = [
        t('fine.workbench.methodology.extremes'),
        t('fine.workbench.methodology.vertical'),
        t('fine.workbench.methodology.constraint')
    ];

    useEffect(() => {
        const interval = setInterval(() => {
            setStep(prev => (prev + 1) % tips.length);
        }, 6000);
        return () => clearInterval(interval);
    }, [tips.length]);

    if (variant === 'mobile') {
        return (
            <div className="h-full flex flex-col items-center justify-center gap-1.5 text-indigo-400">
                <AnimatePresence mode="wait">
                    <motion.div 
                        key={step}
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -5 }}
                        className="text-center flex flex-col items-center"
                    >
                        <div className="flex items-center gap-1.5 opacity-60 mb-0.5">
                            <Lightbulb size={10} className="text-amber-400 fill-amber-400/20" />
                            <p className="text-[10px] font-bold uppercase tracking-widest">
                                {t('fine.workbench.help')}
                            </p>
                        </div>
                        <p className="text-xs font-semibold leading-relaxed px-4 italic text-indigo-600/80">
                            {tips[step]}
                        </p>
                    </motion.div>
                </AnimatePresence>
            </div>
        );
    }

    return (
        <div className="flex flex-col items-center justify-center h-full text-center text-indigo-400 py-2">
            <AnimatePresence mode="wait">
                <motion.div 
                   key={step}
                   initial={{ opacity: 0, y: 10 }}
                   animate={{ opacity: 1, y: 0 }}
                   exit={{ opacity: 0, y: -10 }}
                   className="flex flex-col items-center gap-3 px-6"
                >
                    <div className="p-2 bg-amber-50 rounded-full text-amber-500 relative">
                       <Lightbulb size={24} strokeWidth={1.5} className="fill-amber-500/10" />
                       <motion.div 
                           animate={{ opacity: [0.4, 0.8, 0.4], scale: [1, 1.2, 1] }}
                           transition={{ duration: 2, repeat: Infinity }}
                           className="absolute -top-1 -right-1 text-amber-400"
                       >
                           <Sparkles size={12} />
                       </motion.div>
                    </div>
                    <p className="text-sm font-medium leading-relaxed italic text-indigo-600/70">
                        {tips[step]}
                    </p>
                </motion.div>
            </AnimatePresence>
        </div>
    );
};

export default React.memo(MethodologyTips);
