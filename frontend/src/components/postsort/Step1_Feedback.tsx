import type React from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertCircle, ArrowRight, Mic } from 'lucide-react';
import { SafeMarkdown } from '../SafeMarkdown';
import { AudioRecorder } from '@/components/audio/AudioRecorder';
import { useResponseStore } from '@/store/useResponseStore';
import { useConfigStore } from '@/store/useConfigStore';
import { useSessionStore } from '@/store/useSessionStore';
import { useNavigate } from 'react-router-dom';
import { useViewport } from '@/contexts/ViewportContext';
import {
    uploadAudioApiAudioUploadPost,
    deleteAudioRecordingApiAudioRecordingIdDelete,
} from '@/api/generated';
import { toast } from 'sonner';

interface Step1Props {
    onNext: () => void;
}

export const Step1_Feedback: React.FC<Step1Props> = ({ onNext }) => {
    const { t, i18n } = useTranslation();
    const { isDesktop } = useViewport();
    const navigate = useNavigate();

    const config = useConfigStore((state) => state.config);
    const token = useSessionStore((state) => state.token);
    const { qsort, postsort } = useResponseStore((state) => ({
        qsort: state.qsort,
        postsort: state.postsort,
    }));
    const setPostSortResponse = useResponseStore((state) => state.setPostSortResponse);
    const setAudioRecording = useResponseStore((state) => state.setAudioRecording);
    const deleteAudioRecording = useResponseStore((state) => state.deleteAudioRecording);
    const getAudioRecording = useResponseStore((state) => state.getAudioRecording);

    const [touched, setTouched] = useState<Record<string, boolean>>({});
    const [validationError, setValidationError] = useState<string | null>(null);

    // --- Configuration Handling ---
    const gridColumns = config?.grid_config || [];
    const extremeCols = config?.postsort_config?.extreme_columns || [-4, 4];
    const allowRandomComments = config?.postsort_config?.allow_random_comments ?? true;
    const allowMissingStatements = config?.postsort_config?.missing_statements_enabled ?? true;

    // Audio configuration
    const audioConfig = config?.postsort_config?.audio;
    const isAudioEnabled = audioConfig?.enabled ?? false;
    const maxDurationSeconds = audioConfig?.max_duration_seconds ?? 180;

    // --- Data Preparation ---
    const extremeCards = qsort
        .filter((p) => {
            const colDef = gridColumns[p.col];
            if (!colDef) return false;
            return extremeCols.includes(colDef.score);
        })
        .sort((a, b) => {
            // Sort by score (asc) then row
            const scoreA = gridColumns[a.col].score;
            const scoreB = gridColumns[b.col].score;
            if (scoreA !== scoreB) return scoreA - scoreB;
            return a.row - b.row;
        });

    // --- Helpers ---
    const getCardText = (id: number) =>
        config?.statements.find((s) => s.id === id)?.text || t('common.unknown_card');

    const getPrompt = (keys: string | string[], defaultTextKey: string, defaultValue?: string) => {
        const prompts = config?.postsort_config?.prompts;
        const currentLang = i18n.language || 'en';

        if (prompts) {
            const keyList = Array.isArray(keys) ? keys : [keys];
            for (const key of keyList) {
                const promptConfig = (prompts as Record<string, unknown>)[key];
                if (promptConfig) {
                    if (typeof promptConfig === 'string') return promptConfig;
                    const text =
                        (promptConfig as Record<string, string>)[currentLang] ||
                        (promptConfig as Record<string, string>).en;
                    if (text) return text;
                }
            }
        }
        return t(defaultTextKey, { defaultValue });
    };

    // --- Audio Handlers ---
    const handleAudioUpload = async (questionKey: string, blob: Blob, duration: number) => {
        if (!token) {
            toast.error(t('audio.error.no_token', 'Session token missing'));
            return;
        }

        try {
            // Create File from Blob (orval expects File, not Blob)
            const file = new File([blob], `recording_${Date.now()}.webm`, {
                type: blob.type,
            });

            const response = await uploadAudioApiAudioUploadPost({
                file,
                session_token: token,
                question_key: questionKey,
                duration_seconds: duration,
            });

            // Store metadata in Zustand
            setAudioRecording(questionKey, {
                id: response.recording_id,
                question_key: questionKey,
                file_size_bytes: response.file_size_bytes,
                duration_seconds: duration,
                presigned_url: response.presigned_url,
                created_at: new Date().toISOString(),
            });

            // Clear text comment (exclusive choice)
            if (questionKey.startsWith('card_')) {
                const statementId = Number.parseInt(questionKey.replace('card_', ''), 10);
                if (!Number.isNaN(statementId)) {
                    handleCommentChange(statementId, '');
                }
            } else if (questionKey === 'missing_statement') {
                setPostSortResponse('missing_statement', '');
            }
        } catch (error) {
            console.error('Audio upload failed:', error);
            throw error; // Let AudioRecorder handle the error display
        }
    };

    const handleAudioDelete = async (questionKey: string) => {
        const recording = getAudioRecording(questionKey);
        if (!recording || !token) return;

        try {
            await deleteAudioRecordingApiAudioRecordingIdDelete(recording.id, {
                session_token: token,
            });
            deleteAudioRecording(questionKey);
        } catch (error) {
            console.error('Audio deletion failed:', error);
            throw error; // Let AudioRecorder handle the error display
        }
    };

    const handleCommentChange = (id: number, val: string) => {
        const current = { ...(postsort.card_comments || {}) };
        current[id] = val;
        setPostSortResponse('card_comments', current);
    };

    const isCommentValid = (id: number) => {
        const comment = postsort.card_comments?.[id] || '';
        const hasText = comment.length >= 2;
        const hasAudio = !!getAudioRecording(`card_${id}`);
        return hasText || hasAudio; // Valid if either text OR audio exists
    };

    const validateStep1 = () => {
        let valid = true;
        const newTouched: Record<string, boolean> = { ...touched };

        extremeCards.forEach((c) => {
            if (!isCommentValid(c.statementId)) {
                valid = false;
                newTouched[c.statementId] = true;
            }
        });

        setTouched(newTouched);
        return valid;
    };

    const handleNext = () => {
        if (validateStep1()) {
            setValidationError(null);
            onNext();
        } else {
            setValidationError(t('post.validation_error', 'Please fill in all required fields.'));
            const el = document.getElementById('main-scroll-container');
            if (el && typeof el.scrollTo === 'function') {
                el.scrollTo({ top: 0, behavior: 'smooth' });
            }
        }
    };

    if (!config) return null;

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {validationError && (
                <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg flex items-center gap-3 text-yellow-800">
                    <AlertCircle size={24} />
                    <div>
                        <p className="font-bold">{t('common.attention', 'Attention')}</p>
                        <p className="text-sm">{validationError}</p>
                    </div>
                </div>
            )}

            {/* 1. EXTREME CARDS COMMENTS */}
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <h2 className="text-xl font-bold text-slate-800">
                        {t('post.extreme.title', 'Key Choices')}
                    </h2>
                    <span className="text-sm text-slate-500 font-medium">
                        {extremeCards.length} {t('common.cards')}
                    </span>
                </div>

                {extremeCards.map((card) => {
                    const colDef = gridColumns[card.col];
                    const scoreVal = colDef ? colDef.score : 0;
                    const isPositive = scoreVal > 0;
                    const isNeutral = scoreVal === 0;

                    const scoreLabel = scoreVal > 0 ? `+${scoreVal}` : scoreVal;

                    const borderColor = isPositive
                        ? 'border-green-200 bg-green-50/30'
                        : isNeutral
                          ? 'border-slate-200 bg-slate-50/30'
                          : 'border-red-200 bg-red-50/30';
                    const badgeColor = isPositive
                        ? 'bg-green-100 text-green-700'
                        : isNeutral
                          ? 'bg-slate-100 text-slate-700'
                          : 'bg-red-100 text-red-700';

                    const label = isPositive
                        ? t('post.extreme.label_agree')
                        : isNeutral
                          ? t('post.extreme.label_neutral')
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
                                    components={{ p: ({ children }) => <span>{children}</span> }}
                                >
                                    {getCardText(card.statementId)}
                                </SafeMarkdown>
                            </blockquote>

                            <div className="relative space-y-3">
                                <Label className="block text-sm font-semibold text-slate-700">
                                    {getPrompt(
                                        isPositive
                                            ? ['extreme_positive', 'extreme']
                                            : isNeutral
                                              ? ['extreme_neutral', 'extreme']
                                              : ['extreme_negative', 'extreme'],
                                        t('post.extreme.why')
                                    )}
                                </Label>

                                <Tabs
                                    defaultValue="text"
                                    className="w-full"
                                    onValueChange={() =>
                                        setTouched((prev) => ({
                                            ...prev,
                                            [card.statementId]: true,
                                        }))
                                    }
                                >
                                    <TabsList className="grid w-full grid-cols-2">
                                        <TabsTrigger value="text">
                                            {t('post.response_type.text', 'Text')}
                                        </TabsTrigger>
                                        <TabsTrigger value="audio" disabled={!isAudioEnabled}>
                                            <Mic className="w-4 h-4 mr-1" />
                                            {t('post.response_type.audio', 'Audio')}
                                        </TabsTrigger>
                                    </TabsList>

                                    <TabsContent value="text" className="space-y-2 mt-3">
                                        <Textarea
                                            id={`comment-${card.statementId}`}
                                            value={postsort.card_comments?.[card.statementId] || ''}
                                            onChange={(e) =>
                                                handleCommentChange(
                                                    card.statementId,
                                                    e.target.value
                                                )
                                            }
                                            onBlur={() =>
                                                setTouched((prev) => ({
                                                    ...prev,
                                                    [card.statementId]: true,
                                                }))
                                            }
                                            className={`
                                                min-h-[100px] text-base border-slate-300
                                                ${!isValid && isTouched ? 'border-red-400 focus:ring-red-200 bg-red-50' : ''}
                                            `}
                                            placeholder={t('post.extreme.placeholder')}
                                            disabled={
                                                !!getAudioRecording(`card_${card.statementId}`)
                                            }
                                            data-testid="extreme-comment-input"
                                        />
                                        {getAudioRecording(`card_${card.statementId}`) && (
                                            <p className="text-sm text-amber-600 flex items-center gap-1.5">
                                                <AlertCircle size={14} />
                                                {t(
                                                    'post.audio.text_disabled',
                                                    'Audio response recorded. Delete audio to edit text.'
                                                )}
                                            </p>
                                        )}
                                    </TabsContent>

                                    <TabsContent value="audio" className="space-y-2 mt-3">
                                        <AudioRecorder
                                            questionKey={`card_${card.statementId}`}
                                            maxDurationSeconds={maxDurationSeconds}
                                            onRecordingComplete={async (blob, duration) => {
                                                await handleAudioUpload(
                                                    `card_${card.statementId}`,
                                                    blob,
                                                    duration
                                                );
                                            }}
                                            onRecordingDeleted={async () => {
                                                await handleAudioDelete(`card_${card.statementId}`);
                                            }}
                                            existingRecording={getAudioRecording(
                                                `card_${card.statementId}`
                                            )}
                                        />
                                    </TabsContent>
                                </Tabs>

                                {!isValid && isTouched && (
                                    <div className="flex items-center gap-1.5 mt-2 text-red-600 text-sm animate-in fade-in slide-in-from-top-1">
                                        <AlertCircle size={16} />
                                        <span>
                                            {t(
                                                'post.extreme.required',
                                                'Please provide either a text or audio response.'
                                            )}
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            <hr className="border-slate-200" />

            {/* 2. OPTIONAL COMMENTS */}
            {allowRandomComments && (
                <div className="space-y-6">
                    <div className="space-y-1">
                        <h2 className="text-xl font-bold text-slate-800">
                            {getPrompt(
                                'random_comments_label',
                                'post.optional.title',
                                'Did any statements feel particularly surprising, unclear, or confusing to you? If so, why?'
                            )}
                        </h2>
                        <p className="text-slate-600">
                            {t(
                                'post.optional.description',
                                'You are also welcome to add comments to any other statement if you would like to further explain your choices.'
                            )}
                        </p>
                    </div>

                    <div className="w-full">
                        <select
                            className="w-full p-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-[var(--brand-accent)] focus:ring-opacity-20 bg-white truncate pr-10"
                            onChange={(e) => {
                                if (e.target.value) {
                                    const id = parseInt(e.target.value, 10);
                                    if (!Number.isNaN(id)) {
                                        if (!postsort.card_comments?.[id]) {
                                            handleCommentChange(id, ''); // Init empty
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
                            {qsort
                                .filter((s) => {
                                    const isExtreme = extremeCards.some(
                                        (e) => e.statementId === s.statementId
                                    );
                                    const isAdded =
                                        postsort.card_comments &&
                                        Object.hasOwn(postsort.card_comments, s.statementId);
                                    return !isExtreme && !isAdded;
                                })
                                .sort((a, b) => a.statementId - b.statementId)
                                .map((s) => {
                                    const text = getCardText(s.statementId);
                                    const truncateLen = isDesktop ? 80 : 35;
                                    const displayLabel =
                                        text.length > truncateLen
                                            ? `${text.substring(0, truncateLen)}...`
                                            : text;
                                    return (
                                        <option key={s.statementId} value={s.statementId}>
                                            {`S${s.statementId}: ${displayLabel}`}
                                        </option>
                                    );
                                })}
                        </select>
                    </div>

                    <div className="space-y-4">
                        {Object.keys(postsort.card_comments || {}).map((key) => {
                            const id = parseInt(key, 10);
                            if (extremeCards.some((c) => c.statementId === id)) return null;

                            const cardPlacement = qsort.find((c) => c.statementId === id);
                            if (!cardPlacement) return null;

                            const colDef = gridColumns[cardPlacement.col];
                            const scoreVal = colDef ? colDef.score : 0;
                            const scoreLabel = scoreVal > 0 ? `+${scoreVal}` : `${scoreVal}`;

                            return (
                                <div
                                    key={id}
                                    className="p-4 md:p-6 rounded-xl border border-slate-200 shadow-sm bg-white relative group animate-in fade-in slide-in-from-top-2"
                                >
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const current = { ...postsort.card_comments };
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
                                        <span className="px-2 py-1 rounded-md text-xs font-bold uppercase tracking-wider bg-slate-100 text-slate-700">
                                            {t('post.score')}: {scoreLabel}
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

                                    <Tabs defaultValue="text" className="w-full">
                                        <TabsList className="grid w-full grid-cols-2">
                                            <TabsTrigger value="text">
                                                {t('post.response_type.text', 'Text')}
                                            </TabsTrigger>
                                            <TabsTrigger value="audio" disabled={!isAudioEnabled}>
                                                <Mic className="w-4 h-4 mr-1" />
                                                {t('post.response_type.audio', 'Audio')}
                                            </TabsTrigger>
                                        </TabsList>

                                        <TabsContent value="text" className="space-y-2 mt-3">
                                            <Textarea
                                                value={postsort.card_comments[id]}
                                                onChange={(e) =>
                                                    handleCommentChange(id, e.target.value)
                                                }
                                                placeholder={t('post.optional.placeholder')}
                                                className="min-h-[100px] border-slate-300"
                                                disabled={!!getAudioRecording(`card_${id}`)}
                                            />
                                            {getAudioRecording(`card_${id}`) && (
                                                <p className="text-sm text-amber-600 flex items-center gap-1.5">
                                                    <AlertCircle size={14} />
                                                    {t(
                                                        'post.audio.text_disabled',
                                                        'Audio response recorded. Delete audio to edit text.'
                                                    )}
                                                </p>
                                            )}
                                        </TabsContent>

                                        <TabsContent value="audio" className="space-y-2 mt-3">
                                            <AudioRecorder
                                                questionKey={`card_${id}`}
                                                maxDurationSeconds={maxDurationSeconds}
                                                onRecordingComplete={async (blob, duration) => {
                                                    await handleAudioUpload(
                                                        `card_${id}`,
                                                        blob,
                                                        duration
                                                    );
                                                }}
                                                onRecordingDeleted={async () => {
                                                    await handleAudioDelete(`card_${id}`);
                                                }}
                                                existingRecording={getAudioRecording(`card_${id}`)}
                                            />
                                        </TabsContent>
                                    </Tabs>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* 3. MISSING STATEMENTS (NEW) */}
            {allowMissingStatements && (
                <>
                    <hr className="border-slate-200" />
                    <div className="space-y-4">
                        <Label className="text-xl font-bold text-slate-800 block">
                            {getPrompt(
                                'missing_statements_label',
                                'admin.design.postsort.missing.title',
                                'Were there any important perspectives, issues, or statements that you felt were missing from this set?'
                            )}
                        </Label>
                        <p className="text-slate-600">
                            {t(
                                'admin.design.postsort.missing.desc',
                                'If yes, please describe them briefly.'
                            )}
                        </p>

                        <Tabs defaultValue="text" className="w-full">
                            <TabsList className="grid w-full grid-cols-2">
                                <TabsTrigger value="text">
                                    {t('post.response_type.text', 'Text')}
                                </TabsTrigger>
                                <TabsTrigger value="audio" disabled={!isAudioEnabled}>
                                    <Mic className="w-4 h-4 mr-1" />
                                    {t('post.response_type.audio', 'Audio')}
                                </TabsTrigger>
                            </TabsList>

                            <TabsContent value="text" className="space-y-2 mt-3">
                                <Label className="sr-only" htmlFor="missing-statements">
                                    Missing Statements Input
                                </Label>
                                <Textarea
                                    id="missing-statements"
                                    value={postsort.missing_statement || ''}
                                    onChange={(e) =>
                                        setPostSortResponse('missing_statement', e.target.value)
                                    }
                                    placeholder={getPrompt(
                                        'missing_statements',
                                        'admin.design.postsort.missing.prompt_placeholder'
                                    )}
                                    className="min-h-[120px] text-base border-slate-300"
                                    disabled={!!getAudioRecording('missing_statement')}
                                />
                                {getAudioRecording('missing_statement') && (
                                    <p className="text-sm text-amber-600 flex items-center gap-1.5">
                                        <AlertCircle size={14} />
                                        {t(
                                            'post.audio.text_disabled',
                                            'Audio response recorded. Delete audio to edit text.'
                                        )}
                                    </p>
                                )}
                            </TabsContent>

                            <TabsContent value="audio" className="space-y-2 mt-3">
                                <AudioRecorder
                                    questionKey="missing_statement"
                                    maxDurationSeconds={maxDurationSeconds}
                                    onRecordingComplete={async (blob, duration) => {
                                        await handleAudioUpload(
                                            'missing_statement',
                                            blob,
                                            duration
                                        );
                                    }}
                                    onRecordingDeleted={async () => {
                                        await handleAudioDelete('missing_statement');
                                    }}
                                    existingRecording={getAudioRecording('missing_statement')}
                                />
                            </TabsContent>
                        </Tabs>
                    </div>
                </>
            )}

            {/* NAVIGATION ACTIONS */}
            <div className="flex justify-end gap-4 pt-8 sticky bottom-0 bg-gradient-to-t from-white via-white to-transparent pb-4 z-10">
                <Button variant="outline" onClick={() => navigate('../fine-sort')}>
                    ← {t('post.back', 'Back to sort')}
                </Button>
                <Button
                    onClick={handleNext}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white min-w-[140px] shadow-md shadow-indigo-200"
                >
                    {t('common.next', 'Next Step')} <ArrowRight size={18} className="ml-2" />
                </Button>
            </div>
        </div>
    );
};
