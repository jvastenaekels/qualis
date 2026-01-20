/*
 * Open-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { AlertCircle, Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SafeMarkdown } from '../components/SafeMarkdown';
import { useNavigate, useParams } from 'react-router-dom';
import { useLayoutAction } from '../hooks/useLayout';
import { useSubmitStudy } from '../hooks/useSubmitStudy';
import { zodResolver } from '@hookform/resolvers/zod';
import { useConfigStore } from '../store/useConfigStore';
import { useResponseStore } from '../store/useResponseStore';
import { useSessionStore } from '../store/useSessionStore';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import type { PreSortField } from '../schemas/study';
import { SurveyField } from '../components/survey/SurveyField';

import { evaluateVisibilityCondition } from '../utils/visibilityEvaluator';

interface PostSortPageProps {
    highlightKey?: string | null;
}

const PostSortPage: React.FC<PostSortPageProps> = ({ highlightKey: _highlightKey }) => {
    const config = useConfigStore((state) => state.config);
    const session = useSessionStore((state) => ({
        isCompleted: state.isCompleted,
        confirmationCode: state.confirmationCode,
    }));
    const setStep = useSessionStore((state) => state.setStep);

    const responses = useResponseStore((state) => ({
        qsort: state.qsort,
        postsort: state.postsort,
    }));
    const setPostSortResponse = useResponseStore((state) => state.setPostSortResponse);

    const { setHeaderAction } = useLayoutAction();
    const { t, i18n } = useTranslation();
    const navigate = useNavigate();
    const { slug } = useParams();

    // API Hook
    const {
        submit,
        isLoading,
        isSuccess: isSubmitSuccess,
        error,
        confirmationCode: submitConfirmationCode,
    } = useSubmitStudy();

    // Check global completion state (persistent) or local success (immediate)
    const isSuccess = isSubmitSuccess || session.isCompleted;
    const finalConfirmationCode = session.confirmationCode || submitConfirmationCode;

    // Local state for validation touched
    const [touched, setTouched] = useState<Record<string, boolean>>({});
    const [validationError, setValidationError] = useState<string | null>(null);

    // Dynamic Form for Custom Questions
    const questions = useMemo(() => {
        // biome-ignore lint/suspicious/noExplicitAny: complex config
        return (config?.postsort_config as any)?.questions as
            | Record<string, PreSortField>
            | undefined;
    }, [config]);

    const {
        register,
        trigger: triggerFormValidation,
        watch,
        formState: { errors: formErrors },
    } = useForm({
        mode: 'onChange',
        resolver: async (data, context, options) => {
            if (!questions) return zodResolver(z.object({}))(data, context, options);

            const shape: Record<string, z.ZodTypeAny> = {};

            Object.entries(questions).forEach(([key, field]) => {
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

            return zodResolver(z.object(shape))(data, context, options);
        },
        defaultValues: responses.postsort.questions_answers,
    });

    const currentValues = watch();


    // Auto-save form data to store
    React.useEffect(() => {
        const subscription = watch((value) => {
            setPostSortResponse(
                'questions_answers',
                value as any
            );
        });
        return () => subscription.unsubscribe();
    }, [watch, setPostSortResponse]);

    React.useEffect(() => {
        // If already completed, ensure we are technically on step 5
        setStep(5);
    }, [setStep]);

    // Header Action (Submit)
    React.useEffect(() => {
        setHeaderAction(null);
    }, [setHeaderAction]);

    // Completeness Guard
    React.useEffect(() => {
        if (session.isCompleted) return;

        if (config && responses.qsort.length !== config.statements.length) {
            navigate(`/study/${slug}/fine-sort`, { replace: true });
        } else {
            const timer = setTimeout(() => {
                submit('started', { silent: true });
            }, 1000);
            return () => clearTimeout(timer);
        }
    }, [config, responses.qsort.length, navigate, slug, session.isCompleted, submit]);

    // Helper to resolve custom prompts
    const getPrompt = (keys: string | string[], defaultTextKey: string) => {
        const prompts = config?.postsort_config?.prompts;
        const currentLang = i18n.language || 'en';

        if (prompts) {
            const keyList = Array.isArray(keys) ? keys : [keys];

            for (const key of keyList) {
                const promptConfig = (prompts as Record<string, unknown>)[key];
                if (promptConfig) {
                    if (typeof promptConfig === 'string') return promptConfig;
                    const text = (promptConfig as Record<string, string>)[currentLang] || (promptConfig as Record<string, string>).en;
                    if (text) return text;
                }
            }
        }

        // No custom prompt found, use default i18n translation
        return t(defaultTextKey);
    };

    // Helper for multilingual strings
    const getLocalizedText = (obj: string | Record<string, string>) => {
        if (typeof obj === 'string') return obj;
        if (!obj) return '';
        return obj[i18n.language] || obj.en || Object.values(obj)[0] || '';
    };

    if (!config) return null;

    const DEFAULT_GRID = [
        { score: -4, capacity: 2 },
        { score: -3, capacity: 3 },
        { score: -2, capacity: 4 },
        { score: -1, capacity: 6 },
        { score: 0, capacity: 10 },
        { score: 1, capacity: 6 },
        { score: 2, capacity: 4 },
        { score: 3, capacity: 3 },
        { score: 4, capacity: 2 },
    ];
    const gridColumns = config?.grid_config || DEFAULT_GRID;

    const defaultExtremes = [-4, 4];
    const extremeCols = config?.postsort_config?.extreme_columns || defaultExtremes;
    const allowRandomComments = (config?.postsort_config as any)?.allow_random_comments ?? true;

    const extremeCards = responses.qsort.filter((p) => {
        const colDef = gridColumns[p.col];
        if (!colDef) return false;
        return extremeCols.includes(colDef.score);
    });

    const getCardText = (id: number) =>
        config?.statements.find((s) => s.id === id)?.text || 'Unknown Card';

    const handleCommentChange = (id: number, val: string) => {
        const current = { ...(responses.postsort?.card_comments || {}) };
        current[id] = val;
        setPostSortResponse('card_comments', current);
    };

    const isCommentValid = (id: number) => {
        const comment = responses.postsort?.card_comments?.[id] || '';
        return comment.length >= 10;
    };

    const isEmailValid = () => {
        const email = responses.postsort.email;
        if (!email) return true; // It's optional if empty
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    };

    const validateAll = async () => {
        let valid = true;
        extremeCards.forEach((c) => {
            if (!isCommentValid(c.statementId)) valid = false;
        });

        if (!isEmailValid()) valid = false;

        const isFormValid = await triggerFormValidation();
        if (!isFormValid) valid = false;

        return valid;
    };

    const markAllTouched = () => {
        const newTouched: Record<string, boolean> = {};
        extremeCards.forEach((c) => {
            newTouched[c.statementId] = true;
        });
        setTouched(newTouched);
    };

    const handleSubmit = async () => {
        const isValid = await validateAll();
        if (!isValid) {
            markAllTouched();
            setValidationError(t('post.validation_error'));
            window.scrollTo({ top: 0, behavior: 'smooth' });
            return;
        }
        setValidationError(null);
        submit();
    };

    if (isSuccess) {
        return (
            <div className="max-w-xl mx-auto px-4 py-24 text-center">
                <div
                    className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6"
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
                <p className="text-lg text-slate-600 mb-2">
                    {t('post.success.message', 'Your responses have been successfully submitted.')}
                </p>
                {finalConfirmationCode && (
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 inline-block">
                        <span className="text-sm font-medium text-slate-500 block uppercase tracking-wider mb-1">
                            {t('post.success.id_label', 'Confirmation Code')}
                        </span>
                        <span className="text-xl font-mono font-bold text-slate-700 tracking-widest">
                            {finalConfirmationCode}
                        </span>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="max-w-3xl mx-auto px-4 py-8 pb-24 relative">
            {/* Loading Overlay */}
            {isLoading && (
                <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center min-h-[50vh]">
                    <div className="animate-spin mb-4" style={{ color: 'var(--brand-accent)' }}>
                        <Loader2 size={48} />
                    </div>
                    <p className="text-xl font-semibold text-slate-700">
                        {t('common.submitting', 'Submitting...')}
                    </p>
                </div>
            )}

            <header className="mb-8 text-center">
                <h1 className="text-2xl font-bold text-slate-800 mb-2">{t('post.title')}</h1>
                <p className="text-slate-600">{t('post.description')}</p>
            </header>

            {validationError && (
                <div className="mb-8 p-4 bg-yellow-50 border border-yellow-200 rounded-lg flex items-center gap-3 text-yellow-800 animate-in fade-in slide-in-from-top-2">
                    <AlertCircle size={24} />
                    <div>
                        <p className="font-bold">{t('common.attention', 'Attention')}</p>
                        <p className="text-sm">{validationError}</p>
                    </div>
                </div>
            )}

            {error && (
                <div className="mb-8 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3 text-red-700">
                    <AlertCircle size={24} />
                    <div>
                        <p className="font-bold">{t('common.error', 'Error')}</p>
                        <p className="text-sm">{error}</p>
                    </div>
                </div>
            )}

            <div className="space-y-8">
                {/* 1. EXTREME CARDS COMMENTS */}
                <div className="space-y-6">
                    {extremeCards.map((card) => {
                        const colDef = gridColumns[card.col];
                        const scoreVal = colDef ? colDef.score : 0;

                        const scoreLabel = scoreVal > 0 ? `+${scoreVal}` : scoreVal;
                        const isPositive = scoreVal > 0;
                        const borderColor = isPositive
                            ? 'border-green-200 bg-green-50/30'
                            : 'border-red-200 bg-red-50/30';
                        const badgeColor = isPositive
                            ? 'bg-green-100 text-green-700'
                            : 'bg-red-100 text-red-700';
                        const label = isPositive
                            ? t('post.extreme.label_agree')
                            : t('post.extreme.label_disagree');
                        const isValid = isCommentValid(card.statementId);
                        const isTouched = touched[card.statementId];

                        return (
                            <div
                                key={card.statementId}
                                className={`p-4 md:p-6 rounded-xl border ${borderColor} shadow-sm transition-all`}
                            >
                                <div className="flex items-start justify-between mb-4">
                                    <div className="flex items-center gap-2">
                                        <span
                                            className={`px-2 py-1 rounded-md text-xs font-bold uppercase tracking-wider ${badgeColor}`}
                                        >
                                            {label} ({scoreLabel})
                                        </span>
                                    </div>
                                </div>

                                <blockquote className="text-lg font-medium text-slate-800 mb-4 pl-4 border-l-4 border-slate-300 italic break-words">
                                    <SafeMarkdown
                                        components={{
                                            p: ({ children }) => <span>{children}</span>,
                                        }}
                                    >
                                        {getCardText(card.statementId)}
                                    </SafeMarkdown>
                                </blockquote>

                                <div className="relative">
                                    <label
                                        htmlFor={`comment-${card.statementId}`}
                                        className="block text-sm font-semibold text-slate-700 mb-2"
                                    >
                                        {getPrompt(
                                            isPositive
                                                ? ['extreme_positive', 'extreme']
                                                : ['extreme_negative', 'extreme'],
                                            t('post.extreme.why')
                                        )}
                                    </label>
                                    <textarea
                                        id={`comment-${card.statementId}`}
                                        value={
                                            responses.postsort?.card_comments?.[card.statementId] ||
                                            ''
                                        }
                                        onChange={(e) =>
                                            handleCommentChange(card.statementId, e.target.value)
                                        }
                                        onBlur={() =>
                                            setTouched((prev) => ({
                                                ...prev,
                                                [card.statementId]: true,
                                            }))
                                        }
                                        className={`
                                            w-full p-3 rounded-lg border focus:ring-2 focus:outline-none min-h-[100px]
                                            ${!isValid && isTouched ? 'border-red-300 focus:ring-red-200 bg-red-50' : 'border-slate-300 focus:ring-[var(--brand-accent)] focus:border-[var(--brand-accent)] focus:ring-opacity-20'}
                                        `}
                                        placeholder={t('post.extreme.placeholder')}
                                        disabled={isLoading}
                                    />
                                    {!isValid && isTouched && (
                                        <div className="flex items-center gap-1.5 mt-2 text-red-600 text-sm animate-in fade-in slide-in-from-top-1">
                                            <AlertCircle size={16} />
                                            <span>{t('post.extreme.min_chars')}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>

                <hr className="border-slate-200 my-8" />

                {/* 2. OPTIONAL COMMENTS */}
                {allowRandomComments && (
                    <div className="space-y-6">
                        <h2 className="text-xl font-bold text-slate-800">
                            {t('post.optional.title', 'Additional Comments (Optional)')}
                        </h2>
                        <p className="text-slate-600">
                            {t(
                                'post.optional.description',
                                'Feel free to add comments to any other statement if you wish to elaborate on your choices.'
                            )}
                        </p>

                        <div className="w-full overflow-hidden">
                            <select
                                className="w-full min-w-0 p-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-[var(--brand-accent)] focus:ring-opacity-20 focus:border-[var(--brand-accent)] bg-white truncate pr-10"
                                onChange={(e) => {
                                    if (e.target.value) {
                                        const id = parseInt(e.target.value, 10);
                                        if (!Number.isNaN(id)) {
                                            if (!responses.postsort.card_comments?.[id]) {
                                                handleCommentChange(id, '');
                                            }
                                            e.target.value = '';
                                        }
                                    }
                                }}
                                defaultValue=""
                            >
                                <option value="" disabled>
                                    {t('post.optional.select_placeholder', 'Select a statement...')}
                                </option>
                                {responses.qsort
                                    .filter((s) => {
                                        const isExtreme = extremeCards.some(
                                            (e) => e.statementId === s.statementId
                                        );
                                        const isAdded =
                                            responses.postsort.card_comments &&
                                            Object.hasOwn(
                                                responses.postsort.card_comments,
                                                s.statementId
                                            );
                                        return !isExtreme && !isAdded;
                                    })
                                    .sort((a, b) => a.statementId - b.statementId)
                                    .map((s) => (
                                        <option key={s.statementId} value={s.statementId}>
                                            {`S${s.statementId}: ${getCardText(s.statementId).substring(0, 35)}${getCardText(s.statementId).length > 35 ? '...' : ''}`}
                                        </option>
                                    ))}
                            </select>
                        </div>

                        <div className="space-y-6">
                            {Object.keys(responses.postsort.card_comments || {}).map((key) => {
                                const id = parseInt(key, 10);
                                if (extremeCards.some((c) => c.statementId === id)) return null;

                                const cardPlacement = responses.qsort.find(
                                    (c) => c.statementId === id
                                );
                                if (!cardPlacement) return null;

                                const colDef = gridColumns[cardPlacement.col];
                                const scoreVal = colDef ? colDef.score : 0;
                                const scoreLabel = scoreVal > 0 ? `+${scoreVal}` : `${scoreVal}`;
                                const isPositive = scoreVal > 0;
                                const isNeutral = scoreVal === 0;

                                let badgeColor = 'bg-slate-100 text-slate-700';
                                if (isPositive) badgeColor = 'bg-green-100 text-green-700';
                                if (!isPositive && !isNeutral)
                                    badgeColor = 'bg-red-100 text-red-700';

                                return (
                                    <div
                                        key={id}
                                        className="p-4 md:p-6 rounded-xl border border-slate-200 shadow-sm bg-white relative group"
                                    >
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const current = {
                                                    ...responses.postsort.card_comments,
                                                };
                                                delete current[id];
                                                setPostSortResponse('card_comments', current);
                                            }}
                                            className="absolute top-4 right-4 text-slate-400 hover:text-red-500 transition-colors p-1"
                                            title={t('common.remove', 'Remove')}
                                        >
                                            <div className="w-5 h-5 flex items-center justify-center font-bold text-xl leading-none">
                                                &times;
                                            </div>
                                        </button>

                                        <div className="flex items-center gap-2 mb-4 pr-8">
                                            <span
                                                className={`px-2 py-1 rounded-md text-xs font-bold uppercase tracking-wider ${badgeColor}`}
                                            >
                                                {t('post.score', 'Score')}: {scoreLabel}
                                            </span>
                                        </div>

                                        <blockquote className="text-lg font-medium text-slate-800 mb-4 pl-4 border-l-4 border-slate-300 italic break-words">
                                            <SafeMarkdown
                                                components={{
                                                    p: ({ children }) => <span>{children}</span>,
                                                }}
                                            >
                                                {getCardText(id)}
                                            </SafeMarkdown>
                                        </blockquote>

                                        <textarea
                                            value={responses.postsort.card_comments[id] || ''}
                                            onChange={(e) =>
                                                handleCommentChange(id, e.target.value)
                                            }
                                            className="w-full p-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-[var(--brand-accent)] focus:ring-opacity-20 focus:border-[var(--brand-accent)] min-h-[100px]"
                                            placeholder={t(
                                                'post.optional.placeholder',
                                                'Your comment here...'
                                            )}
                                            disabled={isLoading}
                                        />
                                    </div>
                                );
                            })}
                        </div>
                        <hr className="border-slate-200 my-8" />
                    </div>
                )}

                {/* 3. CUSTOM QUESTIONS */}
                {questions && Object.keys(questions).length > 0 && (
                    <div className="space-y-6">
                        {Object.entries(questions).map(([key, fieldConfig]) => {
                            const isVisible = evaluateVisibilityCondition(
                                fieldConfig.visibility_condition,
                                currentValues
                            );

                            if (!isVisible) return null;

                            return (
                                <div
                                    key={key}
                                    className="bg-white p-4 md:p-6 rounded-xl border border-slate-200 shadow-sm"
                                >
                                    <label
                                        htmlFor={key}
                                        className="block text-sm font-bold text-slate-800 mb-2"
                                    >
                                        {getLocalizedText(fieldConfig.label)}
                                        {fieldConfig.required && (
                                            <span className="text-red-500 ml-1">*</span>
                                        )}
                                    </label>
                                    <SurveyField
                                        id={key}
                                        fieldConfig={fieldConfig}
                                        register={register}
                                    />
                                    {formErrors[key] && (
                                        <p
                                            className="text-red-500 text-sm mt-1"
                                            data-testid="postsort-field-error"
                                        >
                                            {(formErrors[key]?.message as string) ||
                                                t('presort.error_required')}
                                        </p>
                                    )}
                                </div>
                            );
                        })}
                        <hr className="border-slate-200 my-8" />
                    </div>
                )}

                {/* Email / Contact Section */}

                {(config?.postsort_config?.email_collection_enabled ||
                    config?.postsort_config?.interview_consent_enabled ||
                    config?.postsort_config?.newsletter_consent_enabled) && (
                    <Card className="border-blue-100 bg-blue-50/50 shadow-sm">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-lg text-blue-900 flex items-center gap-2">
                                ✉️ {t('post.contact.title')}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {config?.postsort_config?.email_collection_enabled && (
                                <div className="space-y-2">
                                    <Label
                                        htmlFor="contact-email"
                                        className="text-blue-900 font-medium"
                                    >
                                        {t('post.contact.email_label')}
                                    </Label>
                                    <Input
                                        id="contact-email"
                                        type="email"
                                        placeholder={t('post.contact.email_placeholder')}
                                        value={responses.postsort.email || ''}
                                        onChange={(e) =>
                                            setPostSortResponse('email', e.target.value)
                                        }
                                        className={`bg-white border-blue-200 focus:border-blue-400 focus:ring-blue-400 ${!isEmailValid() ? 'border-red-500 focus:border-red-500' : ''}`}
                                    />
                                    {!isEmailValid() && (
                                        <p
                                            className="text-red-500 text-xs mt-1"
                                            data-testid="postsort-email-error"
                                        >
                                            {t(
                                                'post.contact.error_invalid_email',
                                                'Please enter a valid email address'
                                            )}
                                        </p>
                                    )}
                                </div>
                            )}

                            {(config?.postsort_config?.interview_consent_enabled ?? true) && (
                                <div className="flex items-start space-x-3 pt-2">
                                    <Checkbox
                                        id="contact-consent-interview"
                                        checked={responses.postsort.interview_consent || false}
                                        onCheckedChange={(checked) =>
                                            setPostSortResponse(
                                                'interview_consent',
                                                checked === true
                                            )
                                        }
                                        className="mt-1 border-blue-400 data-[state=checked]:bg-blue-600"
                                    />
                                    <div className="grid gap-1.5 leading-none">
                                        <Label
                                            htmlFor="contact-consent-interview"
                                            className="text-sm font-medium leading-normal cursor-pointer text-slate-700"
                                        >
                                            {t('post.contact.interview_consent')}
                                        </Label>
                                    </div>
                                </div>
                            )}

                            {(config?.postsort_config?.newsletter_consent_enabled ?? true) && (
                                <div className="flex items-start space-x-3 pt-2">
                                    <Checkbox
                                        id="contact-consent-newsletter"
                                        checked={responses.postsort.newsletter_consent || false}
                                        onCheckedChange={(checked) =>
                                            setPostSortResponse(
                                                'newsletter_consent',
                                                checked === true
                                            )
                                        }
                                        className="mt-1 border-blue-400 data-[state=checked]:bg-blue-600"
                                    />
                                    <div className="grid gap-1.5 leading-none">
                                        <Label
                                            htmlFor="contact-consent-newsletter"
                                            className="text-sm font-medium leading-normal cursor-pointer text-slate-700"
                                        >
                                            {t('post.contact.newsletter_consent')}
                                        </Label>
                                    </div>
                                </div>
                            )}

                            <div className="pt-2 border-t border-blue-100/50">
                                <p className="text-xs text-slate-500 italic">
                                    ℹ️ {t('post.contact.gdpr_note')}
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                )}

                <div className="flex justify-end gap-4">
                    <Button variant="outline" onClick={() => navigate('../fine-sort')}>
                        ← {t('post.back', 'Back to sort')}
                    </Button>
                    <Button
                        onClick={handleSubmit}
                        data-testid="postsort-submit-btn"
                        className="bg-indigo-600 hover:bg-indigo-700 text-white min-w-[200px]"
                    >
                        {isLoading ? (
                            <Loader2 className="w-6 h-6 animate-spin" />
                        ) : (
                            <>
                                <span>{config.ui_labels?.['post.submit'] || t('post.submit')}</span>
                                <Check size={20} strokeWidth={3} />
                            </>
                        )}
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default PostSortPage;
