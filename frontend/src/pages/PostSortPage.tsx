/*
 * Open-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { Check, Loader2 } from 'lucide-react';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
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
    const { slug } = useParams();
    const config = useConfigStore((state) => state.config);

    // API Hook
    const {
        submit,
        isLoading,
        isSuccess: isSubmitSuccess,
        confirmationCode: submitConfirmationCode,
    } = useSubmitStudy();

    const isSuccess = isSubmitSuccess || session.isCompleted;
    const finalConfirmationCode = session.confirmationCode || submitConfirmationCode;

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
            navigate(`/study/${slug}/fine-sort`, { replace: true });
        } else {
            // Optional: trigger a silent 'started' status update if not already
            // Using a timer to avoid conflicts
            const timer = setTimeout(() => {
                submit('started', { silent: true });
            }, 1000);
            return () => clearTimeout(timer);
        }
    }, [config, responses.qsort.length, navigate, slug, session.isCompleted, submit]);

    // --- Render ---

    if (!config) return null;

    if (isSuccess) {
        return (
            <div className="max-w-xl mx-auto px-4 py-24 text-center animate-in zoom-in-50 duration-500">
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
                    className="text-3xl font-bold text-slate-800 mb-4"
                    data-testid="thank-you-message"
                >
                    {t('post.success.title', 'Thank You!')}
                </h1>
                <p className="text-lg text-slate-600 mb-6 leading-relaxed">
                    {t('post.success.message', 'Your responses have been successfully submitted.')}
                </p>
                {finalConfirmationCode && (
                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 inline-block shadow-sm">
                        <span className="text-xs font-semibold text-slate-400 block uppercase tracking-widest mb-2">
                            {t('post.success.id_label', 'Confirmation Code')}
                        </span>
                        <span className="text-2xl font-mono font-bold text-slate-800 tracking-widest select-all">
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
                <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center min-h-[50vh] rounded-3xl">
                    <div className="animate-spin mb-4 text-[var(--brand-accent)]">
                        <Loader2 size={48} />
                    </div>
                    <p className="text-xl font-semibold text-slate-700 animate-pulse">
                        {t('common.submitting', 'Submitting...')}
                    </p>
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
                    {wizardStep === 1
                        ? t('post.title')
                        : t('admin.design.postsort.steps.step2', 'Final Questions')}
                </h1>
                <p className="text-slate-600 max-w-lg mx-auto leading-relaxed">
                    {wizardStep === 1
                        ? t('post.description')
                        : t(
                              'post.step2_description',
                              'Please answer these final questions to complete the study.'
                          )}
                </p>
            </header>

            {wizardStep === 1 && (
                <Step1_Feedback
                    onNext={() => {
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                        setWizardStep(2);
                    }}
                />
            )}

            {wizardStep === 2 && (
                <Step2_Questionnaire
                    onBack={() => {
                        window.scrollTo({ top: 0, behavior: 'smooth' });
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
