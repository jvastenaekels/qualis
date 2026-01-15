import { useStudyDesigner } from '@/store/useStudyDesigner';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Hand, Clipboard, ShieldCheck } from 'lucide-react';
import type React from 'react';
import MarkdownEditor from './MarkdownEditor';
import { ProcessStepEditor } from './ProcessStepEditor';
import { useTranslation } from 'react-i18next';
import type { StudyTranslationRead } from '@/api/model';

const IntroductionEditor = () => {
    const { t } = useTranslation();
    const { draft, activeLocale, updateTranslation } = useStudyDesigner();

    if (!draft) return null;

    const translation = draft.translations?.find((t) => t.language_code === activeLocale);

    const handleChange = (field: keyof StudyTranslationRead, value: string) => {
        // biome-ignore lint/suspicious/noExplicitAny: complex state update
        updateTranslation(activeLocale, (t_trans: any) => {
            // biome-ignore lint/suspicious/noExplicitAny: complex state update
            (t_trans as any)[field] = value;
        });
    };

    return (
        <div className="space-y-12 pb-12">
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
                                className="text-[10px] font-black uppercase tracking-wider text-slate-500"
                            >
                                {t('admin.design.intro.fields.title')}
                            </Label>
                            <Input
                                id="title"
                                value={translation?.title || ''}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                    handleChange('title', e.target.value)
                                }
                                placeholder={t('admin.design.intro.fields.title_placeholder')}
                                className="font-bold text-lg h-11 rounded-xl"
                            />
                        </div>
                        <div className="grid gap-2.5">
                            <Label
                                htmlFor="subtitle"
                                className="text-[10px] font-black uppercase tracking-wider text-slate-500"
                            >
                                {t('admin.design.intro.fields.subtitle')}
                            </Label>
                            <Input
                                id="subtitle"
                                value={translation?.subtitle || ''}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                    handleChange('subtitle', e.target.value)
                                }
                                placeholder={t('admin.design.intro.fields.subtitle_placeholder')}
                                className="font-medium h-10 rounded-xl"
                            />
                        </div>
                        <div className="grid gap-2.5">
                            <MarkdownEditor
                                id="objective"
                                label={t('admin.design.intro.fields.objective')}
                                value={translation?.objective || ''}
                                onChange={(val: string) => handleChange('objective', val)}
                                placeholder={t('admin.design.intro.fields.objective_placeholder')}
                            />
                        </div>
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
                        <div className="grid gap-2.5">
                            <MarkdownEditor
                                id="instructions"
                                label={t('admin.design.intro.fields.task_overview')}
                                value={translation?.instructions || ''}
                                onChange={(val: string) => handleChange('instructions', val)}
                                placeholder={t('admin.design.intro.fields.task_placeholder')}
                            />
                        </div>
                    </CardContent>
                </Card>

                <ProcessStepEditor />
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
                        <CardTitle className="text-sm font-bold">
                            {t('admin.design.intro.consent_details')}
                        </CardTitle>
                        <CardDescription className="text-xs font-medium text-slate-500">
                            {t('admin.design.intro.consent_desc')}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="grid gap-2.5">
                            <Label
                                htmlFor="consent-title"
                                className="text-[10px] font-black uppercase tracking-wider text-slate-500"
                            >
                                {t('admin.design.intro.fields.consent_title_label')}
                            </Label>
                            <Input
                                id="consent-title"
                                value={translation?.consent_title || ''}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                    handleChange('consent_title', e.target.value)
                                }
                                className="font-bold text-sm h-10 rounded-xl"
                            />
                        </div>
                        <div className="grid gap-2.5">
                            <MarkdownEditor
                                id="consent-description"
                                label={t('admin.design.intro.fields.legal_text')}
                                value={translation?.consent_description || ''}
                                onChange={(val: string) => handleChange('consent_description', val)}
                                placeholder={t('admin.design.intro.fields.legal_placeholder')}
                            />
                        </div>
                    </CardContent>
                </Card>
            </section>
        </div>
    );
};

export default IntroductionEditor;
