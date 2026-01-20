/*
 * Open-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { ArrowRight } from 'lucide-react';
import React, { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { z } from 'zod';
import type { PreSortField } from '../schemas/study';
import { SurveyField } from '../components/survey/SurveyField';
import { zodResolver } from '@hookform/resolvers/zod';
import { useConfigStore } from '../store/useConfigStore';
import { useResponseStore } from '../store/useResponseStore';
import { useSessionStore } from '../store/useSessionStore';
import { cn } from '@/lib/utils';

import { evaluateVisibilityCondition } from '../utils/visibilityEvaluator';

interface PreSortPageProps {
    highlightKey?: string | null;
}

const PreSortPage: React.FC<PreSortPageProps> = ({ highlightKey }) => {
    const { slug } = useParams();
    const navigate = useNavigate();

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

                if (field.type === 'number') {
                    fieldSchema = z.coerce.number();
                    if (field.min !== undefined)
                        fieldSchema = (fieldSchema as z.ZodNumber).min(
                            field.min,
                            t('common.errors.min', { min: field.min })
                        );
                    if (field.max !== undefined)
                        fieldSchema = (fieldSchema as z.ZodNumber).max(
                            field.max,
                            t('common.errors.max', { max: field.max })
                        );
                } else if (field.type === 'email') {
                    fieldSchema = z.string().email('Please enter a valid email address');
                } else if (field.type === 'date') {
                    fieldSchema = z.string();
                } else if (field.type === 'checkbox') {
                    fieldSchema = z.array(z.string());
                } else {
                    fieldSchema = z.string();
                    if (field.minLength !== undefined) {
                        fieldSchema = (fieldSchema as z.ZodString).min(
                            field.minLength,
                            `Minimum ${field.minLength} characters required`
                        );
                    }
                    if (field.maxLength !== undefined) {
                        fieldSchema = (fieldSchema as z.ZodString).max(
                            field.maxLength,
                            `Maximum ${field.maxLength} characters allowed`
                        );
                    }
                }

                if (field.required && isVisible) {
                    if (field.type === 'checkbox') {
                        fieldSchema = (fieldSchema as z.ZodArray<z.ZodString>).min(
                            1,
                            t('presort.error_required')
                        );
                    } else if (field.type !== 'number') {
                        fieldSchema = (fieldSchema as z.ZodString).min(
                            1,
                            t('presort.error_required')
                        );
                    }
                } else {
                    fieldSchema = fieldSchema.optional().nullable();
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
        if (
            config?.presort_config &&
            'enabled' in config.presort_config &&
            !config.presort_config.enabled
        ) {
            navigate(`/study/${slug}/rough-sort`, { replace: true });
        }
    }, [config, navigate, slug]);

    if (!config) return null;

    const onSubmit = (data: Record<string, string | number | boolean>) => {
        setPresortResponse(data);
        setStep(3);
        navigate(`/study/${slug}/rough-sort`);
    };

    // Helper for multilingual strings
    const getLocalizedText = (obj: string | Record<string, string>) => {
        if (typeof obj === 'string') return obj;
        if (!obj) return '';
        return obj[i18n.language] || obj.en || Object.values(obj)[0] || '';
    };

    return (
        <div className="max-w-3xl mx-auto py-12 px-4 space-y-6 animate-in slide-in-from-right duration-500">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">{t('presort.title')}</h1>
                <p className="text-gray-600">{t('presort.description')}</p>
            </div>

            <form
                id="presort-form"
                onSubmit={handleSubmit(onSubmit)}
                className="space-y-6 bg-white p-6 rounded-xl border border-gray-200 shadow-sm"
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
                                {getLocalizedText(fieldConfig.label)}
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
