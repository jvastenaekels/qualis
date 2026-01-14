/*
 * Open-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

/**
 * Study Layout
 *
 * Wraps the entire study flow (Welcome -> Presort -> Rough -> Fine -> Post).
 * Manages the top navigation bar, step progress, and locale switching.
 */

import { Check, ChevronDown, Globe } from 'lucide-react';
import type { PartnerLogo } from '@/api/model';
import type { StudyConfig } from '@/schemas/study';
import type React from 'react';
import { useEffect, useRef, useState, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Navigate,
    Outlet,
    useLocation,
    useNavigate,
    useParams,
    useLoaderData,
} from 'react-router-dom';
import { ApiError } from '../api/client';
import ErrorBoundary from '../components/ErrorBoundary';
import { LayoutProvider } from '../contexts/LayoutContext';
import { useLayoutState } from '../hooks/useLayout';
import { useStudyConfig } from '../hooks/useStudyConfig';
import i18n from '../i18n';
import ErrorPage from '../pages/ErrorPage';
import type { StudyStatusType } from '../pages/StudyStatusPage';
import StudyStatusPage from '../pages/StudyStatusPage';
import { useConfigStore } from '../store/useConfigStore';
import { useSessionStore } from '../store/useSessionStore';
import { StudyAccessGate } from '../components/study/StudyAccessGate';
import HelpOverlay from '../components/study/HelpOverlay';

const steps = [
    { id: 1, labelKey: 'layout.steps.welcome' },
    { id: 2, labelKey: 'welcome.steps.profile.title' },
    { id: 3, labelKey: 'welcome.steps.rough.title' },
    { id: 4, labelKey: 'welcome.steps.fine.title' },
    { id: 5, labelKey: 'welcome.steps.post.title' },
];

const StudyLayoutContent: React.FC = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { slug } = useParams<{ slug: string }>();

    const config = useConfigStore((state) => state.config);
    const configLoading = useConfigStore((state) => state.isLoading);
    const configError = useConfigStore((state) => state.error);
    const setConfig = useConfigStore((state) => state.setConfig);

    // session selectors
    const maxReachedStep = useSessionStore((state) => state.maxReachedStep);
    const currentStep = useSessionStore((state) => state.currentStep);
    const isCompleted = useSessionStore((state) => state.isCompleted);
    const hasConsented = useSessionStore((state) => state.hasConsented);
    const sessionLanguage = useSessionStore((state) => state.language);
    const isPilotMode = useSessionStore((state) => state.isPilotMode);

    const location = useLocation();
    const { headerAction } = useLayoutState();
    const [isLangMenuOpen, setIsLangMenuOpen] = useState(false);
    const [isStepMenuOpen, setIsStepMenuOpen] = useState(false);
    const langMenuRef = useRef<HTMLDivElement>(null);
    const stepMenuRef = useRef<HTMLDivElement>(null);

    const handleStepClick = (stepId: number) => {
        if (stepId > maxReachedStep) return;

        // Skip presort if disabled
        if (
            stepId === 2 &&
            config?.presort_config &&
            'enabled' in config.presort_config &&
            config.presort_config.enabled === false
        ) {
            return;
        }

        const routes: Record<number, string> = {
            1: 'welcome',
            2: 'presort',
            3: 'rough-sort',
            4: 'fine-sort',
            5: 'post-sort',
        };

        const route = routes[stepId];
        if (route) {
            navigate(`/study/${slug}/${route}${location.search}`);
        }
    };

    // Trigger config fetch/re-fetch on slug or language change
    const { retry, unlock, passwordError } = useStudyConfig();

    // Close menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (langMenuRef.current && !langMenuRef.current.contains(event.target as Node)) {
                setIsLangMenuOpen(false);
            }
            if (stepMenuRef.current && !stepMenuRef.current.contains(event.target as Node)) {
                setIsStepMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    // Sync i18n with Store (Persistence Source of Truth) - Atomic update with config
    useEffect(() => {
        if (sessionLanguage && sessionLanguage !== i18n.language && !configLoading) {
            i18n.changeLanguage(sessionLanguage);
        }
    }, [sessionLanguage, configLoading]);

    const changeLanguage = (lng: string) => {
        // Sync store (this will trigger config refetch)
        useSessionStore.getState().setLanguage(lng);
        setIsLangMenuOpen(false);
    };

    // --- RR7 Loader Data ---
    // This component uses `useLoaderData` to hydrate the config store.
    // In tests, we mock `useLoaderData` (see setupTests.ts) to avoid "Data Router" errors.
    const { study } = useLoaderData() as { study: StudyConfig };

    // Sync loader data to config store
    useEffect(() => {
        console.log('[StudyLayout] Loader data type:', typeof study, Array.isArray(study));
        console.log('[StudyLayout] Loader data keys:', study ? Object.keys(study) : 'null');
        if (study) {
            console.log('[StudyLayout] Setting config', study);
            setConfig(study);
        } else {
            console.error('[StudyLayout] Loader data is falsy!');
        }
    }, [study, setConfig]);

    useEffect(() => {
        console.log('[StudyLayout] ConfigStore:', config);
    }, [config]);

    // Full Page Error State (if we have no config at all)
    if (configError && !config) {
        // Special Case: Study Not Found (404) -> Custom User Friendly Page
        if (configError === 'common.errors.not_found') {
            return <StudyStatusPage type="not_found" />;
        }
        // ... (truncated for brevity, keep existing logic)
        // Map known error keys to ApiErrors for better UI
        let errorObj: Error | ApiError | null = null;

        if (configError === 'common.errors.rate_limited') {
            errorObj = new ApiError(429, 'Too many requests');
        } else if (configError === 'common.errors.network') {
            errorObj = new Error('Network error');
        }

        return (
            <ErrorPage
                error={errorObj}
                title={!errorObj ? t('common.error') : undefined}
                message={!errorObj ? t(configError) : undefined}
                onRetry={retry}
            />
        );
    }

    // Hard Loading State (Initial Fetch)
    if (!config && configLoading) {
        return (
            <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-8 space-y-6">
                <div
                    data-testid="loading-spinner"
                    className="w-16 h-16 border-4 border-t-transparent rounded-full animate-spin"
                    style={{
                        borderColor: 'var(--brand-accent)',
                        borderTopColor: 'transparent',
                    }}
                ></div>
                <div className="space-y-2 text-center animate-pulse">
                    <p className="text-slate-500 font-bold text-xl">{t('common.loading')}</p>
                    <p className="text-slate-400 text-sm">{t('layout.preparing')}</p>
                </div>
                <div className="w-full max-w-md space-y-3 pt-8">
                    <div className="h-4 bg-slate-200 rounded w-3/4 mx-auto animate-pulse"></div>
                    <div className="h-4 bg-slate-200 rounded w-1/2 mx-auto animate-pulse"></div>
                </div>
            </div>
        );
    }

    // Study State Check (Draft, Paused, Closed)
    // Pilot mode allows viewing regardless of study state
    const isPilotModePersistent =
        isPilotMode ||
        new URLSearchParams(location.search).get('mode') === 'test' ||
        sessionStorage.getItem('open-q-pilot-mode') === 'true';

    if (!isPilotModePersistent && config?.state && config.state !== 'active') {
        return <StudyStatusPage type={config.state as StudyStatusType} onRetry={retry} />;
    }

    // Password Protection Gate
    if (config?.requires_password) {
        return (
            <StudyAccessGate
                title={config.title}
                description={config.description || ''}
                onUnlock={unlock}
                isLoading={configLoading}
                error={passwordError ? 'Incorrect password' : null}
            />
        );
    }

    // Basic Protection Check
    const protectedPaths = ['/presort', '/rough-sort', '/fine-sort', '/post-sort'];
    const isProtected = protectedPaths.some((path) => location.pathname.includes(path));

    if (isProtected && !hasConsented) {
        return <Navigate to={`/study/${slug}/welcome${location.search}`} replace />;
    }

    // Redirect study base URL to current/welcome step
    const isStudyBase =
        location.pathname === `/study/${slug}` || location.pathname === `/study/${slug}/`;
    if (isStudyBase) {
        const stepRoutes: Record<number, string> = {
            1: 'welcome',
            2: 'presort',
            3: 'rough-sort',
            4: 'fine-sort',
            5: 'post-sort',
        };
        const target = stepRoutes[currentStep] || 'welcome';
        return <Navigate to={`/study/${slug}/${target}${location.search}`} replace />;
    }

    // Enforce One-Time Submission
    // If completed, redirect everything to post-sort (Thank You page)
    if (isCompleted && !location.pathname.includes('post-sort')) {
        return <Navigate to={`/study/${slug}/post-sort${location.search}`} replace />;
    }

    // Determine if we should show the mobile footer (only if headerAction exists)
    // This effectively acts as the bottom bar for mobile when an action is present
    const showMobileFooter = !!headerAction;

    const branding = config?.branding;
    const accentColor = branding?.accent_color || '#2563eb'; // Default to blue-600

    // Filter steps based on config
    const isPresortDisabled =
        config?.presort_config &&
        'enabled' in config.presort_config &&
        config.presort_config.enabled === false;

    const visibleSteps = steps.filter((step) => !(step.id === 2 && isPresortDisabled));

    const currentVisibleIndex = visibleSteps.findIndex((s) => s.id === currentStep);

    return (
        <div
            className="min-h-screen bg-gray-50 flex flex-col overflow-hidden"
            style={{ '--brand-accent': accentColor } as React.CSSProperties}
        >
            {/* Pilot Mode Banner */}
            {isPilotModePersistent && (
                <div className="bg-amber-100 border-b border-amber-200 px-4 py-1.5 flex items-center justify-center gap-2 text-amber-900 text-[11px] font-bold uppercase tracking-wider relative z-[60] shrink-0 shadow-sm animate-in fade-in slide-in-from-top-full duration-500">
                    <span className="flex h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                    {t('layout.pilot_mode')}
                </div>
            )}
            {/* Header */}
            <header
                data-testid="layout-header"
                className="px-6 h-16 border-b border-slate-200 bg-white sticky top-0 z-50 flex items-center justify-between relative shadow-sm"
            >
                {/* Subtle Loading Line (Background Re-validation) */}
                {configLoading && (
                    <div className="absolute top-0 left-0 w-full h-[2px] bg-[var(--brand-accent)]/20 overflow-hidden">
                        <div className="h-full bg-[var(--brand-accent)] w-1/3 animate-loading-line" />
                    </div>
                )}

                {/* Mobile Progress Bar (Top Edge) */}
                <div className="md:hidden absolute top-0 left-0 w-full h-1 bg-slate-100">
                    <div
                        className="h-full bg-[var(--brand-accent)] transition-all duration-300 ease-in-out"
                        style={{
                            width: `${((currentVisibleIndex + 1) / visibleSteps.length) * 100}%`,
                        }}
                    />
                </div>

                {/* LEFT: Branding / Context */}
                <div className="flex items-center gap-3 min-w-0">
                    <div className="font-semibold text-slate-800 text-lg truncate max-w-[200px] md:max-w-md">
                        {/* Use custom logo if available, or logo if on step 1, else config title */}
                        {/* Show Main Logo if available */}
                        {branding?.logo_url && (
                            <img
                                src={branding.logo_url}
                                alt={config?.title || t('layout.default_study_title')}
                                className="h-8 w-auto object-contain mr-4"
                            />
                        )}

                        {/* Show Partner Logos */}
                        {Array.isArray(branding?.partners) && branding.partners.length > 0 && (
                            <div className="flex items-center gap-4 border-l border-slate-200 pl-4">
                                {branding.partners.map(
                                    (partner: PartnerLogo) =>
                                        partner.logo_url && (
                                            <img
                                                key={partner.id || partner.logo_url}
                                                src={partner.logo_url}
                                                alt={partner.name || ''}
                                                title={partner.name || ''}
                                                className="h-6 w-auto object-contain opacity-80"
                                            />
                                        )
                                )}
                            </div>
                        )}

                        {/* Fallback to Title if no logos */}
                        {!branding?.logo_url &&
                            !(branding?.partners && branding.partners.length > 0) &&
                            (currentStep === 1 ? (
                                <img
                                    src="/open-q-logo.svg"
                                    alt={t('layout.title')}
                                    className="h-8 w-auto object-contain"
                                />
                            ) : (
                                config?.title || t('layout.default_study_title')
                            ))}
                    </div>

                    {/* Mobile Step Counter & Menu */}
                    <div className="md:hidden relative" ref={stepMenuRef}>
                        <button
                            type="button"
                            onClick={() => setIsStepMenuOpen(!isStepMenuOpen)}
                            style={{
                                backgroundColor: isStepMenuOpen ? 'var(--brand-accent)' : undefined,
                                color: isStepMenuOpen ? 'white' : undefined,
                            }}
                            className={`
                                text-xs font-bold px-3 py-1 rounded-full whitespace-nowrap transition-all flex items-center gap-1.5
                                ${!isStepMenuOpen ? 'text-slate-500 bg-slate-100 hover:bg-slate-200' : 'shadow-md scale-105'}
                            `}
                        >
                            {t('layout.mobile_step')} {currentVisibleIndex + 1}/
                            {visibleSteps.length}
                            <ChevronDown
                                size={12}
                                className={`transition-transform duration-200 ${isStepMenuOpen ? 'rotate-180' : ''}`}
                            />
                        </button>

                        {/* Mobile Step Selection Menu */}
                        {isStepMenuOpen && (
                            <div className="absolute top-full left-0 mt-2 w-48 bg-white border border-slate-200 rounded-xl shadow-xl z-[60] py-2 animate-in fade-in zoom-in-95 duration-200 origin-top-left">
                                <div className="px-3 py-1 mb-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                    {t('layout.navigation')}
                                </div>
                                {visibleSteps.map((step, index) => {
                                    const isReached = step.id <= maxReachedStep;
                                    const isCurrent = step.id === currentStep;

                                    return (
                                        <button
                                            key={step.id}
                                            type="button"
                                            disabled={!isReached}
                                            onClick={() => {
                                                handleStepClick(step.id);
                                                setIsStepMenuOpen(false);
                                            }}
                                            style={{
                                                backgroundColor: isCurrent
                                                    ? 'color-mix(in srgb, var(--brand-accent), transparent 90%)'
                                                    : undefined,
                                                color: isCurrent
                                                    ? 'var(--brand-accent)'
                                                    : undefined,
                                            }}
                                            className={`
                                                w-full px-3 py-2.5 flex items-center justify-between text-left transition-colors
                                                ${
                                                    isCurrent
                                                        ? 'font-semibold'
                                                        : isReached
                                                          ? 'text-slate-700 hover:bg-slate-50 active:bg-slate-100'
                                                          : 'text-slate-400 cursor-not-allowed pointer-events-none opacity-60'
                                                }
                                            `}
                                        >
                                            <span className="text-sm">
                                                {index + 1}. {t(step.labelKey)}
                                            </span>
                                            {isReached && !isCurrent && currentStep > step.id && (
                                                <Check
                                                    size={14}
                                                    style={{ color: 'var(--brand-accent)' }}
                                                />
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                {/* CENTER: Stepper (Desktop Only) */}
                <div className="hidden md:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 items-center">
                    <div data-testid="stepper-container" className="flex items-center gap-1">
                        {visibleSteps.map((step, index) => {
                            const status =
                                currentStep === step.id
                                    ? 'current'
                                    : currentStep > step.id
                                      ? 'completed'
                                      : 'upcoming';

                            const isReachable = step.id <= maxReachedStep;

                            return (
                                <div key={step.id} className="flex items-center">
                                    {/* Connection Line */}
                                    {index > 0 && (
                                        <div
                                            className="w-8 h-0.5 mx-2 transition-colors duration-300"
                                            style={{
                                                backgroundColor:
                                                    status === 'upcoming'
                                                        ? '#e2e8f0'
                                                        : 'var(--brand-accent)',
                                            }}
                                        />
                                    )}

                                    {/* Step Node */}
                                    <button
                                        type="button"
                                        onClick={() => handleStepClick(step.id)}
                                        disabled={!isReachable}
                                        style={{
                                            borderColor:
                                                status === 'upcoming'
                                                    ? '#e2e8f0'
                                                    : 'var(--brand-accent)',
                                            backgroundColor:
                                                status === 'completed'
                                                    ? 'var(--brand-accent)'
                                                    : 'white',
                                            color:
                                                status === 'completed'
                                                    ? 'white'
                                                    : 'var(--brand-accent)',
                                            boxShadow:
                                                status === 'current'
                                                    ? '0 0 0 4px color-mix(in srgb, var(--brand-accent), transparent 90%)'
                                                    : undefined,
                                        }}
                                        className={`
                                           w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all duration-300
                                           ${
                                               status === 'upcoming' && !isReachable
                                                   ? 'bg-slate-50 text-slate-300 cursor-not-allowed pointer-events-none'
                                                   : 'cursor-pointer shadow-sm'
                                           }
                                       `}
                                    >
                                        {status === 'completed' ? (
                                            <Check size={16} strokeWidth={3} />
                                        ) : status === 'current' ? (
                                            <div
                                                className="w-2.5 h-2.5 rounded-full"
                                                style={{ backgroundColor: 'var(--brand-accent)' }}
                                            />
                                        ) : isReachable ? (
                                            <div
                                                className="w-2 h-2 rounded-full"
                                                style={{
                                                    backgroundColor:
                                                        'color-mix(in srgb, var(--brand-accent), transparent 40%)',
                                                }}
                                            />
                                        ) : (
                                            <div className="w-2 h-2 bg-slate-200 rounded-full" />
                                        )}
                                    </button>

                                    {/* Label (Current Only) */}
                                    {status === 'current' && (
                                        <span className="ml-3 font-bold text-slate-800 text-sm whitespace-nowrap animate-in fade-in slide-in-from-left-2">
                                            {t(step.labelKey)}
                                        </span>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* RIGHT: Actions + Language */}
                <div className="flex items-center gap-3">
                    {/* Language Selector (Globe Icon) */}
                    <div className="relative" ref={langMenuRef}>
                        <button
                            type="button"
                            onClick={() => setIsLangMenuOpen(!isLangMenuOpen)}
                            className="p-2 rounded-full hover:bg-slate-100 text-slate-600 transition-colors"
                            title={t('layout.change_lang_title')}
                        >
                            <Globe size={20} />
                        </button>

                        {/* Dropdown (Simplified) */}
                        {isLangMenuOpen && (
                            <div className="absolute right-0 top-full mt-2 w-40 bg-white rounded-lg shadow-xl border border-slate-100 py-1 z-50 animate-in fade-in zoom-in-95">
                                {['en', 'fr', 'fi']
                                    .filter(
                                        (lang) =>
                                            !config?.available_languages ||
                                            config.available_languages.includes(lang)
                                    )
                                    .map((lang) => (
                                        <button
                                            key={lang}
                                            type="button"
                                            onClick={() => changeLanguage(lang)}
                                            style={{
                                                color: i18n.language.startsWith(lang)
                                                    ? 'var(--brand-accent)'
                                                    : undefined,
                                            }}
                                            className={`w-full text-left px-4 py-2 text-sm hover:bg-slate-50 flex items-center justify-between ${i18n.language.startsWith(lang) ? 'font-semibold' : 'text-slate-700'}`}
                                        >
                                            <span className="uppercase">{lang}</span>
                                            {i18n.language.startsWith(lang) && (
                                                <Check
                                                    size={14}
                                                    style={{ color: 'var(--brand-accent)' }}
                                                />
                                            )}
                                        </button>
                                    ))}
                            </div>
                        )}
                    </div>

                    {/* Primary Action (Desktop) */}
                    <div className="hidden md:block">{headerAction}</div>
                </div>
            </header>

            {/* Main Content */}
            <main
                className={`flex-1 w-full mx-auto relative flex flex-col bg-slate-50 custom-scrollbar ${['/rough-sort', '/fine-sort'].some((path) => location.pathname.endsWith(path) && !location.pathname.includes('post-sort')) ? 'overflow-hidden' : 'overflow-y-auto'}`}
            >
                {/* Transition Overlay / Dimming */}
                <div
                    className={`flex-1 min-h-0 flex flex-col transition-opacity duration-300 ${configLoading ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}
                >
                    <ErrorBoundary>
                        <Suspense
                            fallback={
                                <div className="flex-1 flex flex-col items-center justify-center space-y-4">
                                    <div className="w-12 h-12 border-4 border-t-transparent border-indigo-600 rounded-full animate-spin" />
                                    <p className="text-slate-500 font-medium">
                                        {t('layout.loading_content')}
                                    </p>
                                </div>
                            }
                        >
                            <Outlet />
                        </Suspense>
                    </ErrorBoundary>
                </div>
            </main>

            {/* Mobile Footer (Primary Action) */}
            {showMobileFooter && (
                <div className="md:hidden flex-none bg-white border-t border-slate-200 p-4 sticky bottom-0 z-50 pb-safe shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
                    {headerAction}
                </div>
            )}

            {/* Help Overlay (Floating) */}
            <HelpOverlay />
        </div>
    );
};

const StudyLayout: React.FC = () => {
    return (
        <LayoutProvider>
            <StudyLayoutContent />
        </LayoutProvider>
    );
};

export default StudyLayout;
