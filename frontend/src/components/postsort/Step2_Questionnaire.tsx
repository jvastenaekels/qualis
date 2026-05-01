import React, { useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardTitle, CardHeader } from '@/components/ui/card';
import { Check, Loader2, ArrowLeft, AlertCircle } from 'lucide-react';
import { useResponseStore } from '@/store/useResponseStore';
import { useConfigStore } from '@/store/useConfigStore';
import { useSessionStore } from '@/store/useSessionStore';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { SurveyField } from '@/components/survey/SurveyField';
import { AudioRecorder } from '@/components/audio/AudioRecorder';
import {
    uploadAudioApiAudioUploadPost,
    deleteAudioRecordingApiAudioRecordingIdDelete,
} from '@/api/generated';
import { toast } from 'sonner';

import { evaluateVisibilityCondition } from '@/utils/visibilityEvaluator';
import { buildQuestionnaireSchema } from '@/utils/buildQuestionnaireSchema';
import { getLocalizedText } from '@/utils/localization';

interface Step2Props {
    onBack: () => void;
    onSubmit: () => void; // Trigger parent submission
    isLoading: boolean;
}

export const Step2_Questionnaire: React.FC<Step2Props> = ({ onBack, onSubmit, isLoading }) => {
    const { t, i18n } = useTranslation();
    const config = useConfigStore((state) => state.config);
    const { postsort } = useResponseStore((state) => ({ postsort: state.postsort }));
    const setPostSortResponse = useResponseStore((state) => state.setPostSortResponse);
    const setAudioRecording = useResponseStore((state) => state.setAudioRecording);
    const deleteAudioRecordingStore = useResponseStore((state) => state.deleteAudioRecording);
    const getAudioRecording = useResponseStore((state) => state.getAudioRecording);
    const token = useSessionStore((state) => state.token);
    const isPilotMode = useSessionStore((state) => state.isPilotMode);

    // Track in-progress uploads to block submission
    const [uploadingKeys, setUploadingKeys] = useState<Set<string>>(new Set());
    const [audioUnsupported, setAudioUnsupported] = useState(false);

    // --- Config Logic ---
    const questions = useMemo(() => config?.postsort_config?.questions, [config]);

    const emailEnabled = config?.postsort_config?.email_collection_enabled;
    const interviewConsentEnabled = config?.postsort_config?.interview_consent_enabled ?? true;
    const newsletterConsentEnabled = config?.postsort_config?.newsletter_consent_enabled ?? true;

    // Audio configuration
    const audioConfig = config?.postsort_config?.audio;
    const isAudioEnabled = audioConfig?.enabled ?? false;
    const maxDurationSeconds = audioConfig?.max_duration_seconds ?? 180;
    const isAudioEffectivelyEnabled = isAudioEnabled && !audioUnsupported;

    // Whether to show the audio section for a given question
    // text_audio questions always show audio (it's part of the question type)
    // Other questions only show audio when global audio is enabled
    const showAudioSection = useCallback(
        (questionKey: string, isTextAudio = false): boolean =>
            isTextAudio || isAudioEffectivelyEnabled || !!getAudioRecording(questionKey),
        [isAudioEffectivelyEnabled, getAudioRecording]
    );

    // --- Audio Handlers ---
    const handleAudioError = useCallback(
        (type: 'mic_denied' | 'mic_revoked' | 'recorder_error' | 'empty_blob' | 'unsupported') => {
            if (type === 'unsupported') {
                setAudioUnsupported(true);
            }
        },
        []
    );

    const performAudioUpload = useCallback(
        async (questionKey: string, blob: Blob, duration: number) => {
            setUploadingKeys((prev) => new Set(prev).add(questionKey));
            try {
                const extension = blob.type.includes('mp4') ? 'mp4' : 'webm';
                const file = new File([blob], `recording_${Date.now()}.${extension}`, {
                    type: blob.type,
                });

                if (!token) {
                    throw new Error('Session token missing');
                }

                const response = await uploadAudioApiAudioUploadPost({
                    file,
                    session_token: token,
                    question_key: questionKey,
                    duration_seconds: duration,
                });

                setAudioRecording(questionKey, {
                    id: response.recording_id,
                    question_key: questionKey,
                    file_size_bytes: response.file_size_bytes,
                    duration_seconds: duration,
                    presigned_url: response.presigned_url,
                    created_at: new Date().toISOString(),
                    url_expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
                });
            } catch (error) {
                console.error('Audio upload failed:', error);
                toast.error(t('audio.upload_failed', 'Upload failed. Please try again.'));
                throw error;
            } finally {
                setUploadingKeys((prev) => {
                    const next = new Set(prev);
                    next.delete(questionKey);
                    return next;
                });
            }
        },
        [token, setAudioRecording, t]
    );

    const handleAudioUpload = useCallback(
        async (questionKey: string, blob: Blob, duration: number) => {
            if (isPilotMode) {
                const existing = getAudioRecording(questionKey);
                if (existing?.presigned_url?.startsWith('blob:')) {
                    URL.revokeObjectURL(existing.presigned_url);
                }
                setAudioRecording(questionKey, {
                    id: -1,
                    question_key: questionKey,
                    file_size_bytes: blob.size,
                    duration_seconds: duration,
                    presigned_url: URL.createObjectURL(blob),
                    created_at: new Date().toISOString(),
                    url_expires_at: undefined,
                });
                // Clear text_audio validation error for this key (audio now provided)
                const bareKey = questionKey.replace(/^question_/, '');
                setTextAudioErrors((prev) => {
                    if (!prev[bareKey]) return prev;
                    const next = { ...prev };
                    delete next[bareKey];
                    return next;
                });
                return;
            }

            if (!token) {
                toast.error(t('audio.error.no_token', 'Session token missing'));
                return;
            }
            await performAudioUpload(questionKey, blob, duration);
            // Clear text_audio validation error for this key (audio now provided)
            const bareKey = questionKey.replace(/^question_/, '');
            setTextAudioErrors((prev) => {
                if (!prev[bareKey]) return prev;
                const next = { ...prev };
                delete next[bareKey];
                return next;
            });
        },
        [isPilotMode, getAudioRecording, setAudioRecording, token, t, performAudioUpload]
    );

    const handleAudioDelete = useCallback(
        async (questionKey: string) => {
            const recording = getAudioRecording(questionKey);
            if (!recording) return;

            if (isPilotMode) {
                deleteAudioRecordingStore(questionKey);
                return;
            }

            if (!token) return;

            try {
                await deleteAudioRecordingApiAudioRecordingIdDelete(recording.id, {
                    session_token: token,
                });
                deleteAudioRecordingStore(questionKey);
            } catch (error) {
                console.error('Audio deletion failed:', error);
                toast.error(t('audio.delete_failed', 'Could not delete the recording. Try again.'));
            }
        },
        [getAudioRecording, isPilotMode, deleteAudioRecordingStore, token, t]
    );

    // --- Form Logic ---
    const {
        register,
        trigger: triggerFormValidation,
        watch,
        formState: { errors: formErrors },
    } = useForm({
        mode: 'onChange',
        resolver: async (data, context, options) => {
            if (!questions) return zodResolver(z.object({}))(data, context, options);
            const schema = buildQuestionnaireSchema(questions, data, t);
            return zodResolver(schema)(data, context, options);
        },
        defaultValues: postsort.questions_answers,
    });

    const currentValues = watch();

    // Auto-save form data
    React.useEffect(() => {
        const subscription = watch((value) => {
            // biome-ignore lint/suspicious/noExplicitAny: form value type mismatch
            setPostSortResponse('questions_answers', value as any);
        });
        return () => subscription.unsubscribe();
    }, [watch, setPostSortResponse]);

    // --- Validation ---
    const isEmailValid = () => {
        const email = postsort.email;
        if (!email) return true;
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    };

    const isUploadInProgress = uploadingKeys.size > 0;

    // Track text_audio validation errors separately (not handled by Zod)
    const [textAudioErrors, setTextAudioErrors] = useState<Record<string, string>>({});

    const handleFinalSubmit = async () => {
        if (isUploadInProgress) {
            toast.info(
                t('audio.error.upload_in_progress', 'Please wait for audio upload to finish.')
            );
            return;
        }

        const isFormValid = await triggerFormValidation();
        const emailValid = isEmailValid();

        // Validate required text_audio fields: need text OR audio
        // Audio is intrinsic to text_audio questions (independent of global audio toggle)
        const newTextAudioErrors: Record<string, string> = {};
        if (questions) {
            for (const [key, field] of Object.entries(questions)) {
                if (field.type === 'text_audio' && field.required) {
                    const isVisible = evaluateVisibilityCondition(
                        field.visibility_condition,
                        currentValues,
                        questions
                    );
                    if (!isVisible) continue;

                    const hasText = !!(currentValues[key] && String(currentValues[key]).trim());
                    const hasAudio = !!getAudioRecording(`question_${key}`);
                    if (!hasText && !hasAudio) {
                        newTextAudioErrors[key] = t(
                            'post.text_audio_required',
                            'Please provide either a text or audio response.'
                        );
                    }
                }
            }
        }
        setTextAudioErrors(newTextAudioErrors);

        const textAudioValid = Object.keys(newTextAudioErrors).length === 0;

        if (isFormValid && emailValid && textAudioValid) {
            onSubmit();
        } else {
            const el = document.getElementById('main-scroll-container');
            if (el && typeof el.scrollTo === 'function') {
                el.scrollTo({ top: 0, behavior: 'smooth' });
            }
        }
    };

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
            {/* 3. CUSTOM QUESTIONS */}
            {questions && Object.keys(questions).length > 0 && (
                <div className="space-y-6">
                    {Object.entries(questions).map(([key, fieldConfig]) => {
                        const isVisible = evaluateVisibilityCondition(
                            fieldConfig.visibility_condition,
                            currentValues,
                            questions
                        );
                        if (!isVisible) return null;

                        return (
                            <div
                                key={key}
                                className="bg-white p-4 md:p-6 rounded-xl border border-slate-200 shadow-sm transition-all hover:border-slate-300"
                            >
                                <label
                                    htmlFor={key}
                                    className="block text-sm font-bold text-slate-800 mb-2"
                                >
                                    {getLocalizedText(fieldConfig.label, i18n.language)}
                                    {fieldConfig.required && (
                                        <span className="text-red-500 ml-1">*</span>
                                    )}
                                </label>
                                <div className="space-y-4">
                                    <SurveyField
                                        id={key}
                                        fieldConfig={fieldConfig}
                                        register={register}
                                    />
                                    {fieldConfig.type === 'text_audio' &&
                                        showAudioSection(`question_${key}`, true) && (
                                            <AudioRecorder
                                                questionKey={`question_${key}`}
                                                maxDurationSeconds={maxDurationSeconds}
                                                onRecordingComplete={async (blob, duration) => {
                                                    await handleAudioUpload(
                                                        `question_${key}`,
                                                        blob,
                                                        duration
                                                    );
                                                }}
                                                onRecordingDeleted={async () => {
                                                    await handleAudioDelete(`question_${key}`);
                                                }}
                                                existingRecording={getAudioRecording(
                                                    `question_${key}`
                                                )}
                                                sessionToken={token || undefined}
                                                onError={handleAudioError}
                                            />
                                        )}
                                </div>
                                {formErrors[key] && (
                                    <p className="text-red-500 text-sm mt-1">
                                        {(formErrors[key]?.message as string) ||
                                            t('presort.error_required')}
                                    </p>
                                )}
                                {textAudioErrors[key] && (
                                    <div className="flex items-center gap-1.5 mt-2 text-red-600 text-sm animate-in fade-in slide-in-from-top-1">
                                        <AlertCircle size={16} />
                                        <span>{textAudioErrors[key]}</span>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Email / Contact Section */}
            {(emailEnabled || interviewConsentEnabled || newsletterConsentEnabled) && (
                <Card className="border-blue-100 bg-blue-50/50 shadow-sm">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-lg font-black text-blue-900 flex items-center gap-2">
                            ✉️ {t('post.contact.title', 'Contact')}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {emailEnabled && (
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
                                    value={postsort.email || ''}
                                    onChange={(e) => setPostSortResponse('email', e.target.value)}
                                    className={`bg-white border-blue-200 focus:border-blue-400 focus:ring-blue-400 ${!isEmailValid() ? 'border-red-500 focus:border-red-500' : ''}`}
                                />
                                {!isEmailValid() && (
                                    <p
                                        className="text-red-500 text-xs mt-1"
                                        data-testid="postsort-email-error"
                                    >
                                        {t('post.contact.error_invalid_email')}
                                    </p>
                                )}
                            </div>
                        )}

                        {interviewConsentEnabled && (
                            <div className="flex items-start space-x-3 pt-2">
                                <Checkbox
                                    id="contact-consent-interview"
                                    checked={postsort.interview_consent || false}
                                    onCheckedChange={(checked) =>
                                        setPostSortResponse('interview_consent', checked === true)
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
                                    {postsort.interview_consent && (
                                        <p className="text-2xs text-slate-400 font-medium leading-tight max-w-sm animate-in fade-in slide-in-from-top-1">
                                            {t('post.contact.pseudonymization_note')}
                                        </p>
                                    )}
                                </div>
                            </div>
                        )}

                        {newsletterConsentEnabled && (
                            <div className="flex items-start space-x-3 pt-2">
                                <Checkbox
                                    id="contact-consent-newsletter"
                                    checked={postsort.newsletter_consent || false}
                                    onCheckedChange={(checked) =>
                                        setPostSortResponse('newsletter_consent', checked === true)
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

            <div className="flex flex-col-reverse sm:flex-row justify-between gap-4 pt-8 sticky bottom-0 bg-gradient-to-t from-white via-white to-transparent pb-4 z-10">
                <Button variant="outline" onClick={onBack} disabled={isLoading}>
                    <ArrowLeft size={18} className="mr-2" />
                    {t('common.back', 'Back')}
                </Button>

                <Button
                    onClick={handleFinalSubmit}
                    data-testid="postsort-submit-btn"
                    className="bg-indigo-600 hover:bg-indigo-700 text-white min-w-full sm:min-w-[200px]"
                    disabled={isLoading || isUploadInProgress}
                >
                    {isLoading ? (
                        <Loader2 className="w-6 h-6 animate-spin" />
                    ) : isUploadInProgress ? (
                        <>
                            <Loader2 className="w-5 h-5 animate-spin mr-2" />
                            <span>{t('audio.uploading', 'Uploading...')}</span>
                        </>
                    ) : (
                        <>
                            <span>{t('post.submit', 'Submit Study')}</span>
                            <Check size={20} className="ml-2" strokeWidth={3} />
                        </>
                    )}
                </Button>
            </div>
        </div>
    );
};
