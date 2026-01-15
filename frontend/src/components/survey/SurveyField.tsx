import type React from 'react';
import type { UseFormRegister } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { PreSortField } from '../../schemas/study';

interface SurveyFieldProps {
    id: string;
    fieldConfig: PreSortField;
    // biome-ignore lint/suspicious/noExplicitAny: generic form
    register: UseFormRegister<any>;
    error?: string;
}

export const SurveyField: React.FC<SurveyFieldProps> = ({ id, fieldConfig, register }) => {
    const { t, i18n } = useTranslation();

    const getLocalizedText = (obj: string | Record<string, string>) => {
        if (typeof obj === 'string') return obj;
        if (!obj) return '';
        // biome-ignore lint/suspicious/noTsIgnore: complex types
        // @ts-ignore
        return obj[i18n.language] || obj.en || Object.values(obj)[0] || '';
    };

    const commonClasses =
        'mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-[var(--brand-accent)] focus:ring-[var(--brand-accent)] min-h-[44px] text-base';
    const labelText = getLocalizedText(fieldConfig.label);
    const placeholderText = fieldConfig.placeholder
        ? getLocalizedText(fieldConfig.placeholder)
        : labelText;

    switch (fieldConfig.type) {
        case 'number':
            return (
                <input
                    id={id}
                    type="number"
                    {...register(id)}
                    className={commonClasses}
                    placeholder={placeholderText}
                    min={fieldConfig.min}
                    max={fieldConfig.max}
                />
            );
        case 'email':
            return (
                <input
                    id={id}
                    type="email"
                    {...register(id)}
                    className={commonClasses}
                    placeholder={placeholderText}
                />
            );
        case 'date':
            return <input id={id} type="date" {...register(id)} className={commonClasses} />;
        case 'textarea':
            return (
                <textarea
                    id={id}
                    {...register(id)}
                    className={commonClasses}
                    placeholder={placeholderText}
                    rows={fieldConfig.rows || 4}
                />
            );
        case 'select':
            if (!Array.isArray(fieldConfig.options)) {
                console.warn(`SurveyField: options is not an array for ${id}`, fieldConfig.options);
                return null;
            }
            return (
                <select id={id} {...register(id)} className={commonClasses}>
                    <option value="">{t('presort.select_placeholder', 'Select an option')}</option>
                    {fieldConfig.options.map((opt) => {
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
            if (!Array.isArray(fieldConfig.options)) {
                return null;
            }
            return (
                <div className="space-y-2 mt-2">
                    {fieldConfig.options.map((opt) => {
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
                                    {...register(id)}
                                    value={optValue}
                                    // biome-ignore lint/suspicious/noExplicitAny: style override
                                    style={{ accentColor: 'var(--brand-accent)' } as any}
                                    className="h-4 w-4"
                                />
                                <span className="text-base">{optLabel}</span>
                            </label>
                        );
                    })}
                </div>
            );
        case 'checkbox':
            if (!Array.isArray(fieldConfig.options)) {
                return null;
            }
            return (
                <div className="space-y-2 mt-2">
                    {fieldConfig.options.map((opt) => {
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
                                    {...register(id)}
                                    value={optValue}
                                    // biome-ignore lint/suspicious/noExplicitAny: style override
                                    style={{ accentColor: 'var(--brand-accent)' } as any}
                                    className="h-4 w-4 rounded"
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
                    id={id}
                    type="text"
                    {...register(id)}
                    className={commonClasses}
                    placeholder={placeholderText}
                    minLength={fieldConfig.minLength}
                    maxLength={fieldConfig.maxLength}
                />
            );
    }
};
