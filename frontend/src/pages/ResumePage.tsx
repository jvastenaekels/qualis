/**
 * Resume Page
 *
 * Standalone route that restores a participant session from the backend
 * and redirects to the correct study step. Not wrapped in StudyLayout
 * to avoid consent guards and loader dependencies.
 *
 * State and side effects live in `useResumeSession`; this component is a
 * thin renderer.
 */

import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { type ResumeError, useResumeSession } from '../hooks/participant/useResumeSession';

interface ErrorScreen {
    message: string;
    showStudyLink: boolean;
    showRetry: boolean;
}

function useErrorScreens(): Record<ResumeError, ErrorScreen> {
    const { t } = useTranslation();
    return {
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
}

export default function ResumePage() {
    const { t } = useTranslation();
    const { slug, token } = useParams<{ slug: string; token: string }>();
    const { error } = useResumeSession(slug, token);
    const screens = useErrorScreens();

    if (error) {
        const screen = screens[error];
        return (
            <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-8 space-y-6">
                <div className="max-w-md text-center space-y-4">
                    <p className="text-slate-600 text-lg">{screen.message}</p>
                    {screen.showStudyLink && slug && (
                        <Link
                            to={`/study/${slug}/welcome`}
                            className="inline-block px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                        >
                            {t('resume.go_to_study', 'Start a new session')}
                        </Link>
                    )}
                    {screen.showRetry && (
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

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-8 space-y-6">
            <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-slate-500 font-bold text-xl">
                {t('resume.loading', 'Restoring your session...')}
            </p>
        </div>
    );
}
