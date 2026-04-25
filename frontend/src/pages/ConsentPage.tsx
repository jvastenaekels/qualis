/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight } from 'lucide-react';
import type React from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { SafeMarkdown } from '../components/SafeMarkdown';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { z } from 'zod';
import { toast } from 'sonner';
import { reportBug } from '../api/client';
import { useRecordConsentApiStudySlugConsentPost } from '../api/generated';
import { useConfigStore } from '../store/useConfigStore';
import { useResponseStore } from '../store/useResponseStore';
import { useSessionStore } from '../store/useSessionStore';
import { isPresortEnabled } from '../utils/studyConfig';

const consentSchema = z.object({
    consent: z.boolean().refine((val) => val === true, {
        message: 'You must consent to participate.',
    }),
});

type ConsentForm = z.infer<typeof consentSchema>;

// Simple SHA-256 hash function for consent text
async function hashConsent(text: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

const ConsentPage: React.FC = () => {
    const { slug } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const { t, i18n } = useTranslation();

    const config = useConfigStore((state) => state.config);
    const token = useSessionStore((s) => s.token);
    const hasConsented = useSessionStore((s) => s.hasConsented);
    const isPilotMode = useSessionStore((s) => s.isPilotMode);
    const setConsent = useSessionStore((state) => state.setConsent);
    const setToken = useSessionStore((state) => state.setToken);
    const setStep = useSessionStore((state) => state.setStep);

    const {
        register,
        handleSubmit,
        formState: { errors, isValid },
    } = useForm<ConsentForm>({
        resolver: zodResolver(consentSchema),
        defaultValues: { consent: hasConsented },
    });

    const { mutateAsync: recordConsentMutation } = useRecordConsentApiStudySlugConsentPost();

    // If no config, redirect home or show loading
    if (!config) return null;

    const onSubmit = async (data: ConsentForm) => {
        if (data.consent) {
            const sessionToken = token || crypto.randomUUID();
            if (!token) {
                // New session — clear any stale response data (e.g. audio recordings from a prior session)
                useResponseStore.getState().resetResponses();
                setToken(sessionToken);
            }
            // Track which study this session belongs to (for cross-study isolation)
            useSessionStore.getState().setStudySlug(slug || '');

            // Record proof of consent in DB (skip in pilot mode — no backend persistence)
            if (!isPilotMode) {
                try {
                    const consentText = config.consent?.description || t('consent.default_text');
                    const consentHash = await hashConsent(consentText);

                    const result = await recordConsentMutation({
                        slug: slug || '',
                        data: {
                            study_slug: slug || '',
                            session_token: sessionToken,
                            language_code: i18n.language,
                            consent_hash: consentHash,
                            is_test_run: false,
                        },
                    });

                    // Store the memorable resume code for "Continue Later" feature
                    if (result.resume_code) {
                        useSessionStore.getState().setResumeCode(result.resume_code);
                    }
                } catch (err) {
                    console.error('Failed to record consent proof:', err);
                    reportBug(err instanceof Error ? err : new Error(String(err)), {
                        context: 'ConsentPage',
                    });
                    toast.error(
                        t(
                            'consent.record_error',
                            'Could not save consent record. Please try again.'
                        )
                    );
                    return; // Block navigation — consent must be recorded
                }
            }

            // Consent recorded successfully — persist local state
            setConsent(true);

            // Determine next step
            let nextStep = 2; // Default to Pre-Sort
            let nextPath = 'presort';

            if (!isPresortEnabled(config)) {
                nextStep = 3;
                nextPath = 'rough-sort';
            }

            setStep(nextStep);
            navigate(`/study/${slug}/${nextPath}${location.search}`);
        }
    };

    return (
        <div className="max-w-2xl mx-auto py-6 sm:py-12 px-4 animate-in fade-in duration-500">
            <div className="mb-8 text-center">
                <h1 className="text-2xl font-bold text-gray-900 mb-2">
                    {t('consent.title', 'Consent to Participate')}
                </h1>
                <p className="text-gray-600">
                    {t('consent.subtitle', 'Please review the following information carefully.')}
                </p>
            </div>

            <form
                id="consent-form"
                onSubmit={handleSubmit(onSubmit)}
                className="bg-white p-5 sm:p-8 rounded-xl border border-gray-200 shadow-sm space-y-8"
            >
                {/* Consent Description/Legal Text */}
                <div className="prose prose-slate prose-base max-w-none text-slate-800 leading-relaxed">
                    {config.consent?.description ? (
                        <SafeMarkdown>{config.consent.description}</SafeMarkdown>
                    ) : (
                        <SafeMarkdown>{t('consent.default_text')}</SafeMarkdown>
                    )}
                </div>

                <div className="border-t border-gray-100 pt-6">
                    <div
                        className="flex items-start gap-4 p-4 rounded-lg border"
                        style={{
                            backgroundColor:
                                'color-mix(in srgb, var(--brand-accent), transparent 95%)',
                            borderColor: 'color-mix(in srgb, var(--brand-accent), transparent 90%)',
                        }}
                    >
                        <div className="flex h-6 items-center">
                            <input
                                id="consent"
                                type="checkbox"
                                data-testid="consent-checkbox"
                                {...register('consent')}
                                style={
                                    { accentColor: 'var(--brand-accent)' } as React.CSSProperties
                                }
                                className="h-6 w-6 rounded border-gray-300 cursor-pointer"
                            />
                        </div>
                        <div className="text-base">
                            <label
                                htmlFor="consent"
                                className="font-medium text-slate-900 cursor-pointer block"
                            >
                                {t('welcome.consent.label')}
                            </label>
                            {errors.consent && (
                                <p className="text-red-600 mt-2 text-sm">
                                    {t('welcome.consent.error', 'Consent is required to proceed.')}
                                </p>
                            )}
                        </div>
                    </div>
                </div>

                <div className="pt-4 flex flex-col sm:flex-row items-center gap-4 justify-center">
                    <button
                        type="submit"
                        data-testid="consent-accept-btn"
                        disabled={!isValid}
                        style={{ backgroundColor: 'var(--brand-accent)' }}
                        className="w-full sm:w-auto px-8 py-3 text-white rounded-md font-bold text-base hover:brightness-110 shadow-md flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                        {config.ui_labels?.['welcome.start'] || t('welcome.start', 'Get Started')}{' '}
                        <ArrowRight size={18} />
                    </button>
                </div>
            </form>
        </div>
    );
};

export default ConsentPage;
