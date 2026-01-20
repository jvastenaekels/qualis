import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardTitle, CardHeader } from '@/components/ui/card';
import { Check, Loader2, ArrowLeft } from 'lucide-react';
import { useResponseStore } from '@/store/useResponseStore';
import { useConfigStore } from '@/store/useConfigStore';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { SurveyField } from '@/components/survey/SurveyField';

import { evaluateVisibilityCondition } from '@/utils/visibilityEvaluator';

interface Step2Props {
    onBack: () => void;
    onSubmit: () => void; // Trigger parent submission
    isLoading: boolean;
}

export const Step2_Questionnaire: React.FC<Step2Props> = ({ onBack, onSubmit, isLoading }) => {
    const { t } = useTranslation();
    const config = useConfigStore((state) => state.config);
    const { postsort } = useResponseStore((state) => ({ postsort: state.postsort }));
    const setPostSortResponse = useResponseStore((state) => state.setPostSortResponse);

    // --- Config Logic ---
    const questions = useMemo(() => config?.postsort_config?.questions, [config]);

    const emailEnabled = config?.postsort_config?.email_collection_enabled;
    const interviewConsentEnabled = config?.postsort_config?.interview_consent_enabled ?? true;
    const newsletterConsentEnabled = config?.postsort_config?.newsletter_consent_enabled ?? true;

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

            const shape: Record<string, z.ZodTypeAny> = {};
            Object.entries(questions).forEach(([key, field]) => {
                const isVisible = evaluateVisibilityCondition(field.visibility_condition, data);
                if (!isVisible) {
                    shape[key] = z.any().optional();
                    return;
                }

                let fieldSchema: z.ZodTypeAny;
                if (field.type === 'number') {
                    fieldSchema = z.coerce.number();
                    if (field.min !== undefined)
                        fieldSchema = (fieldSchema as z.ZodNumber).min(
                            field.min,
                            `Min: ${field.min}`
                        );
                    if (field.max !== undefined)
                        fieldSchema = (fieldSchema as z.ZodNumber).max(
                            field.max,
                            `Max: ${field.max}`
                        );
                } else if (field.type === 'email') {
                    fieldSchema = z.string().email('Invalid email');
                } else if (field.type === 'checkbox') {
                    fieldSchema = z.array(z.string());
                } else {
                    fieldSchema = z.string();
                    if (field.minLength)
                        fieldSchema = (fieldSchema as z.ZodString).min(field.minLength);
                    if (field.maxLength)
                        fieldSchema = (fieldSchema as z.ZodString).max(field.maxLength);
                }

                if (field.required) {
                    if (field.type === 'checkbox')
                        shape[key] = (fieldSchema as z.ZodArray<z.ZodString>).min(
                            1,
                            t('presort.error_required')
                        );
                    else
                        shape[key] = (fieldSchema as z.ZodTypeAny).refine(
                            (val) => val !== undefined && val !== '' && val !== null,
                            { message: t('presort.error_required') }
                        );
                } else {
                    shape[key] = fieldSchema.optional().nullable();
                }
            });

            return zodResolver(z.object(shape))(data, context, options);
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

    const handleFinalSubmit = async () => {
        const isFormValid = await triggerFormValidation();
        const emailValid = isEmailValid();

        if (isFormValid && emailValid) {
            onSubmit();
        } else {
            // Scroll to error
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    };

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
            {/* 3. CUSTOM QUESTIONS */}
            {questions && Object.keys(questions).length > 0 && (
                <div className="space-y-6">
                    <h2 className="text-xl font-bold text-slate-800">
                        {t('admin.design.postsort.custom.title', 'Questions')}
                    </h2>
                    {Object.entries(questions).map(([key, fieldConfig]) => {
                        const isVisible = evaluateVisibilityCondition(
                            fieldConfig.visibility_condition,
                            currentValues
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
                                    {fieldConfig.label &&
                                        (typeof fieldConfig.label === 'string'
                                            ? fieldConfig.label
                                            : fieldConfig.label[Object.keys(fieldConfig.label)[0]])}
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
                                    <p className="text-red-500 text-sm mt-1">
                                        {(formErrors[key]?.message as string) ||
                                            t('presort.error_required')}
                                    </p>
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
                        <CardTitle className="text-lg text-blue-900 flex items-center gap-2">
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
                                        {t(
                                            'post.contact.error_invalid_email',
                                            'Please enter a valid email address'
                                        )}
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
                                        <p className="text-[10px] text-slate-400 font-medium leading-tight max-w-sm animate-in fade-in slide-in-from-top-1">
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

            <div className="flex justify-between gap-4 pt-8 sticky bottom-0 z-10">
                <Button variant="outline" onClick={onBack} disabled={isLoading}>
                    <ArrowLeft size={18} className="mr-2" />
                    {t('common.back', 'Back')}
                </Button>

                <Button
                    onClick={handleFinalSubmit}
                    data-testid="postsort-submit-btn"
                    className="bg-indigo-600 hover:bg-indigo-700 text-white min-w-[200px]"
                    disabled={isLoading}
                >
                    {isLoading ? (
                        <Loader2 className="w-6 h-6 animate-spin" />
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
