import type { StudyTranslationRead as StudyTranslation } from '@/api/model/studyTranslationRead';
import { useTranslation } from 'react-i18next';
import { useStudyDesigner } from '@/store/useStudyDesigner';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Target, RotateCcw } from 'lucide-react';
import type React from 'react';
import { createResetToDefaultHandler } from '@/utils/studyResetHelpers';
import { MultiLangFieldIcon } from './MultiLangFieldIcon';

const ConditionOfInstructionEditor = ({ readOnly }: { readOnly?: boolean }) => {
    const { t } = useTranslation();
    const { draft, activeLocale, updateTranslation, updateDraft } = useStudyDesigner();

    const resetField = createResetToDefaultHandler(updateDraft, t);

    const resetInstruction = () => resetField('condition_of_instruction');
    const resetPreInstruction = () => resetField('pre_instruction');

    if (!draft) return null;

    const translation = draft.translations?.find((t) => t.language_code === activeLocale);

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
                            {t('admin.design.condition.pre_title', 'Preliminary Sort Instruction')}
                        </CardTitle>
                        <CardDescription className="text-sm font-medium text-slate-500 italic">
                            {t(
                                'admin.design.condition.pre_desc',
                                'Instruction given to participants during the initial rough sort.'
                            )}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="grid gap-3">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Label
                                        htmlFor="pre_instruction"
                                        className="text-[10px] font-black text-slate-500"
                                    >
                                        {t(
                                            'admin.design.condition.pre_field_label',
                                            'Instruction Text'
                                        )}
                                    </Label>
                                    <MultiLangFieldIcon
                                        activeLocale={activeLocale}
                                        translations={
                                            draft.translations?.reduce(
                                                (acc, tr) => {
                                                    if (tr.pre_instruction)
                                                        acc[tr.language_code] = tr.pre_instruction;
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
                                        onClick={resetPreInstruction}
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
                            <Input
                                id="pre_instruction"
                                value={translation?.pre_instruction || ''}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                    handleChange('pre_instruction', e.target.value)
                                }
                                placeholder={t(
                                    'admin.design.condition.pre_placeholder',
                                    'e.g. Based on your personal point of view...'
                                )}
                                className="font-bold text-lg h-12 rounded-xl border-slate-200 bg-slate-50/30 focus:bg-white focus:ring-indigo-500/20 transition-all px-4"
                                disabled={readOnly}
                            />
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-none shadow-sm bg-white rounded-2xl overflow-hidden">
                    <CardHeader className="pb-4">
                        <CardTitle className="text-base font-bold text-slate-900 tracking-tight">
                            {t('admin.design.condition.grid_title', 'Q-Sort Instruction')}
                        </CardTitle>
                        <CardDescription className="text-sm font-medium text-slate-500 italic">
                            {t(
                                'admin.design.condition.grid_desc',
                                'This is the core instruction guiding participants during the Q-Sort process.'
                            )}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="grid gap-3">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Label
                                        htmlFor="condition_of_instruction"
                                        className="text-[10px] font-black text-slate-500"
                                    >
                                        {t(
                                            'admin.design.condition.field_label',
                                            'Instruction Text'
                                        )}
                                    </Label>
                                    <MultiLangFieldIcon
                                        activeLocale={activeLocale}
                                        translations={
                                            draft.translations?.reduce(
                                                (acc, tr) => {
                                                    if (tr.condition_of_instruction)
                                                        acc[tr.language_code] =
                                                            tr.condition_of_instruction;
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
                                        onClick={resetInstruction}
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
                            <Input
                                id="condition_of_instruction"
                                value={translation?.condition_of_instruction || ''}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                    handleChange('condition_of_instruction', e.target.value)
                                }
                                placeholder={t(
                                    'admin.design.condition.placeholder',
                                    'e.g. Please rank the following statements...'
                                )}
                                className="font-bold text-lg h-12 rounded-xl border-slate-200 bg-slate-50/30 focus:bg-white focus:ring-indigo-500/20 transition-all px-4"
                                disabled={readOnly}
                            />
                        </div>
                    </CardContent>
                </Card>
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
