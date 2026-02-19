/*
 * Libre-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { ChevronLeft, ChevronRight, Lightbulb } from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useConfigStore } from '@/store/useConfigStore';

interface MethodologyTipsProps {
    variant: 'mobile' | 'desktop';
}

const MethodologyTips: React.FC<MethodologyTipsProps> = ({ variant }) => {
    const { t } = useTranslation();
    const { config } = useConfigStore();
    const [step, setStep] = useState(0);
    const [isPaused, setIsPaused] = useState(false);
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);

    const defaultTips = [
        t('fine.workbench.methodology.extremes'),
        t('fine.workbench.methodology.vertical'),
        t('fine.workbench.methodology.constraint'),
        t('fine.workbench.methodology.relative'),
        t('fine.workbench.methodology.zoom'),
        t('fine.workbench.methodology.flexibility'),
    ];

    const tips = config?.methodology_tips?.length ? config.methodology_tips : defaultTips;

    const nextTip = useCallback(() => {
        setStep((prev) => (prev + 1) % tips.length);
        setIsPaused(true);
    }, [tips.length]);

    const prevTip = useCallback(() => {
        setStep((prev) => (prev - 1 + tips.length) % tips.length);
        setIsPaused(true);
    }, [tips.length]);

    useEffect(() => {
        if (isPaused) {
            // Resume after 10 seconds of inactivity
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            timeoutRef.current = setTimeout(() => setIsPaused(false), 10000);
            return;
        }

        const interval = setInterval(() => {
            setStep((prev) => (prev + 1) % tips.length);
        }, 6000);
        return () => clearInterval(interval);
    }, [tips.length, isPaused]);

    // Cleanup timeout on unmount
    useEffect(() => {
        return () => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
        };
    }, []);

    if (variant === 'mobile') {
        return (
            <div className="h-full flex flex-col items-center justify-center gap-1.5 text-indigo-400 relative">
                <button
                    type="button"
                    onClick={prevTip}
                    className="absolute left-0 top-1/2 -translate-y-1/2 p-2 text-indigo-300 hover:text-indigo-500 hover:bg-indigo-50/50 rounded-full transition-colors"
                    aria-label={t('fine.workbench.previous_tip', 'Previous tip')}
                >
                    <ChevronLeft size={16} />
                </button>
                <div
                    key={step}
                    className="text-center flex flex-col items-center animate-in fade-in slide-in-from-bottom-1 duration-300 px-8"
                >
                    <div className="flex items-center gap-1.5 opacity-60 mb-0.5">
                        <Lightbulb size={10} className="text-amber-400 fill-amber-400/20" />
                        <p className="text-[10px] font-bold uppercase tracking-widest">
                            {t('fine.workbench.help')}
                        </p>
                    </div>
                    <p className="text-xs font-semibold leading-relaxed italic text-indigo-600/80">
                        {tips[step]}
                    </p>
                    <div className="flex gap-1 mt-1 justify-center">
                        {tips.map((_, i) => (
                            <div
                                key={i}
                                className={`h-1 rounded-full transition-all duration-300 ${i === step ? 'w-3 bg-indigo-400' : 'w-1 bg-indigo-200'}`}
                            />
                        ))}
                    </div>
                </div>
                <button
                    type="button"
                    onClick={nextTip}
                    className="absolute right-0 top-1/2 -translate-y-1/2 p-2 text-indigo-300 hover:text-indigo-500 hover:bg-indigo-50/50 rounded-full transition-colors"
                    aria-label={t('fine.workbench.next_tip', 'Next tip')}
                >
                    <ChevronRight size={16} />
                </button>
            </div>
        );
    }

    return (
        <div className="flex flex-col items-center justify-center h-full text-center text-indigo-400 py-2 relative group-hover:opacity-100 transition-opacity">
            <button
                type="button"
                onClick={prevTip}
                className="absolute left-1 top-1/2 -translate-y-1/2 p-1.5 text-indigo-300 hover:text-indigo-600 hover:bg-indigo-100/80 rounded-full transition-all opacity-0 group-hover:opacity-100"
                aria-label="Previous tip"
            >
                <ChevronLeft size={20} />
            </button>

            <div className="flex flex-col items-center gap-3 px-8 animate-in fade-in duration-300">
                <div className="p-2 bg-amber-50 rounded-full text-amber-500 relative">
                    <Lightbulb size={24} strokeWidth={1.5} className="fill-amber-500/10" />
                </div>
                <p className="text-sm font-medium leading-relaxed italic text-indigo-600/70 min-h-[3rem] flex items-center justify-center">
                    {tips[step]}
                </p>
                <div className="flex gap-1.5 mt-2">
                    {tips.map((_, i) => (
                        <button
                            key={i}
                            type="button"
                            onClick={() => {
                                setStep(i);
                                setIsPaused(true);
                            }}
                            className={`h-1.5 rounded-full transition-all duration-300 ${i === step ? 'w-4 bg-indigo-400' : 'w-1.5 bg-indigo-200 hover:bg-indigo-300'}`}
                            aria-label={`Go to tip ${i + 1}`}
                        />
                    ))}
                </div>
            </div>

            <button
                type="button"
                onClick={nextTip}
                className="absolute right-1 top-1/2 -translate-y-1/2 p-1.5 text-indigo-300 hover:text-indigo-600 hover:bg-indigo-100/80 rounded-full transition-all opacity-0 group-hover:opacity-100"
                aria-label="Next tip"
            >
                <ChevronRight size={20} />
            </button>
        </div>
    );
};

export default React.memo(MethodologyTips);
