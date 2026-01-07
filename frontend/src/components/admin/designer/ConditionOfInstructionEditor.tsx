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
        <div className="space-y-8">
            <section className="space-y-4">
                <div className="flex items-center gap-2 text-primary font-semibold text-lg">
                    <span className="bg-primary/10 p-1 rounded">
                        <Target className="h-5 w-5" />
                    </span>
                    {t('admin.design.condition.title')}
                </div>

                <Card className="shadow-sm border-blue-200 bg-blue-50/50">
                    <CardHeader>
                        <CardTitle className="text-sm font-bold text-blue-900">
                            {t('admin.design.condition.label')}
                        </CardTitle>
                        <CardDescription className="text-blue-800">
                            {t('admin.design.condition.desc')}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid gap-2">
                            <Label
                                htmlFor="condition_of_instruction"
                                className="text-sm font-semibold text-blue-900"
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
                                className="font-bold text-lg bg-white border-blue-200 focus-visible:ring-blue-500"
                            />
                        </div>
                    </CardContent>
                </Card>
            </section>

            <section className="space-y-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-primary font-semibold text-lg">
                        <span className="bg-primary/10 p-1 rounded">
                            <Info className="h-5 w-5" />
                        </span>
                        {t('admin.design.condition.enable_pre')}
                    </div>
                    <Switch
                        id="enable-pre-instruction"
                        checked={hasPreInstruction}
                        onCheckedChange={(checked: boolean) => {
                            // Defensive check to prevent infinite loops
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
                    <Card className="shadow-sm">
                        <CardContent className="pt-6">
                            <div className="grid gap-2">
                                <MarkdownEditor
                                    id="pre_instruction"
                                    label={t('admin.design.condition.pre_label')}
                                    value={translation?.pre_instruction || ''}
                                    onChange={(val: string) => handleChange('pre_instruction', val)}
                                    placeholder={t('admin.design.condition.pre_desc')}
                                    className="min-h-[200px]"
                                />
                            </div>
                        </CardContent>
                    </Card>
                )}
            </section>

            <section className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-amber-900 mb-2 flex items-center gap-2">
                    <Target className="h-4 w-4" /> {t('admin.design.condition.tips.title')}
                </h4>
                <p className="text-sm text-amber-700">{t('admin.design.condition.tips.desc')}</p>
            </section>
        </div>
    );
};

export default ConditionOfInstructionEditor;
