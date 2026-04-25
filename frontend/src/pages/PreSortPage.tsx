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
import { z } from 'zod';
import type { PreSortField } from '../schemas/study';
import { SurveyField } from '../components/survey/SurveyField';
import { zodResolver } from '@hookform/resolvers/zod';
import { useConfigStore } from '../store/useConfigStore';
import { useResponseStore } from '../store/useResponseStore';
import { useSessionStore } from '../store/useSessionStore';
import { cn } from '@/lib/utils';
import { isPresortEnabled } from '../utils/studyConfig';

import { evaluateVisibilityCondition } from '../utils/visibilityEvaluator';
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
            // Generate Dynamic Zod Schema based on current data
            const shape: Record<string, z.ZodTypeAny> = {};

            Object.entries(presortFields).forEach(([key, field]) => {
                const isVisible = evaluateVisibilityCondition(field.visibility_condition, data);
                let fieldSchema: z.ZodTypeAny;

                if (field.required && isVisible) {
                    if (field.type === 'checkbox') {
                        fieldSchema = z.array(z.string()).min(1, t('presort.error_required'));
                    } else if (field.type === 'number') {
                        let numSchema = z.number({
                            required_error: t('presort.error_required'),
                            invalid_type_error: t('presort.error_required'),
                        });
                        if (field.min !== undefined) {
                            numSchema = numSchema.min(
                                field.min,
                                t('common.errors.min', { min: field.min })
                            );
                        }
                        if (field.max !== undefined) {
                            numSchema = numSchema.max(
                                field.max,
                                t('common.errors.max', { max: field.max })
                            );
                        }
                        fieldSchema = z.preprocess((val) => {
                            if (val === '' || val === null || val === undefined) return undefined;
                            const num = Number(val);
                            return Number.isNaN(num) ? val : num;
                        }, numSchema);
                    } else {
                        const isTextual = ['text', 'textarea', 'email'].includes(field.type);
                        const errorMsg = isTextual
                            ? t('post.extreme.min_chars')
                            : t('presort.error_required');

                        let s = z.string().min(1, errorMsg);
                        if (field.type === 'email') {
                            s = s.email(t('common.errors.email'));
                        }
                        if (field.minLength !== undefined) {
                            s = s.min(
                                field.minLength,
                                t('common.errors.min_length', { count: field.minLength })
                            );
                        }
                        if (field.maxLength !== undefined) {
                            s = s.max(
                                field.maxLength,
                                t('common.errors.max_length', { count: field.maxLength })
                            );
                        }

                        fieldSchema = z.preprocess(
                            (val) => (val === null || val === undefined ? '' : val),
                            s
                        );
                    }
                } else {
                    // Non-required fields
                    if (field.type === 'number') {
                        fieldSchema = z.preprocess((val) => {
                            if (val === '' || val === null || val === undefined) return null;
                            const num = Number(val);
                            return Number.isNaN(num) ? val : num;
                        }, z.number().optional().nullable());
                    } else if (field.type === 'email') {
                        fieldSchema = z.preprocess(
                            (val) => (val === '' || val === null || val === undefined ? null : val),
                            z.string().email(t('common.errors.email')).optional().nullable()
                        );
                    } else if (field.type === 'checkbox') {
                        fieldSchema = z.array(z.string()).optional().nullable();
                    } else {
                        let s = z.string().optional().nullable();
                        if (field.minLength !== undefined) {
                            // biome-ignore lint/suspicious/noExplicitAny: complex union
                            s = (s as any).min(
                                field.minLength,
                                t('common.errors.min_length', { count: field.minLength })
                            );
                        }
                        if (field.maxLength !== undefined) {
                            // biome-ignore lint/suspicious/noExplicitAny: complex union
                            s = (s as any).max(
                                field.maxLength,
                                t('common.errors.max_length', { count: field.maxLength })
                            );
                        }
                        fieldSchema = s;
                    }
                }

                shape[key] = fieldSchema;
            });

            const dynamicSchema = z.object(shape);
            return zodResolver(dynamicSchema)(data, context, options);
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
