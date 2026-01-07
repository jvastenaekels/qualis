import { useStudyDesigner } from '@/store/useStudyDesigner';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Info } from 'lucide-react';
import type React from 'react';
import MarkdownEditor from './MarkdownEditor';
import { ProcessStepEditor } from './ProcessStepEditor';
import { useTranslation } from 'react-i18next';
import type { StudyTranslation } from '@/api/model';

const IntroductionEditor = () => {
    const { t } = useTranslation();
    const { draft, activeLocale, updateTranslation } = useStudyDesigner();

    if (!draft) return null;

    const translation = draft.translations?.find((t) => t.language_code === activeLocale);
    const hasConsent =
        translation?.consent_title !== null && translation?.consent_title !== undefined;

    const handleChange = (field: keyof StudyTranslation, value: string) => {
        // biome-ignore lint/suspicious/noExplicitAny: complex state update
        updateTranslation(activeLocale, (t_trans: any) => {
            // biome-ignore lint/suspicious/noExplicitAny: complex state update
            (t_trans as any)[field] = value;
        });
    };

    const _toggleConsent = (checked: boolean) => {
        // biome-ignore lint/suspicious/noExplicitAny: complex state update
        updateTranslation(activeLocale, (t_trans: any) => {
            if (checked) {
                t_trans.consent_title = t_trans.consent_title || t('consent.title');
                t_trans.consent_description =
                    t_trans.consent_description || t('consent.default_text');
                t_trans.consent_accept = t_trans.consent_accept || t('welcome.consent.label');
                t_trans.consent_decline = t_trans.consent_decline || t('common.close');
            } else {
                t_trans.consent_title = null;
                t_trans.consent_description = null;
                t_trans.consent_accept = null;
                t_trans.consent_decline = null;
            }
        });
    };

    return (
        <div className="space-y-8">
            <section className="space-y-4">
                <div className="flex items-center gap-2 text-primary font-semibold text-lg">
                    <span className="bg-primary/10 p-1 rounded">
                        <Info className="h-5 w-5" />
                    </span>
                    {t('admin.design.intro.welcome_title')}
                </div>

                <Card className="shadow-sm">
                    <CardContent className="pt-6 space-y-4">
                        <div className="grid gap-2">
                            <Label htmlFor="title" className="text-sm font-semibold">
                                {t('admin.design.intro.fields.title')}
                            </Label>
                            <Input
                                id="title"
                                value={translation?.title || ''}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                    handleChange('title', e.target.value)
                                }
                                placeholder={t('admin.design.intro.fields.title_placeholder')}
                                className="font-semibold text-lg"
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label
                                htmlFor="subtitle"
                                className="text-sm font-semibold text-slate-500"
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
                            />
                        </div>
                        <div className="grid gap-2">
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

            <section className="space-y-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-primary font-semibold text-lg">
                        <span className="bg-primary/10 p-1 rounded">
                            <Info className="h-5 w-5" />
                        </span>
                        {t('admin.design.intro.process_title')}
                    </div>
                    <Switch
                        id="enable-instructions"
                        aria-label={t('admin.design.intro.process_title')}
                        checked={
                            translation?.instructions !== null &&
                            translation?.instructions !== undefined
                        }
                        onCheckedChange={(checked: boolean) => {
                            const currentlyEnabled =
                                translation?.instructions !== null &&
                                translation?.instructions !== undefined;
                            // Defensive check to prevent infinite loops
                            if (checked === currentlyEnabled) return;
                            if (checked) {
                                handleChange('instructions', '');
                            } else {
                                // biome-ignore lint/suspicious/noExplicitAny: nulling field
                                handleChange('instructions', null as any);
                            }
                        }}
                    />
                </div>

                {translation?.instructions !== undefined && translation?.instructions !== null && (
                    <Card className="shadow-sm">
                        <CardContent className="pt-6">
                            <div className="grid gap-2">
                                <MarkdownEditor
                                    id="instructions"
                                    label={t('admin.design.intro.fields.task_overview')}
                                    value={translation?.instructions || ''}
                                    onChange={(val: string) => handleChange('instructions', val)}
                                    placeholder={t('admin.design.intro.fields.task_placeholder')}
                                    minRows={2}
                                    maxRows={2}
                                />
                            </div>
                        </CardContent>
                    </Card>
                )}

                <ProcessStepEditor />
            </section>

            <section className="space-y-4 pb-12">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-primary font-semibold text-lg">
                        <span className="bg-primary/10 p-1 rounded">
                            <Info className="h-5 w-5" />
                        </span>
                        {t('admin.design.intro.consent_title')}
                    </div>
                    <Switch
                        id="enable-consent"
                        aria-label={t('admin.design.intro.consent_title')}
                        checked={hasConsent}
                        onCheckedChange={(checked: boolean) => {
                            // Defensive check to prevent infinite loops
                            if (checked === hasConsent) return;
                            if (checked) {
                                // biome-ignore lint/suspicious/noExplicitAny: complex state update
                                updateTranslation(activeLocale, (t_trans: any) => {
                                    t_trans.consent_title =
                                        t_trans.consent_title || t('consent.title');
                                    t_trans.consent_description =
                                        t_trans.consent_description || t('consent.default_text');
                                });
                            } else {
                                // biome-ignore lint/suspicious/noExplicitAny: complex state update
                                updateTranslation(activeLocale, (t_trans: any) => {
                                    t_trans.consent_title = null;
                                    t_trans.consent_description = null;
                                });
                            }
                        }}
                    />
                </div>

                {hasConsent && (
                    <Card className="shadow-sm border-primary/20 bg-primary/5">
                        <CardHeader>
                            <CardTitle className="text-sm">
                                {t('admin.design.intro.consent_details')}
                            </CardTitle>
                            <CardDescription>
                                {t('admin.design.intro.consent_desc')}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid gap-2">
                                <Label htmlFor="consent-title">
                                    {t('admin.design.intro.fields.consent_title_label')}
                                </Label>
                                <Input
                                    id="consent-title"
                                    value={translation?.consent_title || ''}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                        handleChange('consent_title', e.target.value)
                                    }
                                />
                            </div>
                            <div className="grid gap-2">
                                <MarkdownEditor
                                    id="consent-description"
                                    label={t('admin.design.intro.fields.legal_text')}
                                    value={translation?.consent_description || ''}
                                    onChange={(val: string) =>
                                        handleChange('consent_description', val)
                                    }
                                    placeholder={t('admin.design.intro.fields.legal_placeholder')}
                                />
                            </div>
                        </CardContent>
                    </Card>
                )}
            </section>
        </div>
    );
};

export default IntroductionEditor;
