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

import { ArrowRight, MessageSquareText, Scale, Target, User, Zap } from 'lucide-react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import Markdown from 'react-markdown';
import { useNavigate, useParams } from 'react-router-dom';
import SortingAnimation from '../components/SortingAnimation';
import { useConfigStore } from '../store/useConfigStore';
import { useResponseStore } from '../store/useResponseStore';
import { useSessionStore } from '../store/useSessionStore';
import { cn } from '@/lib/utils';

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

            // Desired height for 2.0 scale is approx 360px (margin included)
            // Base visual height of component content at scale 1 is ~180px.
            const targetHeight = 360;
            const targetWidth = 320;

            // Calculate max scale allowed by height
            // We multiply by 2.0 because targetHeight assumes scale 2.0
            const heightScale = Math.min(2.0, (height / targetHeight) * 2.0);
            const widthScale = Math.min(2.0, (width / targetWidth) * 2.0);

            // Use the smaller of constraints, but don't go below 0.5 (readability)
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

    const steps = [
        {
            key: 'profile',
            icon: <User size={20} className="text-blue-600" />,
            title: t('welcome.steps.profile.title'),
            description: t('welcome.steps.profile.description'),
        },
        {
            key: 'rough',
            icon: <Zap size={20} className="text-amber-500 fill-amber-100" />,
            title: t('welcome.steps.rough.title'),
            description: t('welcome.steps.rough.description'),
        },
        {
            key: 'fine',
            icon: <Scale size={20} className="text-emerald-600" />,
            title: t('welcome.steps.fine.title'),
            description: t('welcome.steps.fine.description'),
        },
        {
            key: 'post',
            icon: <MessageSquareText size={20} className="text-purple-600" />,
            title: t('welcome.steps.post.title'),
            description: t('welcome.steps.post.description'),
        },
    ];

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
                    </div>
                )}
            </div>

            {/* 2. Process Section (The "How") */}
            <div className="bg-white rounded-2xl shadow-md border border-slate-200 overflow-hidden mb-8">
                <div className="grid md:grid-cols-12 divide-y md:divide-y-0 md:divide-x divide-slate-200">
                    {/* Instructions Column */}
                    <div
                        className="md:col-span-7 p-8 md:px-10 md:pt-10 md:pb-6 flex flex-col justify-start"
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
                            {t('welcome.instructions_label', 'Instructions')}
                        </div>

                        {study.instructions ? (
                            <div className="prose prose-blue prose-base max-w-none text-slate-800 font-medium rec-steps">
                                <Markdown
                                    components={{
                                        ol: ({ node: _node, ...props }) => (
                                            <ol className="space-y-5" {...props} />
                                        ),
                                        li: ({ node: _node, ...props }) => (
                                            <li className="flex gap-4 items-start group">
                                                <span
                                                    className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm border transition-all duration-300 shadow-sm mt-0.5 step-badge group-hover:text-white"
                                                    style={
                                                        {
                                                            backgroundColor:
                                                                'color-mix(in srgb, var(--brand-accent), transparent 90%)',
                                                            color: 'var(--brand-accent)',
                                                            borderColor:
                                                                'color-mix(in srgb, var(--brand-accent), transparent 80%)',
                                                            '--hover-bg': 'var(--brand-accent)',
                                                            // biome-ignore lint/suspicious/noExplicitAny: style override
                                                        } as any
                                                    }
                                                >
                                                    {/* Number injected via CSS */}
                                                </span>
                                                <div className="pt-1 text-slate-600 group-hover:text-slate-900 transition-colors leading-relaxed">
                                                    {props.children}
                                                </div>
                                            </li>
                                        ),
                                        strong: ({ node: _node, ...props }) => (
                                            <strong
                                                className="text-slate-900 font-bold"
                                                {...props}
                                            />
                                        ),
                                    }}
                                >
                                    {study.instructions}
                                </Markdown>
                                <style>{`
                                .rec-steps ol { counter-reset: step-counter; list-style: none; padding: 0; margin: 0; }
                                .rec-steps li { counter-increment: step-counter; padding: 0; margin: 0; }
                                .rec-steps .step-badge::before { content: counter(step-counter); }
                            `}</style>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-6 mt-2">
                                {steps.map((step, _index) => (
                                    <div key={step.key} className="flex gap-4 items-start group">
                                        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-white border border-slate-200 shadow-sm flex items-center justify-center group-hover:border-blue-300 group-hover:shadow-md transition-all duration-300">
                                            {step.icon}
                                        </div>
                                        <div className="pt-0.5">
                                            <h4 className="text-slate-900 font-bold text-lg leading-tight mb-1 group-hover:text-blue-700 transition-colors">
                                                {step.title}
                                            </h4>
                                            <p className="text-slate-600 leading-relaxed text-[0.95rem]">
                                                {step.description}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Visual Column */}
                    <div className="md:col-span-5 p-8 md:p-12 bg-slate-100 flex flex-col items-start min-h-[350px] md:min-h-[500px] relative overflow-hidden">
                        <div className="absolute top-4 left-6 z-20 uppercase tracking-wider text-xs font-bold text-slate-600 bg-slate-200/80 backdrop-blur-sm w-fit px-3 py-1.5 rounded-md border border-slate-300 shadow-sm">
                            {t('welcome.preview_title', "It's child's play!")}
                        </div>

                        <div
                            ref={containerRef}
                            data-testid="animation-container"
                            className="w-full flex-1 flex flex-col items-center justify-center relative min-h-[300px]"
                        >
                            {/* Anchor Shape */}
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-slate-200/50 rounded-full blur-2xl opacity-60 pointer-events-none" />

                            {/* Animation */}
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

            {/* Reset Session Link - Only if session in progress */}
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
