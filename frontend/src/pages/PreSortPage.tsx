/*
 * Open-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight } from 'lucide-react';
import React, { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { z } from 'zod';
import type { PreSortField } from '../schemas/study';
import { useConfigStore } from '../store/useConfigStore';
import { useResponseStore } from '../store/useResponseStore';
import { useSessionStore } from '../store/useSessionStore';

const PreSortPage: React.FC = () => {
    const { slug } = useParams();
    const navigate = useNavigate();

    const config = useConfigStore((state) => state.config);
    const setStep = useSessionStore((state) => state.setStep);
    const presortResponse = useResponseStore((state) => state.presort);
    const setPresortResponse = useResponseStore((state) => state.setPresortResponse);

    const { t, i18n } = useTranslation();

    // Generate Dynamic Zod Schema based on config
    const dynamicSchema = useMemo(() => {
        if (!config?.presort_config) return z.object({});

        const shape: Record<string, z.ZodTypeAny> = {};

        Object.entries(config.presort_config).forEach(([key, field]) => {
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
                fieldSchema = z.string(); // HTML date input returns string
            } else if (field.type === 'checkbox') {
                // Checkbox group returns array of strings
                fieldSchema = z.array(z.string());
            } else {
                // text, textarea, radio, select
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

            if (field.required) {
                if (field.type === 'checkbox') {
                    fieldSchema = (fieldSchema as z.ZodArray<z.ZodString>).min(1, t('presort.error_required'));
                } else if (field.type !== 'number') {
                    fieldSchema = (fieldSchema as z.ZodString).min(1, t('presort.error_required'));
                }
            } else {
                fieldSchema = fieldSchema.optional().nullable();
            }

            shape[key] = fieldSchema;
        });

        return z.object(shape);
    }, [config?.presort_config, t]);

    const {
        register,
        handleSubmit,
        watch,
        formState: { errors, isValid },
    } = useForm({
        resolver: zodResolver(dynamicSchema),
        mode: 'onChange',
        defaultValues: presortResponse,
    });

    // Auto-save form data to store using subscription to avoid render loops
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

    if (!config) return null;

    const onSubmit = (data: Record<string, string | number | boolean>) => {
        setPresortResponse(data);
        setStep(3); // Setup Q-Sort (Next Step)
        navigate(`/study/${slug}/rough-sort`);
    };

    // Helper for multilingual strings
    const getLocalizedText = (obj: string | Record<string, string>) => {
        if (typeof obj === 'string') return obj;
        if (!obj) return '';
        return obj[i18n.language] || obj.en || Object.values(obj)[0] || '';
    };

    const renderField = (key: string, fieldConfig: PreSortField) => {
        const commonClasses =
            'mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 min-h-[44px] text-base';
        const labelText = getLocalizedText(fieldConfig.label);
        const placeholderText = fieldConfig.placeholder
            ? getLocalizedText(fieldConfig.placeholder)
            : labelText;

        switch (fieldConfig.type) {
            case 'number':
                return (
                    <input
                        id={key}
                        type="number"
                        {...register(key)}
                        className={commonClasses}
                        placeholder={placeholderText}
                        min={fieldConfig.min}
                        max={fieldConfig.max}
                    />
                );
            case 'email':
                return (
                    <input
                        id={key}
                        type="email"
                        {...register(key)}
                        className={commonClasses}
                        placeholder={placeholderText}
                    />
                );
            case 'date':
                return (
                    <input
                        id={key}
                        type="date"
                        {...register(key)}
                        className={commonClasses}
                    />
                );
            case 'textarea':
                return (
                    <textarea
                        id={key}
                        {...register(key)}
                        className={commonClasses}
                        placeholder={placeholderText}
                        rows={fieldConfig.rows || 4}
                    />
                );
            case 'select':
                return (
                    <select id={key} {...register(key)} className={commonClasses}>
                        <option value="">{t('presort.select_placeholder')}</option>
                        {fieldConfig.options?.map((opt) => {
                            const optValue = typeof opt === 'object' ? opt.value : opt;
                            const optLabel =
                                typeof opt === 'object' ? getLocalizedText(opt.label) : opt;
                            return (
                                <option key={optValue} value={optValue}>
                                    {optLabel}
                                </option>
                            );
                        })}
                    </select>
                );
            case 'radio':
                return (
                    <div className="space-y-2 mt-2">
                        {fieldConfig.options?.map((opt) => {
                            const optValue = typeof opt === 'object' ? opt.value : opt;
                            const optLabel =
                                typeof opt === 'object' ? getLocalizedText(opt.label) : opt;
                            return (
                                <label
                                    key={optValue}
                                    className="flex items-center space-x-3 p-2 hover:bg-gray-50 rounded-md cursor-pointer"
                                >
                                    <input
                                        type="radio"
                                        {...register(key)}
                                        value={optValue}
                                        className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                                    />
                                    <span className="text-base">{optLabel}</span>
                                </label>
                            );
                        })}
                    </div>
                );
            case 'checkbox':
                return (
                    <div className="space-y-2 mt-2">
                        {fieldConfig.options?.map((opt) => {
                            const optValue = typeof opt === 'object' ? opt.value : opt;
                            const optLabel =
                                typeof opt === 'object' ? getLocalizedText(opt.label) : opt;
                            return (
                                <label
                                    key={optValue}
                                    className="flex items-center space-x-3 p-2 hover:bg-gray-50 rounded-md cursor-pointer"
                                >
                                    <input
                                        type="checkbox"
                                        {...register(key)}
                                        value={optValue}
                                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 rounded"
                                    />
                                    <span className="text-base">{optLabel}</span>
                                </label>
                            );
                        })}
                    </div>
                );
            default: // text
                return (
                    <input
                        id={key}
                        type="text"
                        {...register(key)}
                        className={commonClasses}
                        placeholder={placeholderText}
                        minLength={fieldConfig.minLength}
                        maxLength={fieldConfig.maxLength}
                    />
                );
        }
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
                {Object.entries(config.presort_config || {}).map(([key, fieldConfig]) => (
                    <div key={key}>
                        <label htmlFor={key} className="block text-sm font-medium text-gray-700">
                            {getLocalizedText(fieldConfig.label)}
                            {fieldConfig.required && <span className="text-red-500 ml-1">*</span>}
                        </label>
                        {renderField(key, fieldConfig as PreSortField)}
                        {errors[key] && (
                            <p className="text-red-500 text-sm mt-1">
                                {(errors[key]?.message as string) || t('presort.error_required')}
                            </p>
                        )}
                    </div>
                ))}

                <div className="pt-4 flex justify-end w-full">
                    <button
                        type="submit"
                        data-testid="presort-submit-btn"
                        // If no config, always valid. Otherwise respect form validation.
                        disabled={
                            (config?.presort_config &&
                                Object.keys(config.presort_config).length > 0 &&
                                !isValid) ||
                            false
                        }
                        className="w-full sm:w-auto px-6 py-2 bg-blue-600 text-white rounded-md font-bold text-sm hover:bg-blue-700 shadow-md flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                        {t('presort.submit')} <ArrowRight size={16} />
                    </button>
                </div>
            </form>
        </div>
    );
};

export default PreSortPage;
