/*
 * Open-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { AlertCircle, Check, Loader2 } from 'lucide-react';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import { useNavigate, useParams } from 'react-router-dom';
import { useLayoutAction } from '../hooks/useLayout';
import { useSubmitStudy } from '../hooks/useSubmitStudy';
import { useConfigStore } from '../store/useConfigStore';
import { useResponseStore } from '../store/useResponseStore';
import { useSessionStore } from '../store/useSessionStore';

const PostSortPage: React.FC = () => {
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

    React.useEffect(() => {
        // If already completed, ensure we are technically on step 5 (though layout might lock others)
        setStep(5);
    }, [setStep]);

    // Header Action (Submit)
    React.useEffect(() => {
        // Clear header action since we use body button
        setHeaderAction(null);
    }, [setHeaderAction]);

    // Completeness Guard
    React.useEffect(() => {
        // Skip validation if already completed successfully (viewing success screen)
        if (session.isCompleted) return;

        if (config && responses.qsort.length !== config.statements.length) {
            // Incomplete sort, redirect back
            navigate(`/study/${slug}/fine-sort`, { replace: true });
        } else {
            // Auto-save as incomplete draft
            const timer = setTimeout(() => {
                submit('started', { silent: true });
            }, 1000);
            return () => clearTimeout(timer);
        }
    }, [config, responses.qsort.length, navigate, slug, session.isCompleted, submit]);

    // Helper to resolve custom prompts
    const getPrompt = (key: 'extreme' | 'missing' | 'general', defaultText: string) => {
        const prompts = config?.postsort_config?.prompts;

        const promptConfig = prompts?.[key];

        if (!promptConfig) return defaultText;

        if (typeof promptConfig === 'string') {
            return promptConfig;
        }

        const currentLang = i18n.language || 'en';
        return promptConfig[currentLang] || promptConfig.en || defaultText;
    };

    if (!config) return null;

    // Default Grid (Same as FineSortPage)
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

    // 1. Identify Extreme Cards
    // Default to -4 and +4 if not configured
    const defaultExtremes = [-4, 4];
    const extremeCols = config?.postsort_config?.extreme_columns || defaultExtremes;

    const extremeCards = responses.qsort.filter((p) => {
        const colDef = gridColumns[p.col];
        // Safety: if p.col is out of bounds (shouldn't happen), ignore
        if (!colDef) return false;
        return extremeCols.includes(colDef.score);
    });

    // Helpers to get text
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

    const validateAll = () => {
        let valid = true;
        extremeCards.forEach((c) => {
            if (!isCommentValid(c.statementId)) valid = false;
        });
        return valid;
    };

    // Mark all as touched on submit attempt
    const markAllTouched = () => {
        const newTouched: Record<string, boolean> = {};
        extremeCards.forEach((c) => {
            newTouched[c.statementId] = true;
        });
        setTouched(newTouched);
    };

    const handleSubmit = async () => {
        if (!validateAll()) {
            markAllTouched();
            setValidationError(
                t(
                    'post.validation_error',
                    'Please complete all required comments (min 10 characters).'
                )
            );
            window.scrollTo({ top: 0, behavior: 'smooth' });
            return;
        }
        setValidationError(null);
        navigate(`/study/${slug}/summary`);
    };

    // Success View
    if (isSuccess) {
        return (
            <div className="max-w-xl mx-auto px-4 py-24 text-center">
                <div className="bg-green-100 text-green-700 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
                    <Check size={40} strokeWidth={3} />
                </div>
                <h1 className="text-3xl font-bold text-slate-800 mb-4">
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
                    <div className="animate-spin text-blue-600 mb-4">
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

                        const scoreLabel = scoreVal > 0 ? `+${scoreVal}` : scoreVal; // e.g. +4, -4
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
                                    <ReactMarkdown
                                        components={{
                                            p: ({ children }) => <span>{children}</span>,
                                        }}
                                    >
                                        {getCardText(card.statementId)}
                                    </ReactMarkdown>
                                </blockquote>

                                <div className="relative">
                                    <label
                                        htmlFor={`comment-${card.statementId}`}
                                        className="block text-sm font-semibold text-slate-700 mb-2"
                                    >
                                        {getPrompt('extreme', t('post.extreme.why'))}
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
                                            ${!isValid && isTouched ? 'border-red-300 focus:ring-red-200 bg-red-50' : 'border-slate-300 focus:ring-indigo-200 focus:border-indigo-400'}
                                        `}
                                        placeholder={t('post.extreme.placeholder')}
                                        disabled={isLoading}
                                    />
                                    {/* Soft-Lock Warning */}
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

                    {/* Dropdown to add - Ensure it's fully responsive */}
                    <div className="w-full overflow-hidden">
                        <select
                            className="w-full min-w-0 p-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 bg-white truncate pr-10"
                            onChange={(e) => {
                                if (e.target.value) {
                                    const id = parseInt(e.target.value, 10);
                                    if (!Number.isNaN(id)) {
                                        // Initialize with empty string if not exists
                                        if (!responses.postsort.card_comments?.[id]) {
                                            handleCommentChange(id, '');
                                        }
                                        // Reset select
                                        e.target.value = '';
                                    }
                                }
                            }}
                            defaultValue=""
                        >
                            <option value="" disabled>
                                {t(
                                    'post.optional.select_placeholder',
                                    'Select a statement...'
                                )}
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

                    {/* List of Optional Cards */}
                    <div className="space-y-6">
                        {Object.keys(responses.postsort.card_comments || {}).map((key) => {
                            const id = parseInt(key, 10);
                            // Skip extremes (handled in section 1)
                            if (extremeCards.some((c) => c.statementId === id)) return null;

                            // Get card info (placement score etc)
                            const cardPlacement = responses.qsort.find((c) => c.statementId === id);
                            if (!cardPlacement) return null; // Should include all placed cards

                            const colDef = gridColumns[cardPlacement.col];
                            const scoreVal = colDef ? colDef.score : 0;
                            const scoreLabel = scoreVal > 0 ? `+${scoreVal}` : `${scoreVal}`;
                            const isPositive = scoreVal > 0;
                            const isNeutral = scoreVal === 0;

                            let badgeColor = 'bg-slate-100 text-slate-700';
                            if (isPositive) badgeColor = 'bg-green-100 text-green-700';
                            if (!isPositive && !isNeutral) badgeColor = 'bg-red-100 text-red-700';

                            return (
                                <div
                                    key={id}
                                    className="p-4 md:p-6 rounded-xl border border-slate-200 shadow-sm bg-white relative group"
                                >
                                    <button
                                        type="button"
                                        onClick={() => {
                                            // Remove comment: delete key from object
                                            const current = { ...responses.postsort.card_comments };
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
                                        <ReactMarkdown
                                            components={{
                                                p: ({ children }) => <span>{children}</span>,
                                            }}
                                        >
                                            {getCardText(id)}
                                        </ReactMarkdown>
                                    </blockquote>

                                    <textarea
                                        value={responses.postsort.card_comments[id] || ''}
                                        onChange={(e) => handleCommentChange(id, e.target.value)}
                                        className="w-full p-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 min-h-[100px]"
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
                </div>

                <hr className="border-slate-200 my-8" />

                {/* 3. MISSING STATEMENTS */}
                <div className="bg-white p-4 md:p-6 rounded-xl border border-slate-200 shadow-sm">
                    <label
                        htmlFor="missing_statement"
                        className="block text-lg font-bold text-slate-800 mb-2"
                    >
                        {getPrompt('missing', t('post.missing.label'))}
                    </label>
                    <p className="text-sm text-slate-500 mb-4">{t('post.missing.description')}</p>
                    <textarea
                        id="missing_statement"
                        value={responses.postsort?.missing_statement || ''}
                        onChange={(e) => setPostSortResponse('missing_statement', e.target.value)}
                        className="w-full p-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 min-h-[80px]"
                        placeholder={t('post.missing.placeholder')}
                        disabled={isLoading}
                    />
                </div>

                {/* 4. GENERAL COMMENTS */}
                <div className="bg-white p-4 md:p-6 rounded-xl border border-slate-200 shadow-sm">
                    <label
                        htmlFor="general_comment"
                        className="block text-lg font-bold text-slate-800 mb-2"
                    >
                        {getPrompt('general', t('post.general.label'))}
                    </label>
                    <p className="text-sm text-slate-500 mb-4">{t('post.general.description')}</p>
                    <textarea
                        id="general_comment"
                        value={responses.postsort?.general_comment || ''}
                        onChange={(e) => setPostSortResponse('general_comment', e.target.value)}
                        className="w-full p-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 min-h-[80px]"
                        placeholder={t('post.general.placeholder')}
                        disabled={isLoading}
                    />
                </div>

                <div className="flex justify-center pt-8">
                    <button
                        type="button"
                        onClick={() => submit()}
                        disabled={isLoading}
                        className="
                            bg-indigo-600 text-white px-8 py-4 rounded-2xl font-black text-lg shadow-lg
                            hover:bg-indigo-700 hover:scale-[1.02] active:scale-95 transition-all duration-300
                            flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed
                        "
                    >
                        {isLoading ? (
                            <Loader2 className="w-6 h-6 animate-spin" />
                        ) : (
                            <>
                                <span>{t('post.submit')}</span>
                                <Check size={20} strokeWidth={3} />
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default PostSortPage;
