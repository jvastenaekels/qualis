import { useStudyDesigner } from '@/store/useStudyDesigner';
import { useAuthStore } from '@/store/useAuthStore';
import { usePermission } from '@/hooks/usePermission';
import { useAdminContext } from '@/hooks/useAdminContext';
import { MemoSection } from '@/components/admin/memo/MemoSection';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
    Accordion,
    AccordionItem,
    AccordionTrigger,
    AccordionContent,
} from '@/components/ui/accordion';
import { Hand, Clipboard, ShieldCheck, Settings2, RotateCcw, BookOpen } from 'lucide-react';
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

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: declarative shell with many accordion sections; hook calls for memo context (useAuthStore, usePermission, useAdminContext) add scope without meaningful branching
const IntroductionEditor = ({ readOnly }: { readOnly?: boolean }) => {
    const { t } = useTranslation();
    const { draft, original, activeLocale, updateTranslation, updateDraft } = useStudyDesigner();
    const { user: currentUser } = useAuthStore();
    const { role: projectRole } = usePermission();
    const { project } = useAdminContext();
    const projectMembers = (project?.members ?? []).map((m) => ({
        user_id: m.user_id,
        display_name: m.user.full_name ?? m.user.email,
    }));

    if (!draft) return null;

    const translation = draft.translations?.find((t) => t.language_code === activeLocale);

    const handleChange = (field: keyof StudyTranslationRead, value: string) => {
        updateTranslation(activeLocale, (t_trans) => {
            // keyof StudyTranslationRead ⊇ keyof DraftTranslation for all editable fields;
            // the double cast through unknown is needed because TS cannot prove the index
            // signature aligns, even though all editable field names are shared.
            (t_trans as unknown as Record<string, unknown>)[field as string] = value;
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
                            <Label className="text-2xs font-black text-slate-500">
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
                            <p className="text-xs text-slate-500 font-medium px-1">
                                {t('admin.design.intro.fields.default_lang_help')}
                            </p>
                        </div>
                    </CardContent>
                </Card>
            </section>

            {/* Wave B — Progressive disclosure: keep "Paramètres généraux"
                always visible (1 select), collapse the 4 substantive sections
                in an Accordion with only "Présentation" expanded by default.
                Reduces above-fold cognitive load on first contact with the
                Design page (audit REPORT.md finding 🔴1). */}
            <Accordion type="multiple" defaultValue={['presentation']} className="space-y-6">
                {/* Welcome / Présentation Section — open by default */}
                <AccordionItem
                    value="presentation"
                    className="border-none rounded-2xl bg-white shadow-sm overflow-hidden"
                >
                    <AccordionTrigger className="px-5 py-4 hover:no-underline data-[state=open]:border-b data-[state=open]:border-slate-100">
                        <div className="flex items-center gap-3 text-slate-900 font-bold text-xl tracking-tight flex-1">
                            <div className="bg-indigo-50 p-2 rounded-xl border border-indigo-100 shadow-sm">
                                <Hand className="h-5 w-5 text-indigo-600" />
                            </div>
                            {t('admin.design.intro.welcome_title')}
                        </div>
                    </AccordionTrigger>
                    <AccordionContent>
                        <CardContent className="pt-6 space-y-6">
                            <div className="grid gap-2.5">
                                <Label
                                    htmlFor="title"
                                    className="text-2xs font-black text-slate-500 flex items-center gap-2"
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
                                    className="text-2xs font-black text-slate-500 flex items-center gap-2"
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
                                    placeholder={t(
                                        'admin.design.intro.fields.subtitle_placeholder'
                                    )}
                                    className="font-medium h-10 rounded-xl"
                                    disabled={readOnly}
                                />
                            </div>
                            <div className="flex items-center gap-2 mb-2">
                                <Label className="text-2xs font-black text-slate-500">
                                    {t('admin.design.intro.fields.objective')}
                                </Label>
                                <MultiLangFieldIcon
                                    activeLocale={activeLocale}
                                    translations={
                                        draft.translations?.reduce(
                                            (acc, tr) => {
                                                if (tr.objective)
                                                    acc[tr.language_code] = tr.objective;
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
                    </AccordionContent>
                </AccordionItem>

                {/* Process Overview Section — collapsed by default */}
                <AccordionItem
                    value="process"
                    className="border-none rounded-2xl bg-white shadow-sm overflow-hidden"
                >
                    <AccordionTrigger className="px-5 py-4 hover:no-underline data-[state=open]:border-b data-[state=open]:border-slate-100">
                        <div className="flex items-center gap-3 text-slate-900 font-bold text-xl tracking-tight flex-1">
                            <div className="bg-indigo-50 p-2 rounded-xl border border-indigo-100 shadow-sm">
                                <Clipboard className="h-5 w-5 text-indigo-600" />
                            </div>
                            {t('admin.design.intro.process_title')}
                        </div>
                    </AccordionTrigger>
                    <AccordionContent>
                        <CardContent className="pt-6 space-y-6">
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Label className="text-2xs font-black text-slate-500">
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
                                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-2xs
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
                            <ProcessStepEditor readOnly={readOnly} />
                        </CardContent>
                    </AccordionContent>
                </AccordionItem>

                {/* Consent Section (Mandatory) — collapsed by default */}
                <AccordionItem
                    value="consent"
                    className="border-none rounded-2xl bg-slate-50/50 shadow-sm overflow-hidden"
                >
                    <AccordionTrigger className="px-5 py-4 hover:no-underline data-[state=open]:border-b data-[state=open]:border-slate-200/60">
                        <div className="flex items-center gap-3 text-slate-900 font-bold text-xl tracking-tight flex-1">
                            <div className="bg-indigo-50 p-2 rounded-xl border border-indigo-100 shadow-sm">
                                <ShieldCheck className="h-5 w-5 text-indigo-600" />
                            </div>
                            {t('admin.design.intro.consent_title')}
                        </div>
                    </AccordionTrigger>
                    <AccordionContent>
                        <CardHeader className="pb-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle className="text-sm font-black">
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
                                    className="text-2xs font-black text-slate-500 flex items-center gap-2"
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
                                <Label className="text-2xs font-black text-slate-500">
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
                    </AccordionContent>
                </AccordionItem>

                {/* Methodology memo — language-neutral free text. Mirrors the
                    per-concourse Mémo de construction; surfaces the rationale
                    behind distribution / conditions of instruction / Q-set
                    size for replication and pre-registration documentation. */}
                <AccordionItem
                    value="memo"
                    className="border-none rounded-2xl bg-slate-50/50 shadow-sm overflow-hidden"
                >
                    <AccordionTrigger className="px-5 py-4 hover:no-underline data-[state=open]:border-b data-[state=open]:border-slate-200/60">
                        <div className="flex items-center gap-3 text-slate-900 font-bold text-xl tracking-tight flex-1">
                            <div className="bg-indigo-50 p-2 rounded-xl border border-indigo-100 shadow-sm">
                                <BookOpen className="h-5 w-5 text-indigo-600" />
                            </div>
                            <div className="flex flex-col items-start">
                                <span>{t('admin.memo.title_study', 'Methodology memo')}</span>
                                <span className="text-xs font-medium text-slate-500 mt-0.5">
                                    {t(
                                        'admin.memo.summary_empty_study',
                                        'Optional · for replication & pre-registration'
                                    )}
                                </span>
                            </div>
                        </div>
                    </AccordionTrigger>
                    <AccordionContent>
                        <div className="px-5 pb-5">
                            {original && currentUser && (
                                <MemoSection
                                    parentType="study"
                                    parentId={original.id}
                                    currentUserId={currentUser.id}
                                    isOwner={projectRole === 'owner'}
                                    canEdit={
                                        projectRole === 'owner' || projectRole === 'researcher'
                                    }
                                    members={projectMembers}
                                />
                            )}
                        </div>
                    </AccordionContent>
                </AccordionItem>
            </Accordion>
        </div>
    );
};

export default IntroductionEditor;
