/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { ArrowRight } from 'lucide-react';
import React, { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import type { PreSortField } from '../schemas/study';
import { SurveyField } from '../components/survey/SurveyField';
import { zodResolver } from '@hookform/resolvers/zod';
import { useConfigStore } from '../store/useConfigStore';
import { useResponseStore } from '../store/useResponseStore';
import { useSessionStore } from '../store/useSessionStore';
import { cn } from '@/lib/utils';
import { isPresortEnabled } from '../utils/studyConfig';

import { evaluateVisibilityCondition } from '../utils/visibilityEvaluator';
import { buildQuestionnaireSchema } from '../utils/buildQuestionnaireSchema';
import { getLocalizedText } from '@/utils/localization';

interface PreSortPageProps {
    highlightKey?: string | null;
}

const PreSortPage: React.FC<PreSortPageProps> = ({ highlightKey }) => {
    const { slug } = useParams();
    const navigate = useNavigate();
    const location = useLocation();

    const config = useConfigStore((state) => state.config);
    const setStep = useSessionStore((state) => state.setStep);
    const presortResponse = useResponseStore((state) => state.presort);
    const setPresortResponse = useResponseStore((state) => state.setPresortResponse);

    const { t, i18n } = useTranslation();

    // Normalize config to get fields
    const presortFields = useMemo(() => {
        if (!config?.presort_config) return {};
        if ('fields' in config.presort_config) {
            return config.presort_config.fields;
        }
        // Legacy support
        return config.presort_config as Record<string, PreSortField>;
    }, [config?.presort_config]);

    const {
        register,
        handleSubmit,
        watch,
        formState: { errors, isValid },
    } = useForm({
        mode: 'onChange',
        resolver: async (data, context, options) => {
            // useMemo above can return a union including a bare PreSortField when
            // the legacy presort_config shape is used; the runtime guard already
            // narrows it but TS does not.
            const fields = presortFields as Record<string, PreSortField>;
            const schema = buildQuestionnaireSchema(fields, data, t);
            return zodResolver(schema)(data, context, options);
        },
        defaultValues: presortResponse,
    });

    const currentValues = watch();

    // Auto-save form data to store
    React.useEffect(() => {
        const subscription = watch((value) => {
            setPresortResponse(value as Record<string, string | number | boolean>);
        });
        return () => subscription.unsubscribe();
    }, [watch, setPresortResponse]);

    // Set Step 2 on mount
    React.useEffect(() => {
        setStep(2);
    }, [setStep]);

    // Handle skipping if disabled
    React.useEffect(() => {
        if (!isPresortEnabled(config)) {
            navigate(`/study/${slug}/rough-sort${location.search}`, { replace: true });
        }
    }, [config, navigate, slug, location.search]);

    if (!config) return null;

    const onSubmit = (data: Record<string, string | number | boolean>) => {
        setPresortResponse(data);
        setStep(3);
        navigate(`/study/${slug}/rough-sort${location.search}`);
    };

    return (
        <div className="max-w-3xl mx-auto py-6 sm:py-12 px-4 space-y-6 animate-in slide-in-from-right duration-500">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">{t('presort.title')}</h1>
                <p className="text-gray-600">{t('presort.description')}</p>
            </div>

            <form
                id="presort-form"
                onSubmit={handleSubmit(onSubmit)}
                className="space-y-6 bg-white p-4 sm:p-6 rounded-xl border border-gray-200 shadow-sm"
            >
                {Object.entries(presortFields).map(([key, fieldConfig]) => {
                    const isVisible = evaluateVisibilityCondition(
                        fieldConfig.visibility_condition,
                        currentValues
                    );

                    if (!isVisible) return null;

                    return (
                        <div key={key}>
                            <label
                                htmlFor={key}
                                className="block text-sm font-medium text-gray-700"
                            >
                                {getLocalizedText(fieldConfig.label, i18n.language)}
                                {fieldConfig.required && (
                                    <span className="text-red-500 ml-1">*</span>
                                )}
                            </label>
                            <SurveyField
                                id={key}
                                fieldConfig={fieldConfig as PreSortField}
                                register={register}
                            />
                            {errors[key] && (
                                <p
                                    className="text-red-500 text-sm mt-1"
                                    data-testid="presort-field-error"
                                >
                                    {(errors[key]?.message as string) ||
                                        t('presort.error_required')}
                                </p>
                            )}
                        </div>
                    );
                })}

                <div className="pt-4 flex justify-end w-full">
                    <button
                        type="submit"
                        disabled={!isValid}
                        data-testid="presort-submit-btn"
                        className={cn(
                            'group w-full sm:w-auto px-8 py-3 text-white rounded-full font-bold text-base hover:brightness-110 shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none',
                            highlightKey === 'common.next' &&
                                'ring-4 ring-[var(--brand-accent)] ring-offset-2 animate-pulse z-[10] relative shadow-[0_0_20px_color-mix(in_srgb,var(--brand-accent),transparent_50%)]'
                        )}
                        style={{ backgroundColor: 'var(--brand-accent)' }}
                    >
                        {config.ui_labels?.['common.next'] || t('common.next', t('presort.submit'))}{' '}
                        <ArrowRight size={16} />
                    </button>
                </div>
            </form>
        </div>
    );
};

export default PreSortPage;
