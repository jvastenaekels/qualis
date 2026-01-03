/*
 * Open-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { Lightbulb } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface MethodologyTipsProps {
    variant: 'mobile' | 'desktop';
}

const MethodologyTips: React.FC<MethodologyTipsProps> = ({ variant }) => {
    const { t } = useTranslation();
    const [step, setStep] = useState(0);

    const tips = [
        t('fine.workbench.methodology.extremes'),
        t('fine.workbench.methodology.vertical'),
        t('fine.workbench.methodology.constraint'),
    ];

    useEffect(() => {
        const interval = setInterval(() => {
            setStep((prev) => (prev + 1) % tips.length);
        }, 6000);
        return () => clearInterval(interval);
    }, [tips.length]);

    if (variant === 'mobile') {
        return (
            <div className="h-full flex flex-col items-center justify-center gap-1.5 text-indigo-400">
                <div
                    key={step}
                    className="text-center flex flex-col items-center animate-in fade-in slide-in-from-bottom-1 duration-300"
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
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col items-center justify-center h-full text-center text-indigo-400 py-2">
            <div className="flex flex-col items-center gap-3 px-6 animate-in fade-in duration-300">
                <div className="p-2 bg-amber-50 rounded-full text-amber-500 relative">
                    <Lightbulb size={24} strokeWidth={1.5} className="fill-amber-500/10" />
                </div>
                <p className="text-sm font-medium leading-relaxed italic text-indigo-600/70">
                    {tips[step]}
                </p>
            </div>
        </div>
    );
};

export default React.memo(MethodologyTips);
