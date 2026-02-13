/*
 * Libre-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { AlertTriangle, Check, Loader2 } from 'lucide-react';
import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useLayoutAction } from '../hooks/useLayout';
import { useSubmitStudy } from '../hooks/useSubmitStudy';
import { useConfigStore } from '../store/useConfigStore';
import { useResponseStore } from '../store/useResponseStore';
import { useSessionStore } from '../store/useSessionStore';

import { Step1_Feedback } from '../components/postsort/Step1_Feedback';
import { Step2_Questionnaire } from '../components/postsort/Step2_Questionnaire';

interface PostSortPageProps {
    highlightKey?: string | null;
}

const PostSortPage: React.FC<PostSortPageProps> = ({ highlightKey: _highlightKey }) => {
    // Hooks
    const setStep = useSessionStore((state) => state.setStep);
    const session = useSessionStore((state) => ({
        isCompleted: state.isCompleted,
        confirmationCode: state.confirmationCode,
    }));
    const responses = useResponseStore((state) => ({
        qsort: state.qsort,
    }));

    // Step State (Internal to this page's wizard)
    // We default to step 1. If we wanted persistence we could store 'postSortStep' in session store.
    const [wizardStep, setWizardStep] = useState<1 | 2>(1);

    const { setHeaderAction } = useLayoutAction();
    const { t } = useTranslation();
    const navigate = useNavigate();
    const location = useLocation();
    const { slug } = useParams();
    const config = useConfigStore((state) => state.config);

    // API Hook
    const {
        submit,
        isLoading,
        isSuccess: isSubmitSuccess,
        error: submitError,
        confirmationCode: submitConfirmationCode,
    } = useSubmitStudy();

    const isSuccess = isSubmitSuccess || session.isCompleted;
    const finalConfirmationCode = session.confirmationCode || submitConfirmationCode;

    // Ref to prevent the 'started' silent submit from re-firing when submit identity changes
    const startedSentRef = useRef(false);

    // --- Effects ---

    React.useEffect(() => {
        // If already completed, ensure we are technically on step 5 (completed state in main flow)
        setStep(5);
    }, [setStep]);

    React.useEffect(() => {
        setHeaderAction(null);
    }, [setHeaderAction]);

    // Completeness Guard: Ensure qsort is full before allowing post-sort
    React.useEffect(() => {
        if (session.isCompleted) return;

        if (config && responses.qsort.length !== config.statements.length) {
            navigate(`/study/${slug}/fine-sort${location.search}`, { replace: true });
        } else if (!startedSentRef.current) {
            // Send a single silent 'started' status update on first mount
            startedSentRef.current = true;
            const timer = setTimeout(() => {
                submit('started', { silent: true });
            }, 1000);
            return () => clearTimeout(timer);
        }
    }, [
        config,
        responses.qsort.length,
        navigate,
        slug,
        session.isCompleted,
        submit,
        location.search,
    ]);

    // --- Render ---

    if (!config) return null;

    if (isSuccess) {
        return (
            <div className="max-w-xl mx-auto px-4 py-12 sm:py-24 text-center animate-in zoom-in-50 duration-500">
                <div
                    className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 shadow-xl shadow-green-100"
                    style={{
                        backgroundColor: 'color-mix(in srgb, var(--brand-accent), transparent 90%)',
                        color: 'var(--brand-accent)',
                    }}
                >
                    <Check size={40} strokeWidth={3} />
                </div>
                <h1
                    className="text-2xl sm:text-3xl font-bold text-slate-800 mb-4"
                    data-testid="thank-you-message"
                >
                    {t('post.success.title')}
                </h1>
                <p className="text-lg text-slate-600 mb-6 leading-relaxed">
                    {t('post.success.message')}
                </p>
                {finalConfirmationCode && (
                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 inline-block shadow-sm max-w-full">
                        <span className="text-xs font-semibold text-slate-400 block uppercase tracking-widest mb-2">
                            {t('post.success.id_label')}
                        </span>
                        <span className="text-2xl font-mono font-bold text-slate-800 tracking-widest select-all break-all">
                            {finalConfirmationCode}
                        </span>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="max-w-3xl mx-auto px-4 py-8 pb-32 relative">
            {/* Loading Overlay */}
            {isLoading && (
                <div
                    role="status"
                    aria-live="polite"
                    className="absolute inset-0 bg-white/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center min-h-[50vh] rounded-3xl"
                >
                    <div className="animate-spin mb-4 text-[var(--brand-accent)]">
                        <Loader2 size={48} />
                    </div>
                    <p className="text-xl font-semibold text-slate-700 animate-pulse">
                        {t('common.submitting')}
                    </p>
                </div>
            )}

            {/* Submission Error */}
            {submitError && !isLoading && (
                <div
                    role="alert"
                    className="mb-6 p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-3"
                >
                    <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                    <div className="flex-1">
                        <p className="text-sm font-semibold text-red-800">
                            {t('post.submit_error.title', 'Submission failed')}
                        </p>
                        <p className="text-sm text-red-600 mt-1">
                            {t(
                                'post.submit_error.message',
                                'Please check your connection and try again.'
                            )}
                        </p>
                    </div>
                </div>
            )}

            <header className="mb-10 text-center space-y-2">
                {/* Step Indicator */}
                <div className="flex items-center justify-center gap-2 mb-4">
                    <div
                        className={`h-2 rounded-full transition-all duration-300 ${wizardStep >= 1 ? 'w-8 bg-indigo-600' : 'w-2 bg-slate-200'}`}
                    />
                    <div
                        className={`h-2 rounded-full transition-all duration-300 ${wizardStep >= 2 ? 'w-8 bg-indigo-600' : 'w-2 bg-slate-200'}`}
                    />
                </div>

                <h1 className="text-3xl font-bold text-slate-800 tracking-tight">
                    {wizardStep === 1 ? t('post.title') : t('post.step2_title')}
                </h1>
                <p className="text-slate-600 max-w-lg mx-auto leading-relaxed">
                    {wizardStep === 1 ? t('post.description') : t('post.step2_description')}
                </p>
            </header>

            {wizardStep === 1 && (
                <Step1_Feedback
                    onNext={() => {
                        document
                            .getElementById('main-scroll-container')
                            ?.scrollTo({ top: 0, behavior: 'smooth' });
                        setWizardStep(2);
                    }}
                />
            )}

            {wizardStep === 2 && (
                <Step2_Questionnaire
                    onBack={() => {
                        document
                            .getElementById('main-scroll-container')
                            ?.scrollTo({ top: 0, behavior: 'smooth' });
                        setWizardStep(1);
                    }}
                    onSubmit={() => submit()} // Trigger actual submission
                    isLoading={isLoading}
                />
            )}
        </div>
    );
};

export default PostSortPage;
