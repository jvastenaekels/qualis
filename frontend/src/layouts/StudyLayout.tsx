/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

/**
 * Study Layout
 *
 * Wraps the entire study flow (Welcome -> Presort -> Rough -> Fine -> Post).
 * Manages the top navigation bar, step progress, and locale switching.
 */

import {
    Check,
    ChevronDown,
    CloudOff,
    Copy,
    Globe,
    MonitorSmartphone,
    Share2,
    WifiOff,
} from 'lucide-react';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import type { PartnerLogo } from '@/api/model';
import type { StudyConfig } from '@/schemas/study';
import type React from 'react';
import { useCallback, useEffect, useRef, useState, Suspense } from 'react';
import { toast } from 'sonner';
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
import { STEP_ROUTES } from '../constants/stepRoutes';
import { LayoutProvider } from '../contexts/LayoutContext';
import { useLayoutState } from '../hooks/useLayout';
import { useStudyConfig } from '../hooks/useStudyConfig';
import { useDraftAutoSave } from '../hooks/study/useDraftAutoSave';
import { useMenuClickOutside } from '../hooks/study/useMenuClickOutside';
import { useProgressReporter } from '../hooks/study/useProgressReporter';
import { useStudyLocaleSync } from '../hooks/study/useStudyLocaleSync';
import i18n from '../i18n';
import ErrorPage from '../pages/ErrorPage';
import type { StudyStatusType } from '../pages/StudyStatusPage';
import { Footer } from '@/components/Footer';
import StudyStatusPage from '../pages/StudyStatusPage';
import { useConfigStore } from '../store/useConfigStore';
import { useSessionStore } from '../store/useSessionStore';
import { StudyAccessGate } from '../components/study/StudyAccessGate';
import HelpOverlay from '../components/study/HelpOverlay';
import { ComponentErrorBoundary } from '../components/ComponentErrorBoundary';
import { resetAllStores } from '../utils/sessionReset';
import { isPresortEnabled, isRoughSortEnabled } from '../utils/studyConfig';

const steps = [
    { id: 1, labelKey: 'layout.steps.welcome', processStepId: null },
    { id: 2, labelKey: 'welcome.steps.profile.title', processStepId: 'profile' },
    { id: 3, labelKey: 'welcome.steps.rough.title', processStepId: 'rough' },
    { id: 4, labelKey: 'welcome.steps.fine.title', processStepId: 'fine' },
    { id: 5, labelKey: 'welcome.steps.post.title', processStepId: 'post' },
] as const;

// Hook-driven layout: side effects (progress reporting, draft auto-save,
// locale sync, click-outside) live in dedicated hooks under
// `frontend/src/hooks/study/`. The residual cognitive complexity is in the
// JSX shell — early-return waterfall (config loading / errors / status / gate /
// stale-session) plus the desktop stepper render. This matches the
// documented exception in CLAUDE.md (precedent: AnalysisPage,
// StudyDesignPage, RecruitmentPage, ConcourseDetailPage).
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: JSX shell of a hook-driven layout
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
    const studySlug = useSessionStore((state) => state.studySlug);
    const hasConsented = useSessionStore((state) => state.hasConsented);
    const sessionLanguage = useSessionStore((state) => state.language);
    const isPilotMode = useSessionStore((state) => state.isPilotMode);

    // Fire-and-forget step-progress reporting + debounced draft auto-save.
    useProgressReporter(slug);
    const { draftSaveStatus } = useDraftAutoSave(slug);

    const location = useLocation();
    const { headerAction } = useLayoutState();
    const [isLangMenuOpen, setIsLangMenuOpen] = useState(false);
    const [isStepMenuOpen, setIsStepMenuOpen] = useState(false);
    const [isResumeMenuOpen, setIsResumeMenuOpen] = useState(false);
    const [linkCopied, setLinkCopied] = useState(false);
    const langMenuRef = useRef<HTMLDivElement>(null);
    const stepMenuRef = useRef<HTMLDivElement>(null);
    const resumeMenuRef = useRef<HTMLDivElement>(null);
    const resumeButtonRef = useRef<HTMLButtonElement>(null);
    const resumeInputRef = useRef<HTMLInputElement>(null);
    const resumeCode = useSessionStore((state) => state.resumeCode);

    const { copyTimeoutRef } = useMenuClickOutside({
        langMenuRef,
        stepMenuRef,
        resumeMenuRef,
        resumeButtonRef,
        setIsLangMenuOpen,
        setIsStepMenuOpen,
        setIsResumeMenuOpen,
        setLinkCopied,
    });

    // Network Status
    const { isOnline } = useNetworkStatus();

    const handleStepClick = (stepId: number) => {
        if (stepId > maxReachedStep) return;

        // Skip presort if disabled
        if (stepId === 2 && !isPresortEnabled(config)) {
            return;
        }

        // Skip rough-sort if disabled
        if (stepId === 3 && !isRoughSortEnabled(config)) {
            return;
        }

        const route = STEP_ROUTES[stepId];
        if (route) {
            navigate(`/study/${slug}/${route}${location.search}`);
        }
    };

    // Trigger config fetch/re-fetch on slug or language change
    const { retry, unlock, passwordError } = useStudyConfig();

    // Cross-study session cleanup
    // If the stored session was completed for a DIFFERENT study (or a legacy session with
    // unknown slug), reset it so the participant can start fresh in this study.
    // Their submitted data is safe on the backend — only the local state is cleared.
    useEffect(() => {
        if (slug && isCompleted && studySlug !== slug) {
            resetAllStores({ skipConfig: true });
        }
    }, [slug, isCompleted, studySlug]);

    // copyTimeoutRef and resumeButtonRef are stable refs; setters are stable too.
    // biome-ignore lint/correctness/useExhaustiveDependencies: stable refs/setters
    const closeResumeMenu = useCallback(() => {
        setIsResumeMenuOpen(false);
        setLinkCopied(false);
        if (copyTimeoutRef.current) {
            clearTimeout(copyTimeoutRef.current);
            copyTimeoutRef.current = null;
        }
        resumeButtonRef.current?.focus();
    }, []);

    // URL ?lang= override + i18n + <html lang> + browser title + welcome-back toast.
    useStudyLocaleSync({
        config,
        sessionLanguage,
        hasConsented,
        isCompleted,
        isPilotMode,
        maxReachedStep,
    });

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
        if (study && !isPilotMode) {
            setConfig(study);
        }
    }, [study, setConfig, isPilotMode]);

    const mainRef = useRef<HTMLElement>(null);

    // Scroll to top on route change
    useEffect(() => {
        if (
            location.pathname &&
            mainRef.current &&
            typeof mainRef.current.scrollTo === 'function'
        ) {
            mainRef.current.scrollTo({ top: 0, behavior: 'instant' });
        }
    }, [location.pathname]);

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

    // Study State Check (Draft, Paused, Closed)
    // Pilot mode allows viewing regardless of study state
    const isPilotModePersistent =
        isPilotMode ||
        new URLSearchParams(location.search).get('mode') === 'test' ||
        sessionStorage.getItem('qualis-pilot-mode') === 'true';

    // Hard Loading State (Initial Fetch)
    // In pilot mode, treat missing config as loading to prevent flash of raw keys
    if ((!config && configLoading) || (isPilotModePersistent && !config)) {
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

    // Show loading while the stale session is being reset to prevent flash of stale content
    const isStaleCompletedSession = isCompleted && studySlug !== slug; // covers both null (legacy) and mismatched slugs
    if (isStaleCompletedSession) {
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
            </div>
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
        const target = STEP_ROUTES[maxReachedStep] || 'welcome';
        return <Navigate to={`/study/${slug}/${target}${location.search}`} replace />;
    }

    // Enforce One-Time Submission
    // If completed for THIS specific study, redirect everything to post-sort (Thank You page).
    if (isCompleted && studySlug === slug && !location.pathname.includes('post-sort')) {
        return <Navigate to={`/study/${slug}/post-sort${location.search}`} replace />;
    }

    // Determine if we should show the mobile footer (only if headerAction exists)
    // This effectively acts as the bottom bar for mobile when an action is present
    const showMobileFooter = !!headerAction;

    const branding = config?.branding;
    const accentColor = branding?.accent_color || '#2563eb'; // Default to blue-600

    // Filter steps based on config: drop presort if disabled, drop rough if disabled.
    const visibleSteps = steps.filter((step) => {
        if (step.id === 2 && !isPresortEnabled(config)) return false;
        if (step.id === 3 && !isRoughSortEnabled(config)) return false;
        return true;
    });

    const currentVisibleIndex = visibleSteps.findIndex((s) => s.id === currentStep);

    // The two immersive Q-sort screens need <main> locked to the viewport so
    // GridSort's h-full children resolve. Everywhere else, let main scroll
    // naturally so the entry footer scrolls with content instead of being
    // pinned to the bottom of the viewport.
    const isImmersiveSort = ['/rough-sort', '/fine-sort'].some(
        (path) => location.pathname.endsWith(path) && !location.pathname.includes('post-sort')
    );
    const isEntryPage = ['/welcome', '/consent'].some((path) => location.pathname.endsWith(path));

    return (
        <div
            className="h-[100dvh] bg-gray-50 flex flex-col overflow-hidden"
            style={{ '--brand-accent': accentColor } as React.CSSProperties}
        >
            {/* Pilot Mode Banner */}
            {isPilotModePersistent && (
                <div className="bg-amber-100 border-b border-amber-200 px-4 py-1.5 flex items-center justify-center gap-2 text-amber-900 text-xs font-bold relative z-[60] shrink-0 shadow-sm animate-in fade-in slide-in-from-top-full duration-500">
                    <span className="flex h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                    {t('layout.pilot_mode')}
                </div>
            )}

            {/* Offline Status Banner */}
            {!isOnline && (
                <div className="bg-slate-800 text-white px-4 py-2 flex items-center justify-center gap-2 text-sm font-medium sticky top-0 z-[70] shadow-md animate-in fade-in slide-in-from-top duration-300">
                    <WifiOff size={16} className="animate-pulse" />
                    <span>
                        {t(
                            'common.status.offline',
                            'You are offline. Changes are queued and will sync when reconnected.'
                        )}
                    </span>
                </div>
            )}
            {/* Header */}
            <header
                data-testid="layout-header"
                className="px-6 h-16 border-b border-slate-200 bg-white sticky top-0 z-header flex items-center justify-between relative shadow-sm"
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
                <div className="flex items-center gap-3 min-w-0 shrink-0 z-10">
                    <div className="font-semibold text-slate-800 text-lg truncate max-w-[200px] md:max-w-[160px] lg:max-w-md">
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
                            <div className="hidden lg:flex items-center gap-4 border-l border-slate-200 pl-4">
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
                                    src="/qualis-logo.svg"
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
                                <div className="px-3 py-1 mb-1 text-2xs font-bold text-slate-400">
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
                                                w-full px-3 py-3 flex items-center justify-between text-left transition-colors
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
                                            {isReached && !isCurrent && (
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
                <div className="hidden md:flex flex-1 justify-center items-center min-w-0 mx-4">
                    <div
                        data-testid="stepper-container"
                        className="flex items-center gap-1 lg:gap-2 min-w-0"
                    >
                        {/* biome-ignore lint/complexity/noExcessiveCognitiveComplexity: stepper item rendering — many visual states (current/completed/upcoming/reachable/clickable) interact in JSX */}
                        {visibleSteps.map((step, index) => {
                            const status =
                                currentStep === step.id
                                    ? 'current'
                                    : step.id <= maxReachedStep
                                      ? 'completed'
                                      : 'upcoming';

                            const isReachable = step.id <= maxReachedStep;

                            // Dynamic Title Resolution
                            // Look up the process_step entry by its `id` (e.g. 'fine', 'post')
                            // rather than by array index — when rough_sort_enabled=false the
                            // backend filters the rough entry out, so the remaining indices
                            // would no longer line up with step.id - 2.
                            let stepLabel = t(step.labelKey);
                            if (step.processStepId && config?.process_steps) {
                                const processStep = config.process_steps.find(
                                    (ps) => ps.id === step.processStepId
                                );
                                if (processStep?.title) {
                                    stepLabel = processStep.title;
                                }
                            }

                            return (
                                <div
                                    key={step.id}
                                    className="flex items-center group relative min-w-0"
                                >
                                    {/* Connection Line */}
                                    {index > 0 && (
                                        <div
                                            className="w-4 lg:w-8 h-0.5 mx-1 lg:mx-2 shrink-0 transition-colors duration-300"
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
                                           w-8 h-8 shrink-0 rounded-full flex items-center justify-center border-2 transition-all duration-300 hover:scale-105
                                           ${
                                               status === 'upcoming' && !isReachable
                                                   ? 'bg-slate-50 text-slate-300 cursor-not-allowed pointer-events-none'
                                                   : 'cursor-pointer shadow-sm'
                                           }
                                       `}
                                        title={stepLabel}
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

                                    {/* Label (Always visible but styled) */}
                                    <span
                                        className={`ml-2 text-sm truncate transition-all duration-300 ${
                                            status === 'current'
                                                ? 'font-bold text-slate-800 opacity-100 max-w-[8rem] lg:max-w-[12rem]'
                                                : status === 'completed'
                                                  ? 'font-medium text-slate-500 opacity-100 hidden lg:block max-w-[8rem] xl:max-w-[12rem]'
                                                  : 'font-normal text-slate-500 opacity-100 hidden xl:block max-w-[8rem]'
                                        }`}
                                        title={stepLabel}
                                    >
                                        {stepLabel}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* RIGHT: Actions + Language */}
                <div className="flex items-center gap-2 sm:gap-3 shrink-0 z-10">
                    {/* Auto-save status indicator — always reserves space to prevent layout shift */}
                    {hasConsented && !isCompleted && !isPilotMode && (
                        <span
                            role="status"
                            className={`hidden sm:flex items-center justify-center w-5 transition-opacity duration-300 ${draftSaveStatus === 'idle' ? 'opacity-0' : 'opacity-100'}`}
                            aria-live="polite"
                            aria-label={
                                draftSaveStatus === 'saving'
                                    ? t('resume.saving', 'Saving...')
                                    : draftSaveStatus === 'saved'
                                      ? t('resume.saved', 'Saved')
                                      : draftSaveStatus === 'error'
                                        ? t('resume.save_failed', 'Not saved')
                                        : undefined
                            }
                        >
                            {draftSaveStatus === 'saving' && (
                                <span className="w-3 h-3 border-2 border-slate-300 border-t-transparent rounded-full animate-spin" />
                            )}
                            {draftSaveStatus === 'saved' && (
                                <Check size={14} className="text-emerald-500" />
                            )}
                            {draftSaveStatus === 'error' && (
                                <CloudOff size={14} className="text-slate-400" />
                            )}
                        </span>
                    )}

                    {/* Continue Later (Resume Link) — on welcome/consent, only show if there's real progress to resume */}
                    {hasConsented &&
                        !isCompleted &&
                        !isPilotMode &&
                        resumeCode &&
                        maxReachedStep > 1 && (
                            <div className="relative" ref={resumeMenuRef}>
                                <button
                                    ref={resumeButtonRef}
                                    type="button"
                                    onClick={() => {
                                        if (isResumeMenuOpen) {
                                            closeResumeMenu();
                                        } else {
                                            setIsResumeMenuOpen(true);
                                            setLinkCopied(false);
                                            // Auto-focus input after popover renders
                                            setTimeout(() => resumeInputRef.current?.focus(), 50);
                                        }
                                    }}
                                    className="p-3 min-w-[44px] min-h-[44px] rounded-full hover:bg-blue-50 text-blue-500 transition-colors touch-manipulation"
                                    title={t('resume.continue_later', 'Continue later')}
                                    aria-expanded={isResumeMenuOpen}
                                    aria-haspopup="dialog"
                                >
                                    <MonitorSmartphone size={20} />
                                </button>
                                {isResumeMenuOpen && (
                                    <div
                                        role="dialog"
                                        aria-label={t('resume.continue_later', 'Continue later')}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Escape') closeResumeMenu();
                                        }}
                                        className="absolute right-0 top-full mt-2 w-[calc(100vw-1.5rem)] sm:w-72 max-w-72 bg-white rounded-lg shadow-xl border border-slate-100 p-4 z-popover animate-in fade-in zoom-in-95 space-y-3"
                                    >
                                        <p className="text-sm text-slate-600">
                                            {t(
                                                'resume.instruction_same_browser',
                                                'If you return on this browser, your progress will be saved automatically.'
                                            )}
                                        </p>
                                        <p className="text-sm text-slate-600">
                                            {t(
                                                'resume.instruction',
                                                'To continue on a different device, save this link:'
                                            )}
                                        </p>
                                        <p className="text-xs text-amber-600 bg-amber-50 rounded px-2 py-1">
                                            {t(
                                                'resume.instruction_detail',
                                                'Keep this link private. It gives access to your session.'
                                            )}
                                        </p>
                                        <div className="flex items-center gap-2">
                                            <input
                                                ref={resumeInputRef}
                                                type="text"
                                                readOnly
                                                aria-label={t('resume.resume_url', 'Resume URL')}
                                                value={`${window.location.origin}/study/${slug}/resume/${resumeCode}`}
                                                className="flex-1 text-xs sm:text-sm font-mono bg-slate-50 border border-slate-200 rounded px-2 py-2 text-slate-700 select-all truncate"
                                                onFocus={(e) => e.target.select()}
                                                onClick={(e) =>
                                                    (e.target as HTMLInputElement).select()
                                                }
                                            />
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    navigator.clipboard
                                                        .writeText(
                                                            `${window.location.origin}/study/${slug}/resume/${resumeCode}`
                                                        )
                                                        .then(() => {
                                                            setLinkCopied(true);
                                                            if (copyTimeoutRef.current)
                                                                clearTimeout(
                                                                    copyTimeoutRef.current
                                                                );
                                                            copyTimeoutRef.current = setTimeout(
                                                                () => setLinkCopied(false),
                                                                3000
                                                            );
                                                        })
                                                        .catch(() => {
                                                            toast.error(
                                                                t(
                                                                    'resume.copy_failed',
                                                                    'Unable to copy. Please select the link manually.'
                                                                )
                                                            );
                                                        });
                                                }}
                                                aria-label={
                                                    linkCopied
                                                        ? t('resume.link_copied', 'Link copied!')
                                                        : t('resume.copy_link', 'Copy link')
                                                }
                                                className="shrink-0 flex items-center justify-center p-2 rounded-md transition-colors"
                                                style={{
                                                    backgroundColor: linkCopied
                                                        ? '#10b981'
                                                        : 'var(--brand-accent)',
                                                    color: 'white',
                                                }}
                                            >
                                                {linkCopied ? (
                                                    <Check size={16} />
                                                ) : (
                                                    <Copy size={16} />
                                                )}
                                            </button>
                                        </div>
                                        {typeof navigator.share === 'function' && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    navigator
                                                        .share({
                                                            title: t(
                                                                'resume.share_title',
                                                                'My study session'
                                                            ),
                                                            url: `${window.location.origin}/study/${slug}/resume/${resumeCode}`,
                                                        })
                                                        .catch(() => {
                                                            /* user cancelled share sheet */
                                                        });
                                                }}
                                                className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-slate-600 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-md transition-colors"
                                            >
                                                <Share2 size={14} />
                                                {t('resume.share', 'Send to myself')}
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                    <HelpOverlay />

                    {/* Language Selector (Globe Icon) */}
                    {(!config?.available_languages || config.available_languages.length > 1) && (
                        <div className="relative" ref={langMenuRef}>
                            <button
                                type="button"
                                onClick={() => setIsLangMenuOpen(!isLangMenuOpen)}
                                className="p-3 min-w-[44px] min-h-[44px] rounded-full hover:bg-slate-100 text-slate-600 transition-colors touch-manipulation"
                                title={t('layout.change_lang_title')}
                            >
                                <Globe size={20} />
                            </button>

                            {/* Dropdown (Simplified) */}
                            {isLangMenuOpen && (
                                <div className="absolute right-0 top-full mt-2 w-40 bg-white rounded-lg shadow-xl border border-slate-100 py-1 z-popover animate-in fade-in zoom-in-95">
                                    {(config?.available_languages &&
                                    config.available_languages.length > 0
                                        ? config.available_languages
                                        : ['en']
                                    ).map((lang) => (
                                        <button
                                            key={lang}
                                            type="button"
                                            onClick={() => {
                                                changeLanguage(lang); // Persist and refetch (sync effect handles i18n)
                                            }}
                                            style={{
                                                color: i18n.language?.startsWith(lang)
                                                    ? 'var(--brand-accent)'
                                                    : undefined,
                                            }}
                                            className={`w-full text-left px-4 py-2 text-sm hover:bg-slate-50 flex items-center justify-between ${
                                                i18n.language?.startsWith(lang)
                                                    ? 'font-semibold'
                                                    : 'text-slate-700'
                                            }`}
                                        >
                                            <span className="">{lang}</span>
                                            {i18n.language?.startsWith(lang) && (
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
                    )}

                    {/* Primary Action (Desktop) */}
                    <div className="hidden md:block">{headerAction}</div>
                </div>
            </header>

            {/* Main Content */}
            <main
                id="main-scroll-container"
                ref={mainRef}
                className={`flex-1 w-full mx-auto relative isolate flex flex-col bg-slate-50 custom-scrollbar ${isImmersiveSort ? 'overflow-hidden' : 'overflow-y-auto'}`}
            >
                {/* Transition Overlay / Dimming */}
                <div
                    className={`${isImmersiveSort ? 'flex-1 min-h-0' : 'min-h-full'} flex flex-col transition-opacity duration-300 ${configLoading ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}
                >
                    <ComponentErrorBoundary
                        title="Unable to load study step"
                        onReset={() => window.location.reload()}
                    >
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
                    </ComponentErrorBoundary>
                </div>

                {/* Entry attribution footer — only shown before the task starts.
                    Lives inside <main> so it scrolls with content rather than being pinned
                    to the viewport. min-h-full on the wrapper above pushes it below the fold
                    when content is short. */}
                {isEntryPage && <Footer />}
            </main>

            {/* Mobile Footer (Primary Action) */}
            {showMobileFooter && (
                <div className="md:hidden flex-none bg-white border-t border-slate-200 p-4 sticky bottom-0 z-sticky pb-safe shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
                    {headerAction}
                </div>
            )}
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
