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

interface RatingFieldProps {
    id: string;
    fieldConfig: PreSortField;
    // biome-ignore lint/suspicious/noExplicitAny: generic form
    register: UseFormRegister<any>;
    localize: (obj: string | Record<string, string>) => string;
}

const RatingField: React.FC<RatingFieldProps> = ({ id, fieldConfig, register, localize }) => {
    const points = Math.max(2, Math.min(10, fieldConfig.scale_points ?? 5));
    const leftLabel = fieldConfig.scale_labels?.left ? localize(fieldConfig.scale_labels.left) : '';
    const rightLabel = fieldConfig.scale_labels?.right
        ? localize(fieldConfig.scale_labels.right)
        : '';
    const middleLabel = fieldConfig.scale_labels?.middle
        ? localize(fieldConfig.scale_labels.middle)
        : '';
    const hasLabels = !!(leftLabel || rightLabel || middleLabel);
    return (
        <div className="mt-2">
            <div
                role="radiogroup"
                aria-labelledby={`${id}-label`}
                className="flex flex-wrap items-center gap-2 sm:gap-3"
            >
                {Array.from({ length: points }, (_, i) => i + 1).map((n) => (
                    <label
                        key={n}
                        className="flex flex-col items-center gap-1 cursor-pointer p-2 rounded-md hover:bg-gray-50 active:bg-gray-100 min-w-[44px]"
                    >
                        <input
                            type="radio"
                            {...register(id)}
                            value={String(n)}
                            // biome-ignore lint/suspicious/noExplicitAny: style override
                            style={{ accentColor: 'var(--brand-accent)' } as any}
                            className="h-5 w-5"
                        />
                        <span className="text-sm font-semibold text-gray-700">{n}</span>
                    </label>
                ))}
            </div>
            {hasLabels && (
                <div className="flex justify-between items-start mt-1 text-xs text-gray-500 gap-2">
                    <span className="text-left">{leftLabel}</span>
                    {middleLabel && <span className="text-center flex-1">{middleLabel}</span>}
                    <span className="text-right">{rightLabel}</span>
                </div>
            )}
        </div>
    );
};

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
        'mt-1 block w-full rounded-md border border-gray-300 shadow-sm focus:border-[var(--brand-accent)] focus:ring-[var(--brand-accent)] min-h-[44px] text-base';

    const placeholderText = t('common.placeholders.text_response');

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
        case 'text_audio':
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
                    <option value="">{t('presort.select_placeholder', 'Select...')}</option>
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
                                className="flex items-start space-x-3 p-3 hover:bg-gray-50 active:bg-gray-100 rounded-md cursor-pointer"
                            >
                                <input
                                    type="radio"
                                    {...register(id)}
                                    value={optValue}
                                    // biome-ignore lint/suspicious/noExplicitAny: style override
                                    style={{ accentColor: 'var(--brand-accent)' } as any}
                                    className="h-5 w-5 mt-0.5"
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
                                className="flex items-start space-x-3 p-3 hover:bg-gray-50 active:bg-gray-100 rounded-md cursor-pointer"
                            >
                                <input
                                    type="checkbox"
                                    {...register(id)}
                                    value={optValue}
                                    // biome-ignore lint/suspicious/noExplicitAny: style override
                                    style={{ accentColor: 'var(--brand-accent)' } as any}
                                    className="h-5 w-5 rounded mt-0.5"
                                />
                                <span className="text-base">{optLabel}</span>
                            </label>
                        );
                    })}
                </div>
            );
        case 'rating':
            return (
                <RatingField
                    id={id}
                    fieldConfig={fieldConfig}
                    register={register}
                    localize={getLocalizedText}
                />
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
