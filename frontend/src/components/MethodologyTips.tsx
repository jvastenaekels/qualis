/*
 * Libre-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { ChevronLeft, ChevronRight, Lightbulb } from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useConfigStore } from '@/store/useConfigStore';
import { useHyphenation } from '@/hooks/useHyphenation';

interface MethodologyTipsProps {
    variant: 'mobile' | 'desktop';
}

const ScrollIndicator: React.FC = () => (
    <div className="absolute bottom-0 left-0 right-0 h-5 bg-gradient-to-t from-indigo-50 to-transparent pointer-events-none flex items-end justify-center pb-0.5 z-10">
        <div className="motion-safe:animate-bounce opacity-50">
            <svg
                aria-hidden="true"
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-indigo-900"
            >
                <path d="m6 9 6 6 6-6" />
            </svg>
        </div>
    </div>
);

const MethodologyTips: React.FC<MethodologyTipsProps> = ({ variant }) => {
    const { t } = useTranslation();
    const { config } = useConfigStore();
    const hyphenate = useHyphenation();
    const [step, setStep] = useState(0);
    const [isPaused, setIsPaused] = useState(false);
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);
    const textRef = useRef<HTMLDivElement>(null);
    const [hasOverflow, setHasOverflow] = useState(false);

    // biome-ignore lint/correctness/useExhaustiveDependencies: step change triggers re-measurement
    useEffect(() => {
        const el = textRef.current;
        if (el) {
            setHasOverflow(el.scrollHeight > el.clientHeight + 8);
        }
    }, [step]);

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
            <div className="h-full flex flex-col items-center justify-center gap-0.5 text-indigo-400 relative">
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
                    className="text-center flex flex-col items-center animate-in fade-in slide-in-from-bottom-1 duration-300 px-6 overflow-hidden flex-1 min-h-0 relative"
                >
                    <div className="flex items-center gap-1.5 opacity-60 mb-0.5 flex-none">
                        <Lightbulb size={10} className="text-amber-400 fill-amber-400/20" />
                        <p className="text-2xs font-bold">{t('fine.workbench.help')}</p>
                    </div>
                    <div ref={textRef} className="overflow-y-auto custom-scrollbar flex-1 min-h-0">
                        <p className="text-base font-semibold leading-snug italic text-indigo-600/80 [hyphens:manual]">
                            {hyphenate(tips[step])}
                        </p>
                    </div>
                    {hasOverflow && <ScrollIndicator />}
                    <div className="flex gap-1 mt-0.5 justify-center flex-none">
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
        <div className="flex flex-col items-center justify-center h-full text-center text-indigo-400 py-1 relative group-hover:opacity-100 transition-opacity">
            <button
                type="button"
                onClick={prevTip}
                className="absolute left-1 top-1/2 -translate-y-1/2 p-1.5 text-indigo-300 hover:text-indigo-600 hover:bg-indigo-100/80 rounded-full transition-all opacity-0 group-hover:opacity-100"
                aria-label="Previous tip"
            >
                <ChevronLeft size={20} />
            </button>

            <div className="flex flex-col items-center gap-2 px-6 animate-in fade-in duration-300 overflow-hidden flex-1 min-h-0 relative">
                <div className="p-1.5 bg-amber-50 rounded-full text-amber-500 relative flex-none">
                    <Lightbulb size={20} strokeWidth={1.5} className="fill-amber-500/10" />
                </div>
                <div
                    ref={textRef}
                    className="overflow-y-auto custom-scrollbar flex-1 min-h-0 w-full"
                >
                    <p className="text-base font-medium leading-snug italic text-indigo-600/70 text-center [hyphens:manual]">
                        {hyphenate(tips[step])}
                    </p>
                </div>
                {hasOverflow && <ScrollIndicator />}
                <div className="flex gap-1.5 mt-1 flex-none">
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
