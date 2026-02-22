import { useStudyDesigner } from '@/store/useStudyDesigner';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Hand, Clipboard, ShieldCheck, Settings2, RotateCcw } from 'lucide-react';
import type React from 'react';
import MarkdownEditor from './MarkdownEditor';
import { ProcessStepEditor } from './ProcessStepEditor';
import { useTranslation } from 'react-i18next';
import type { StudyTranslationRead } from '@/api/model';
import { Button } from '@/components/ui/button';
import { createResetToDefaultHandler } from '@/utils/studyResetHelpers';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { SUPPORTED_LANGUAGES, type Language } from '@/constants/languages';
import { MultiLangFieldIcon } from './MultiLangFieldIcon';

const IntroductionEditor = ({ readOnly }: { readOnly?: boolean }) => {
    const { t } = useTranslation();
    const { draft, activeLocale, updateTranslation, updateDraft } = useStudyDesigner();

    if (!draft) return null;

    const translation = draft.translations?.find((t) => t.language_code === activeLocale);

    const handleChange = (field: keyof StudyTranslationRead, value: string) => {
        // biome-ignore lint/suspicious/noExplicitAny: complex state update
        updateTranslation(activeLocale, (t_trans: any) => {
            // biome-ignore lint/suspicious/noExplicitAny: complex state update
            (t_trans as any)[field] = value;
        });
    };

    const resetField = createResetToDefaultHandler(updateDraft, t);

    const resetInstructions = () => resetField('instructions');

    const resetConsent = () => {
        if (window.confirm(t('common.reset_to_default_confirm'))) {
            resetField('consent_title');
            resetField('consent_description');
        }
    };

    return (
        <div className="space-y-12 pb-12">
            {/* General Settings */}
            <section className="space-y-6">
                <div className="flex items-center gap-3 text-slate-900 font-bold text-xl tracking-tight">
                    <div className="bg-indigo-50 p-2 rounded-xl border border-indigo-100 shadow-sm">
                        <Settings2 className="h-5 w-5 text-indigo-600" />
                    </div>
                    {t('admin.design.intro.general_settings')}
                </div>

                <Card className="border-none shadow-sm bg-white rounded-2xl overflow-hidden">
                    <CardContent className="pt-6 space-y-6">
                        <div className="grid gap-2.5">
                            <Label className="text-[10px] font-black text-slate-500">
                                {t('admin.design.intro.fields.default_lang')}
                            </Label>
                            <Select
                                value={
                                    draft.default_language ||
                                    draft.translations?.[0]?.language_code ||
                                    'en'
                                }
                                onValueChange={(val) =>
                                    updateDraft((d) => {
                                        d.default_language = val;
                                    })
                                }
                                disabled={readOnly}
                            >
                                <SelectTrigger className="w-full h-11 rounded-xl font-medium">
                                    <SelectValue
                                        placeholder={t('admin.design.toolbar.select_lang')}
                                    />
                                </SelectTrigger>
                                <SelectContent className="rounded-xl">
                                    {draft.translations?.map((trans) => {
                                        const lang = SUPPORTED_LANGUAGES.find(
                                            (l: Language) => l.code === trans.language_code
                                        );
                                        return (
                                            <SelectItem
                                                key={trans.language_code}
                                                value={trans.language_code}
                                                className="rounded-lg"
                                            >
                                                {lang?.label || trans.language_code}
                                            </SelectItem>
                                        );
                                    })}
                                </SelectContent>
                            </Select>
                            <p className="text-[11px] text-slate-500 font-medium px-1">
                                {t('admin.design.intro.fields.default_lang_help')}
                            </p>
                        </div>
                    </CardContent>
                </Card>
            </section>

            {/* Welcome Section */}
            <section className="space-y-6">
                <div className="flex items-center gap-3 text-slate-900 font-bold text-xl tracking-tight">
                    <div className="bg-indigo-50 p-2 rounded-xl border border-indigo-100 shadow-sm">
                        <Hand className="h-5 w-5 text-indigo-600" />
                    </div>
                    {t('admin.design.intro.welcome_title')}
                </div>

                <Card className="border-none shadow-sm bg-white rounded-2xl overflow-hidden">
                    <CardContent className="pt-6 space-y-6">
                        <div className="grid gap-2.5">
                            <Label
                                htmlFor="title"
                                className="text-[10px] font-black text-slate-500 flex items-center gap-2"
                            >
                                {t('admin.design.intro.fields.title')}
                                <MultiLangFieldIcon
                                    activeLocale={activeLocale}
                                    translations={
                                        draft.translations?.reduce(
                                            (acc, tr) => {
                                                if (tr.title) acc[tr.language_code] = tr.title;
                                                return acc;
                                            },
                                            {} as Record<string, string>
                                        ) || {}
                                    }
                                />
                            </Label>
                            <Input
                                id="title"
                                value={translation?.title || ''}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                    handleChange('title', e.target.value)
                                }
                                placeholder={t('admin.design.intro.fields.title_placeholder')}
                                className="font-bold text-lg h-11 rounded-xl"
                                disabled={readOnly}
                            />
                        </div>
                        <div className="grid gap-2.5">
                            <Label
                                htmlFor="subtitle"
                                className="text-[10px] font-black text-slate-500 flex items-center gap-2"
                            >
                                {t('admin.design.intro.fields.subtitle')}
                                <MultiLangFieldIcon
                                    activeLocale={activeLocale}
                                    translations={
                                        draft.translations?.reduce(
                                            (acc, tr) => {
                                                if (tr.subtitle)
                                                    acc[tr.language_code] = tr.subtitle;
                                                return acc;
                                            },
                                            {} as Record<string, string>
                                        ) || {}
                                    }
                                />
                            </Label>
                            <Input
                                id="subtitle"
                                value={translation?.subtitle || ''}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                    handleChange('subtitle', e.target.value)
                                }
                                placeholder={t('admin.design.intro.fields.subtitle_placeholder')}
                                className="font-medium h-10 rounded-xl"
                                disabled={readOnly}
                            />
                        </div>
                        <div className="flex items-center gap-2 mb-2">
                            <Label className="text-[10px] font-black text-slate-500">
                                {t('admin.design.intro.fields.objective')}
                            </Label>
                            <MultiLangFieldIcon
                                activeLocale={activeLocale}
                                translations={
                                    draft.translations?.reduce(
                                        (acc, tr) => {
                                            if (tr.objective) acc[tr.language_code] = tr.objective;
                                            return acc;
                                        },
                                        {} as Record<string, string>
                                    ) || {}
                                }
                            />
                        </div>
                        <MarkdownEditor
                            id="objective"
                            label=""
                            value={translation?.objective || ''}
                            onChange={(val: string) => handleChange('objective', val)}
                            placeholder={t('admin.design.intro.fields.objective_placeholder')}
                            readOnly={readOnly}
                        />
                    </CardContent>
                </Card>
            </section>

            {/* Process Overview Section */}
            <section className="space-y-6">
                <div className="flex items-center gap-3 text-slate-900 font-bold text-xl tracking-tight">
                    <div className="bg-indigo-50 p-2 rounded-xl border border-indigo-100 shadow-sm">
                        <Clipboard className="h-5 w-5 text-indigo-600" />
                    </div>
                    {t('admin.design.intro.process_title')}
                </div>

                <Card className="border-none shadow-sm bg-white rounded-2xl overflow-hidden">
                    <CardContent className="pt-6">
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Label className="text-[10px] font-black text-slate-500">
                                        {t('admin.design.intro.fields.task_overview')}
                                    </Label>
                                    <MultiLangFieldIcon
                                        activeLocale={activeLocale}
                                        translations={
                                            draft.translations?.reduce(
                                                (acc, tr) => {
                                                    if (tr.instructions)
                                                        acc[tr.language_code] = tr.instructions;
                                                    return acc;
                                                },
                                                {} as Record<string, string>
                                            ) || {}
                                        }
                                    />
                                </div>
                                {!readOnly && (
                                    <button
                                        type="button"
                                        onClick={resetInstructions}
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px]
                                                 font-black text-slate-500
                                                 hover:bg-slate-100 hover:text-indigo-600 transition-colors
                                                 shadow-sm border bg-white"
                                    >
                                        <RotateCcw className="size-3" />
                                        {t('common.reset_to_default')}
                                    </button>
                                )}
                            </div>
                            <MarkdownEditor
                                id="instructions"
                                value={translation?.instructions || ''}
                                onChange={(val: string) => handleChange('instructions', val)}
                                placeholder={t('admin.design.intro.fields.task_placeholder')}
                                readOnly={readOnly}
                            />
                        </div>
                    </CardContent>
                </Card>

                <ProcessStepEditor readOnly={readOnly} />
            </section>

            {/* Consent Section (Mandatory) */}
            <section className="space-y-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 text-slate-900 font-bold text-xl tracking-tight">
                        <div className="bg-indigo-50 p-2 rounded-xl border border-indigo-100 shadow-sm">
                            <ShieldCheck className="h-5 w-5 text-indigo-600" />
                        </div>
                        {t('admin.design.intro.consent_title')}
                    </div>
                </div>

                <Card className="border-none shadow-sm bg-slate-50/50 rounded-2xl overflow-hidden border border-slate-200/60">
                    <CardHeader className="pb-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle className="text-sm font-bold">
                                    {t('admin.design.intro.consent_details')}
                                </CardTitle>
                                <CardDescription className="text-xs font-medium text-slate-500">
                                    {t('admin.design.intro.consent_desc')}
                                </CardDescription>
                            </div>
                            {!readOnly && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={resetConsent}
                                    className="text-slate-500 hover:text-indigo-600 rounded-xl font-bold px-4"
                                >
                                    <RotateCcw className="size-4 mr-2" />
                                    {t('admin.design.reset_defaults')}
                                </Button>
                            )}
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="grid gap-2.5">
                            <Label
                                htmlFor="consent-title"
                                className="text-[10px] font-black text-slate-500 flex items-center gap-2"
                            >
                                {t('admin.design.intro.fields.consent_title_label')}
                                <MultiLangFieldIcon
                                    activeLocale={activeLocale}
                                    translations={
                                        draft.translations?.reduce(
                                            (acc, tr) => {
                                                if (tr.consent_title)
                                                    acc[tr.language_code] = tr.consent_title;
                                                return acc;
                                            },
                                            {} as Record<string, string>
                                        ) || {}
                                    }
                                />
                            </Label>
                            <Input
                                id="consent-title"
                                value={translation?.consent_title || ''}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                    handleChange('consent_title', e.target.value)
                                }
                                className="font-bold text-sm h-10 rounded-xl"
                                disabled={readOnly}
                            />
                        </div>
                        <div className="flex items-center gap-2 mb-2">
                            <Label className="text-[10px] font-black text-slate-500">
                                {t('admin.design.intro.fields.legal_text')}
                            </Label>
                            <MultiLangFieldIcon
                                activeLocale={activeLocale}
                                translations={
                                    draft.translations?.reduce(
                                        (acc, tr) => {
                                            if (tr.consent_description)
                                                acc[tr.language_code] = tr.consent_description;
                                            return acc;
                                        },
                                        {} as Record<string, string>
                                    ) || {}
                                }
                            />
                        </div>
                        <MarkdownEditor
                            id="consent-description"
                            label=""
                            value={translation?.consent_description || ''}
                            onChange={(val: string) => handleChange('consent_description', val)}
                            placeholder={t('admin.design.intro.fields.legal_placeholder')}
                            readOnly={readOnly}
                        />
                    </CardContent>
                </Card>
            </section>
        </div>
    );
};

export default IntroductionEditor;
