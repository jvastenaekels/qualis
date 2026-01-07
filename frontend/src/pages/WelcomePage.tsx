/*
 * Open-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

/**
 * Welcome Page
 *
 * Displays the study title, introduction, and instructions to the participant.
 * Acts as the entry point for a study session.
 */

import { ArrowRight, Target } from 'lucide-react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import Markdown from 'react-markdown';
import { useNavigate, useParams } from 'react-router-dom';
import SortingAnimation from '../components/SortingAnimation';
import { useConfigStore } from '../store/useConfigStore';
import { useResponseStore } from '../store/useResponseStore';
import { useSessionStore } from '../store/useSessionStore';
import { cn } from '@/lib/utils';
import { DynamicIcon } from '../components/DynamicIcon';

interface WelcomePageProps {
    highlightKey?: string | null;
}

const WelcomePage: React.FC<WelcomePageProps> = ({ highlightKey }) => {
    const { slug } = useParams();
    const navigate = useNavigate();
    const { t } = useTranslation();

    const config = useConfigStore((state) => state.config);
    const setStep = useSessionStore((state) => state.setStep);

    const hasConsented = useSessionStore((state) => state.hasConsented);
    const maxReachedStep = useSessionStore((state) => state.maxReachedStep);

    // Set Step 1 on mount
    React.useEffect(() => {
        setStep(1);
    }, [setStep]);

    // Dynamic scaling logic for animation
    const containerRef = React.useRef<HTMLDivElement>(null);
    const [scale, setScale] = React.useState(2.0);

    React.useEffect(() => {
        const updateScale = () => {
            if (!containerRef.current) return;
            const { height, width } = containerRef.current.getBoundingClientRect();

            const targetHeight = 360;
            const targetWidth = 320;

            const heightScale = Math.min(2.0, (height / targetHeight) * 2.0);
            const widthScale = Math.min(2.0, (width / targetWidth) * 2.0);

            let newScale = Math.min(heightScale, widthScale);
            newScale = Math.max(0.5, newScale);

            setScale(newScale);
        };

        const observer = new ResizeObserver(updateScale);
        if (containerRef.current) observer.observe(containerRef.current);

        return () => observer.disconnect();
    }, []);

    if (!config) return null;

    const study = config;

    const handleContinue = () => {
        navigate(`/study/${slug}/consent`);
    };

    const steps = study.process_steps || [];

    return (
        <div className="max-w-5xl mx-auto py-6 px-4 animate-in fade-in duration-500">
            {/* 1. Context Section (The "Why") */}
            <div className="text-center max-w-3xl mx-auto mb-8 space-y-6">
                <div>
                    <h1 className="text-4xl font-bold text-gray-900 tracking-tight">
                        {study.title}
                    </h1>
                    {study.subtitle && (
                        <h2 className="text-xl text-slate-600 font-normal mt-3">
                            {study.subtitle}
                        </h2>
                    )}
                </div>

                <p className="text-xl text-gray-800 leading-relaxed font-medium">
                    {study.description}
                </p>

                {/* Objective Frame */}
                {study.objective && (
                    <div className="bg-white border border-slate-200 rounded-xl p-6 max-w-2xl mx-auto mt-8 text-left shadow-md relative overflow-hidden">
                        <div
                            className="absolute top-0 left-0 w-1 h-full"
                            style={{ backgroundColor: 'var(--brand-accent)' }}
                        ></div>
                        <h4 className="text-xs uppercase font-bold text-slate-500 mb-4 tracking-wider flex items-center gap-2">
                            <Target size={16} style={{ color: 'var(--brand-accent)' }} />
                            {t('welcome.objective_label', 'Objective of the study')}
                        </h4>
                        <div className="prose prose-slate prose-base max-w-none text-slate-800 leading-relaxed">
                            <Markdown>{study.objective}</Markdown>
                        </div>

                        {/* Institutional Signature */}
                        {study.branding?.partners && study.branding.partners.length > 0 && (
                            <div className="mt-8 pt-6 border-t border-slate-100">
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">
                                    {t('welcome.conducted_by', 'Conducted by')}
                                </p>
                                <div className="flex flex-wrap gap-6 items-center">
                                    {/* biome-ignore lint/suspicious/noExplicitAny: partner logo data */}
                                    {study.branding.partners.map((partner: any) => (
                                        <a
                                            key={partner.id || partner.logo_url}
                                            href={partner.url || undefined}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className={cn(
                                                'block transition-opacity hover:opacity-80',
                                                !partner.url && 'pointer-events-none'
                                            )}
                                        >
                                            <img
                                                src={partner.logo_url}
                                                alt={partner.name}
                                                title={partner.name}
                                                className="h-8 md:h-10 w-auto object-contain grayscale hover:grayscale-0 transition-all duration-300"
                                            />
                                        </a>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* 2. Process Section (The "How") */}
            <div className="bg-white rounded-2xl shadow-md border border-slate-200 overflow-hidden mb-8">
                <div className="grid md:grid-cols-12 divide-y md:divide-y-0 md:divide-x divide-slate-200">
                    {/* Instructions Column */}
                    <div
                        className="md:col-span-12 lg:col-span-7 p-8 md:px-10 md:pt-10 md:pb-6 flex flex-col justify-start"
                        style={{
                            backgroundColor:
                                'color-mix(in srgb, var(--brand-accent), transparent 95%)',
                        }}
                    >
                        <div
                            className="uppercase tracking-wider text-xs font-bold mb-4 w-fit px-3 py-1.5 rounded-md border"
                            style={{
                                color: 'var(--brand-accent)',
                                backgroundColor:
                                    'color-mix(in srgb, var(--brand-accent), transparent 90%)',
                                borderColor:
                                    'color-mix(in srgb, var(--brand-accent), transparent 80%)',
                            }}
                        >
                            {t('welcome.how_it_works', 'How it works')}
                        </div>

                        {study.instructions && (
                            <div className="prose prose-blue prose-base max-w-none text-slate-800 font-medium mb-4">
                                <Markdown>{study.instructions}</Markdown>
                            </div>
                        )}

                        <div className="flex flex-col gap-8 mt-2">
                            {/* biome-ignore lint/suspicious/noExplicitAny: step data */}
                            {steps.map((step: any, index: number) => (
                                <div
                                    key={step.id || index}
                                    className="flex gap-4 items-start group"
                                >
                                    <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-center group-hover:border-primary/30 group-hover:shadow-md transition-all duration-300">
                                        <DynamicIcon
                                            name={step.icon}
                                            size={24}
                                            className="text-primary"
                                            style={{ color: 'var(--brand-accent)' }}
                                        />
                                    </div>
                                    <div className="pt-0.5">
                                        <h4 className="text-slate-900 font-bold text-lg leading-tight mb-1 group-hover:text-primary transition-colors">
                                            {step.title}
                                        </h4>
                                        <p className="text-slate-600 leading-relaxed text-[0.95rem]">
                                            {step.description}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Visual Column */}
                    <div className="md:col-span-12 lg:col-span-5 p-8 md:p-12 bg-slate-100 flex flex-col items-start min-h-[350px] md:min-h-[500px] relative overflow-hidden">
                        <div className="absolute top-4 left-6 z-20 uppercase tracking-wider text-xs font-bold text-slate-600 bg-slate-200/80 backdrop-blur-sm w-fit px-3 py-1.5 rounded-md border border-slate-300 shadow-sm">
                            {t('welcome.preview_title', "It's child's play!")}
                        </div>

                        <div
                            ref={containerRef}
                            data-testid="animation-container"
                            className="w-full flex-1 flex flex-col items-center justify-center relative min-h-[300px]"
                        >
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-slate-200/50 rounded-full blur-2xl opacity-60 pointer-events-none" />

                            <div className="transform origin-center grayscale-[0.2] contrast-125 z-10 w-full flex justify-center">
                                <SortingAnimation scale={scale} />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex justify-center">
                <button
                    type="button"
                    data-testid="start-btn"
                    onClick={handleContinue}
                    style={{ backgroundColor: 'var(--brand-accent)' }}
                    className={cn(
                        'group w-full sm:w-auto px-10 py-4 text-white rounded-full font-bold text-lg hover:brightness-110 shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all flex items-center justify-center gap-3',
                        highlightKey === 'welcome.start' &&
                            'ring-4 ring-[var(--brand-accent)] ring-offset-2 animate-pulse z-[100] relative shadow-[0_0_20px_color-mix(in_srgb,var(--brand-accent),transparent_50%)]'
                    )}
                >
                    {t('welcome.start', 'Get Started')}
                    <ArrowRight
                        size={20}
                        className="group-hover:translate-x-1 transition-transform"
                    />
                </button>
            </div>

            {(hasConsented || maxReachedStep > 1) && (
                <div className="mt-6 flex justify-center">
                    <button
                        type="button"
                        onClick={() => {
                            if (window.confirm(t('welcome.reset_confirm'))) {
                                useSessionStore.getState().resetSession();
                                useResponseStore.getState().resetResponses();
                                window.location.reload();
                            }
                        }}
                        className="text-sm text-slate-400 hover:text-slate-600 underline decoration-slate-300 underline-offset-4 transition-colors"
                    >
                        {t('welcome.restart', 'Start a new session')}
                    </button>
                </div>
            )}
        </div>
    );
};

export default WelcomePage;
