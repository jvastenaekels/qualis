/**
 * Resume Page
 *
 * Standalone route that restores a participant session from the backend
 * and redirects to the correct study step. Not wrapped in StudyLayout
 * to avoid consent guards and loader dependencies.
 */

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import type { ResumeResponse } from '../api/model';
import { customInstance } from '../api/mutator';
import { STEP_ROUTES } from '../constants/stepRoutes';
import { useConfigStore } from '../store/useConfigStore';
import { useSessionStore } from '../store/useSessionStore';
import { initialResponses, useResponseStore } from '../store/useResponseStore';

type ResumeError = 'not_found' | 'study_closed' | 'rate_limited' | 'error';

export default function ResumePage() {
    const { t, i18n } = useTranslation();
    const navigate = useNavigate();
    const { slug, token } = useParams<{ slug: string; token: string }>();
    const [error, setError] = useState<ResumeError | null>(null);

    useEffect(() => {
        if (!slug || !token) {
            setError('not_found');
            return;
        }

        let cancelled = false;

        const restore = async () => {
            try {
                const data = await customInstance<
                    ResumeResponse & { draft_responses: Record<string, unknown> }
                >({
                    url: `/api/study/${slug}/resume/${token}`,
                    method: 'GET',
                });

                if (cancelled) return;

                // Clear pilot-mode flag so stores use normal persistence keys
                try {
                    sessionStorage.removeItem('libre-q-pilot-mode');
                } catch {
                    // Ignore storage errors
                }

                // Reset all stores — including configStore to prevent the slug guard
                // in useStudyConfig from wiping our hydrated session when StudyLayout mounts
                useConfigStore.getState().resetConfig();
                useSessionStore.getState().resetSession();
                useResponseStore.getState().resetResponses();

                // Hydrate session store
                const session = useSessionStore.getState();
                session.setToken(data.session_token);
                session.setStudySlug(slug || '');
                session.setConsent(true);
                session.setStep(data.last_step_reached);
                session.setLanguage(data.language);
                if (data.language) {
                    await i18n.changeLanguage(data.language);
                }
                if (data.resume_code) {
                    session.setResumeCode(data.resume_code);
                }

                // Hydrate response store from draft (with runtime shape validation)
                const draft = data.draft_responses;
                if (draft && typeof draft === 'object' && Object.keys(draft).length > 0) {
                    const isValidPresort =
                        draft.presort &&
                        typeof draft.presort === 'object' &&
                        !Array.isArray(draft.presort);
                    const roughObj = draft.rough as Record<string, unknown> | undefined;
                    const isValidRough =
                        roughObj &&
                        typeof roughObj === 'object' &&
                        Array.isArray(roughObj.agree) &&
                        Array.isArray(roughObj.disagree) &&
                        Array.isArray(roughObj.neutral) &&
                        Array.isArray(roughObj.history);
                    const isValidQsort = Array.isArray(draft.qsort);
                    const isValidPostsort =
                        draft.postsort &&
                        typeof draft.postsort === 'object' &&
                        !Array.isArray(draft.postsort);

                    useResponseStore.setState({
                        presort: isValidPresort
                            ? (draft.presort as typeof initialResponses.presort)
                            : initialResponses.presort,
                        rough: isValidRough
                            ? (draft.rough as typeof initialResponses.rough)
                            : initialResponses.rough,
                        qsort: isValidQsort
                            ? (draft.qsort as typeof initialResponses.qsort)
                            : initialResponses.qsort,
                        postsort: isValidPostsort
                            ? (draft.postsort as typeof initialResponses.postsort)
                            : initialResponses.postsort,
                    });
                }

                // Flag so StudyLayout skips its welcome-back toast (we show our own)
                try {
                    sessionStorage.setItem('libre-q-resumed-via-link', '1');
                } catch {
                    // Ignore storage errors
                }

                // Navigate to the correct step
                const route = STEP_ROUTES[data.last_step_reached] || 'welcome';
                navigate(`/study/${slug}/${route}`, { replace: true });

                // Show welcome-back toast after navigation
                const stepName = STEP_ROUTES[data.last_step_reached];
                if (stepName) {
                    toast.success(
                        i18n.t('resume.restored', 'Welcome back! Your progress has been restored.')
                    );
                }
            } catch (err: unknown) {
                if (cancelled) return;

                const status =
                    err && typeof err === 'object' && 'status' in err
                        ? (err as { status: number }).status
                        : 0;

                if (status === 404) {
                    setError('not_found');
                } else if (status === 410) {
                    // Session already submitted — show the confirmation screen
                    const state = useSessionStore.getState();
                    state.setStudySlug(slug || '');
                    state.setConsent(true);
                    state.completeSession('');
                    navigate(`/study/${slug}/post-sort`, { replace: true });
                    return;
                } else if (status === 403) {
                    setError('study_closed');
                } else if (status === 429) {
                    setError('rate_limited');
                } else {
                    setError('error');
                }
            }
        };

        restore();
        return () => {
            cancelled = true;
        };
    }, [slug, token, navigate, t]);

    if (error) {
        const config: Record<
            ResumeError,
            { message: string; showStudyLink: boolean; showRetry: boolean }
        > = {
            not_found: {
                message: t(
                    'resume.not_found',
                    "This link is no longer valid. If you haven't completed the study, please contact the researcher for a new link."
                ),
                showStudyLink: true,
                showRetry: false,
            },
            study_closed: {
                message: t(
                    'resume.study_closed',
                    'This study is no longer accepting responses. Please contact the researcher if you have questions.'
                ),
                showStudyLink: false,
                showRetry: false,
            },
            rate_limited: {
                message: t(
                    'resume.rate_limited',
                    'Too many attempts. Please wait a moment and try again.'
                ),
                showStudyLink: false,
                showRetry: true,
            },
            error: {
                message: t(
                    'resume.error',
                    'Something went wrong while restoring your session. Please try again.'
                ),
                showStudyLink: true,
                showRetry: true,
            },
        };

        const errorConfig = config[error];

        return (
            <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-8 space-y-6">
                <div className="max-w-md text-center space-y-4">
                    <p className="text-slate-600 text-lg">{errorConfig.message}</p>
                    {errorConfig.showStudyLink && slug && (
                        <Link
                            to={`/study/${slug}/welcome`}
                            className="inline-block px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                        >
                            {t('resume.go_to_study', 'Start a new session')}
                        </Link>
                    )}
                    {errorConfig.showRetry && (
                        <button
                            type="button"
                            onClick={() => window.location.reload()}
                            className="block mx-auto mt-2 text-sm text-slate-500 hover:text-slate-700 underline"
                        >
                            {t('common.retry', 'Retry')}
                        </button>
                    )}
                </div>
            </div>
        );
    }

    // Loading state
    return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-8 space-y-6">
            <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-slate-500 font-bold text-xl">
                {t('resume.loading', 'Restoring your session...')}
            </p>
        </div>
    );
}
