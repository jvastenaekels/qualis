/*
 * Open-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router-dom';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useStudyStore } from '../store/useStudyStore';
import { ArrowRight } from 'lucide-react';
import type { PreSortField } from '../schemas/study';

const PreSortPage: React.FC = () => {
    const { slug } = useParams();
    const navigate = useNavigate();
    const { config, setPresortResponse, setStep, responses } = useStudyStore();
    const { t, i18n } = useTranslation();
    
    // Generate Dynamic Zod Schema based on config
    const dynamicSchema = useMemo(() => {
        if (!config?.presort_config) return z.object({});
        
        const shape: Record<string, z.ZodTypeAny> = {};
        
        Object.entries(config.presort_config).forEach(([key, field]) => {
            let fieldSchema: z.ZodTypeAny;
            
            if (field.type === 'number') {
                fieldSchema = z.coerce.number();
                if (field.min !== undefined) fieldSchema = (fieldSchema as z.ZodNumber).min(field.min, t('common.errors.min', { min: field.min }));
                if (field.max !== undefined) fieldSchema = (fieldSchema as z.ZodNumber).max(field.max, t('common.errors.max', { max: field.max }));
            } else {
                fieldSchema = z.string();
            }

            if (field.required) {
                if (field.type !== 'number') {
                    fieldSchema = (fieldSchema as z.ZodString).min(1, t('presort.error_required'));
                }
            } else {
                fieldSchema = fieldSchema.optional().nullable();
            }
            
            shape[key] = fieldSchema;
        });
        
        return z.object(shape);
    }, [config?.presort_config, t]);

    const { register, handleSubmit, watch, formState: { errors, isValid } } = useForm({
        resolver: zodResolver(dynamicSchema),
        mode: 'onChange',
        defaultValues: responses.presort
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
        return obj[i18n.language] || obj['en'] || Object.values(obj)[0] || '';
    };

    const renderField = (key: string, fieldConfig: PreSortField) => {
        const commonClasses = "mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 min-h-[44px] text-base"; 
        const labelText = getLocalizedText(fieldConfig.label);
        
            switch (fieldConfig.type) {
            case 'number':
                return (
                    <input
                        id={key}
                        type="number"
                        {...register(key)}
                        className={commonClasses}
                        placeholder={labelText} 
                    />
                );
            case 'select':
                return (
                    <select
                        id={key}
                        {...register(key)}
                        className={commonClasses}
                    >
                        <option value="">{t('presort.select_placeholder')}</option>
                        {fieldConfig.options?.map((opt) => {
                            const optValue = typeof opt === 'object' ? opt.value : opt;
                            const optLabel = typeof opt === 'object' ? getLocalizedText(opt.label) : opt;
                            return <option key={optValue} value={optValue}>{optLabel}</option>;
                        })}
                    </select>
                );
            default: // text
                return (
                    <input
                        id={key}
                        type="text"
                        {...register(key)}
                        className={commonClasses}
                        placeholder={labelText}
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

            <form id="presort-form" onSubmit={handleSubmit(onSubmit)} className="space-y-6 bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                {Object.entries(config.presort_config || {}).map(([key, fieldConfig]) => (
                    <div key={key}>
                        <label htmlFor={key} className="block text-sm font-medium text-gray-700">
                            {getLocalizedText(fieldConfig.label)}
                            {fieldConfig.required && <span className="text-red-500 ml-1">*</span>}
                        </label>
                        {renderField(key, fieldConfig as PreSortField)}
                        {errors[key] && (
                            <p className="text-red-500 text-sm mt-1">
                                {errors[key]?.message as string || t('presort.error_required')}
                            </p>
                        )}
                    </div>
                ))}

                <div className="pt-4 flex justify-end w-full">
                    <button
                        type="submit"
                        disabled={!isValid}
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
