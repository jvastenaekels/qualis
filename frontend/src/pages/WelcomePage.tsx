/*
 * Libre-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
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
import { SafeMarkdown } from '../components/SafeMarkdown';
import { Navigate, useNavigate, useParams, useLocation } from 'react-router-dom';
import SortingAnimation from '../components/SortingAnimation';
import { useConfigStore } from '../store/useConfigStore';
import { useResponseStore } from '../store/useResponseStore';
import { useSessionStore } from '../store/useSessionStore';
import { cn } from '@/lib/utils';
import { DynamicIcon } from '../components/DynamicIcon';
import { DEFAULT_STUDY_CONTENT } from '../constants/studyDefaults';
import { STEP_ROUTES } from '../constants/stepRoutes';

interface WelcomePageProps {
    highlightKey?: string | null;
}

const WelcomePage: React.FC<WelcomePageProps> = ({ highlightKey }) => {
    const { slug } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const { t } = useTranslation();

    const config = useConfigStore((state) => state.config);
    const setStep = useSessionStore((state) => state.setStep);
    const setPilotMode = useSessionStore((state) => state.setPilotMode);
    const isPilotMode = useSessionStore((state) => state.isPilotMode);

    const hasConsented = useSessionStore((state) => state.hasConsented);
    const maxReachedStep = useSessionStore((state) => state.maxReachedStep);

    const isReturningUser = hasConsented && maxReachedStep > 1;

    // Set Step 1 on mount and sync Pilot Mode
    React.useEffect(() => {
        if (!isReturningUser) {
            setStep(1);
        }

        // Pilot Mode Logic: "Running a test run and then a normal run should not contaminate the normal run"
        // We strictly sync the pilot state with the URL presence of 'mode=test' at the entry point (Welcome).
        const params = new URLSearchParams(location.search);
        const isUrlTest = params.get('mode') === 'test';

        if (isUrlTest) {
            if (!isPilotMode) {
                setPilotMode(true);
            }
            if (sessionStorage.getItem('libre-q-pilot-mode') !== 'true') {
                sessionStorage.setItem('libre-q-pilot-mode', 'true');
            }
        } else {
            // If URL does not have mode=test, we ensure we are NOT in pilot mode.
            // This cleans up any leftover state from previous test runs.
            if (isPilotMode) {
                setPilotMode(false);
            }
            if (sessionStorage.getItem('libre-q-pilot-mode')) {
                sessionStorage.removeItem('libre-q-pilot-mode');
            }
        }
    }, [isReturningUser, setStep, setPilotMode, isPilotMode, location.search]);

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

    // Redirect returning users to their latest step
    if (isReturningUser) {
        const target = STEP_ROUTES[maxReachedStep] || 'welcome';
        return <Navigate to={`/study/${slug}/${target}${location.search}`} replace />;
    }

    if (!config) return null;

    const study = config;

    const handleContinue = () => {
        navigate(`/study/${slug}/consent`);
    };

    // biome-ignore lint/suspicious/noExplicitAny: dynamic process steps
    const studyLang = (study as any).language || 'en';
    const defaultSteps =
        DEFAULT_STUDY_CONTENT[studyLang]?.process_steps || DEFAULT_STUDY_CONTENT.en.process_steps;
    // biome-ignore lint/suspicious/noExplicitAny: dynamic process steps
    const rawSteps = (study as any).process_steps;
    const steps = rawSteps && rawSteps.length > 0 ? rawSteps : defaultSteps;

    return (
        <div className="max-w-5xl mx-auto py-6 px-4 animate-in fade-in duration-500">
            {/* 1. Context Section (The "Why") */}
            <div className="text-center max-w-3xl mx-auto mb-8 space-y-6">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-gray-900 tracking-tight">
                        {study.title}
                    </h1>
                    {study.subtitle && (
                        <h2 className="text-lg sm:text-xl text-slate-600 font-normal mt-3">
                            {study.subtitle}
                        </h2>
                    )}
                </div>

                <p className="text-base sm:text-xl text-gray-800 leading-relaxed font-medium">
                    {study.description}
                </p>

                {study.objective && (
                    <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 w-full mx-auto mt-8 text-left shadow-md relative overflow-hidden">
                        <div
                            className="absolute top-0 left-0 w-1 h-full"
                            style={{ backgroundColor: 'var(--brand-accent)' }}
                        ></div>
                        <h2 className="text-xs uppercase font-bold text-slate-500 mb-4 tracking-wider flex items-center gap-2">
                            <Target size={16} style={{ color: 'var(--brand-accent)' }} />
                            {t('welcome.objective_label', 'Objective of the study')}
                        </h2>
                        <div className="prose prose-slate prose-base max-w-none text-slate-800 leading-relaxed">
                            <SafeMarkdown>{study.objective}</SafeMarkdown>
                        </div>

                        {/* biome-ignore lint/suspicious/noExplicitAny: dynamic branding */}
                        {Array.isArray((study.branding as any)?.partners) &&
                            // biome-ignore lint/suspicious/noExplicitAny: dynamic branding
                            (study.branding as any).partners.some((p: any) => !!p.logo_url) && (
                                <div className="mt-10 pt-8 border-t border-slate-200">
                                    <div className="flex flex-wrap gap-8 items-center justify-start">
                                        {/* biome-ignore lint/suspicious/noExplicitAny: partner logo data */}
                                        {(study.branding as any).partners.map(
                                            // biome-ignore lint/suspicious/noExplicitAny: partner data
                                            (partner: any) =>
                                                partner.logo_url && (
                                                    <a
                                                        key={partner.id || partner.logo_url}
                                                        href={partner.url || undefined}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className={cn(
                                                            'block transition-opacity hover:opacity-70',
                                                            !partner.url && 'pointer-events-none'
                                                        )}
                                                    >
                                                        <img
                                                            src={partner.logo_url}
                                                            alt={partner.name || ''}
                                                            title={partner.name || ''}
                                                            className="h-12 md:h-16 w-auto object-contain"
                                                        />
                                                    </a>
                                                )
                                        )}
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
                        className="md:col-span-12 lg:col-span-7 p-4 sm:p-8 md:px-10 md:pt-10 md:pb-6 flex flex-col justify-start"
                        style={{
                            backgroundColor:
                                'color-mix(in srgb, var(--brand-accent), transparent 95%)',
                        }}
                    >
                        <div className="uppercase tracking-wider text-xs font-bold mb-4 w-fit px-3 py-1.5 rounded-md border text-slate-700 bg-slate-50 border-slate-200">
                            {t('welcome.how_it_works', 'How it works')}
                        </div>

                        {study.instructions && (
                            <div className="prose prose-blue prose-base max-w-none text-slate-800 font-medium mb-8">
                                <SafeMarkdown>{study.instructions}</SafeMarkdown>
                            </div>
                        )}

                        <div className="flex flex-col gap-4 sm:gap-8 mt-2">
                            {/* biome-ignore lint/suspicious/noExplicitAny: step data */}
                            {steps.map((step: any, index: number) => (
                                <div
                                    key={step.id || index}
                                    className="flex gap-4 items-start group"
                                >
                                    <div
                                        className="flex-shrink-0 w-12 h-12 rounded-xl border border-slate-200 shadow-sm flex items-center justify-center group-hover:shadow-md transition-all duration-300"
                                        style={{
                                            backgroundColor: step.color
                                                ? `color-mix(in srgb, ${step.color}, transparent 92%)`
                                                : 'white',
                                            borderColor: step.color
                                                ? `color-mix(in srgb, ${step.color}, transparent 80%)`
                                                : undefined,
                                        }}
                                    >
                                        <DynamicIcon
                                            name={step.icon}
                                            size={24}
                                            style={{ color: step.color || 'var(--brand-accent)' }}
                                        />
                                    </div>
                                    <div className="pt-0.5">
                                        <h3
                                            className="text-slate-900 font-bold text-lg leading-tight mb-1 transition-colors"
                                            style={{
                                                color: step.color
                                                    ? `color-mix(in srgb, ${step.color}, black 20%)`
                                                    : undefined,
                                            }}
                                        >
                                            {step.title}
                                        </h3>
                                        <p className="text-slate-600 leading-relaxed text-[0.95rem]">
                                            {step.description}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Visual Column */}
                    <div className="md:col-span-12 lg:col-span-5 p-4 sm:p-8 md:px-10 md:pt-10 md:pb-6 bg-slate-100 flex flex-col items-start min-h-[250px] sm:min-h-[350px] md:min-h-[500px] relative overflow-hidden">
                        <div className="uppercase tracking-wider text-xs font-bold text-slate-600 bg-slate-200/80 backdrop-blur-sm w-fit px-3 py-1.5 rounded-md border border-slate-300 shadow-sm mb-4">
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
                    {config.ui_labels?.['welcome.start'] || t('welcome.start', 'Get Started')}
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
