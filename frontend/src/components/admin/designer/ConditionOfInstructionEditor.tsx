import type { StudyTranslationRead as StudyTranslation } from '@/api/model/studyTranslationRead';
import { useTranslation } from 'react-i18next';
import { useStudyDesigner } from '@/store/useStudyDesigner';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Target, Info } from 'lucide-react';
import type React from 'react';
import MarkdownEditor from './MarkdownEditor';

const ConditionOfInstructionEditor = () => {
    const { t } = useTranslation();
    const { draft, activeLocale, updateTranslation } = useStudyDesigner();

    if (!draft) return null;

    const translation = draft.translations?.find((t) => t.language_code === activeLocale);
    const hasPreInstruction =
        translation?.pre_instruction !== null && translation?.pre_instruction !== undefined;

    const handleChange = (field: keyof StudyTranslation, value: string | null) => {
        // biome-ignore lint/suspicious/noExplicitAny: dynamic field update on translation object
        updateTranslation(activeLocale, (t_trans: any) => {
            // biome-ignore lint/suspicious/noExplicitAny: dynamic field access
            (t_trans as any)[field] = value;
        });
    };

    return (
        <div className="space-y-12 min-h-[500px]">
            <section className="space-y-6">
                <div className="flex items-center gap-3 text-slate-900 font-bold text-xl tracking-tight">
                    <div className="bg-indigo-50 p-2 rounded-xl border border-indigo-100 shadow-sm">
                        <Target className="h-5 w-5 text-indigo-600" />
                    </div>
                    {t('admin.design.condition.title')}
                </div>

                <Card className="border-none shadow-sm bg-white rounded-2xl overflow-hidden">
                    <CardHeader className="pb-4">
                        <CardTitle className="text-base font-bold text-slate-900 tracking-tight">
                            {t('admin.design.condition.label')}
                        </CardTitle>
                        <CardDescription className="text-sm font-medium text-slate-500 italic">
                            {t('admin.design.condition.desc')}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="grid gap-3">
                            <Label
                                htmlFor="condition_of_instruction"
                                className="text-[10px] font-black uppercase tracking-wider text-slate-500"
                            >
                                {t('admin.design.condition.field_label')}
                            </Label>
                            <Input
                                id="condition_of_instruction"
                                value={translation?.condition_of_instruction || ''}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                    handleChange('condition_of_instruction', e.target.value)
                                }
                                placeholder={t('admin.design.condition.placeholder')}
                                className="font-bold text-lg h-12 rounded-xl border-slate-200 bg-slate-50/30 focus:bg-white focus:ring-indigo-500/20 transition-all px-4"
                            />
                        </div>
                    </CardContent>
                </Card>
            </section>

            <section className="space-y-6">
                <div className="flex items-center justify-between bg-indigo-50/50 p-4 rounded-2xl border border-indigo-100 shadow-sm transition-all hover:bg-indigo-50">
                    <div className="flex items-center gap-4 text-slate-900 font-bold text-lg tracking-tight">
                        <div className="bg-white p-2 rounded-xl border border-indigo-100 shadow-sm">
                            <Info className="h-5 w-5 text-indigo-600" />
                        </div>
                        {t('admin.design.condition.enable_pre')}
                    </div>
                    <Switch
                        id="enable-pre-instruction"
                        checked={hasPreInstruction}
                        onCheckedChange={(checked: boolean) => {
                            if (checked === hasPreInstruction) return;
                            if (checked) {
                                handleChange('pre_instruction', '');
                            } else {
                                handleChange('pre_instruction', null);
                            }
                        }}
                    />
                </div>

                {hasPreInstruction && (
                    <Card className="border-none shadow-sm bg-white rounded-2xl overflow-hidden animate-in slide-in-from-top-4 duration-500">
                        <CardContent className="pt-8">
                            <div className="grid gap-3">
                                <MarkdownEditor
                                    id="pre_instruction"
                                    label={t('admin.design.condition.pre_label')}
                                    value={translation?.pre_instruction || ''}
                                    onChange={(val: string) => handleChange('pre_instruction', val)}
                                    placeholder={t('admin.design.condition.pre_desc')}
                                    className="min-h-[250px]"
                                />
                            </div>
                        </CardContent>
                    </Card>
                )}
            </section>

            <section className="bg-amber-50/50 border border-amber-100 rounded-2xl p-8 shadow-sm">
                <h4 className="text-base font-black text-amber-900 mb-3 flex items-center gap-3 tracking-tight">
                    <div className="bg-white p-2 rounded-xl border border-amber-200 shadow-sm">
                        <Target className="h-5 w-5 text-amber-600" />
                    </div>
                    {t('admin.design.condition.tips.title')}
                </h4>
                <p className="text-sm font-bold text-amber-800/70 leading-relaxed max-w-2xl">
                    {t('admin.design.condition.tips.desc')}
                </p>
            </section>
        </div>
    );
};

export default ConditionOfInstructionEditor;
