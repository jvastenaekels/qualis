import type { StudyTranslationRead as StudyTranslation } from '@/api/model/studyTranslationRead';
import { useTranslation } from 'react-i18next';
import { useStudyDesigner } from '@/store/useStudyDesigner';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Info } from 'lucide-react';
import type React from 'react';
import MarkdownEditor from './MarkdownEditor';

const IntroductionEditor = () => {
    const { t } = useTranslation();
    const { draft, activeLocale, updateTranslation } = useStudyDesigner();

    if (!draft) return null;

    const translation = draft.translations?.find((t) => t.language_code === activeLocale);
    const hasConsent =
        translation?.consent_title !== null && translation?.consent_title !== undefined;

    const handleChange = (field: keyof StudyTranslation, value: string) => {
        updateTranslation(activeLocale, (t_trans: any) => {
            (t_trans as any)[field] = value;
        });
    };

    const _toggleConsent = (checked: boolean) => {
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
                    Welcome message
                </div>

                <Card className="shadow-sm">
                    <CardContent className="pt-6 space-y-4">
                        <div className="grid gap-2">
                            <Label htmlFor="title" className="text-sm font-semibold">
                                Study title
                            </Label>
                            <Input
                                id="title"
                                value={translation?.title || ''}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                    handleChange('title', e.target.value)
                                }
                                placeholder="Enter public title..."
                                className="font-semibold text-lg"
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label
                                htmlFor="subtitle"
                                className="text-sm font-semibold text-slate-500"
                            >
                                Subtitle (optional)
                            </Label>
                            <Input
                                id="subtitle"
                                value={translation?.subtitle || ''}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                    handleChange('subtitle', e.target.value)
                                }
                                placeholder="A brief catchphrase..."
                            />
                        </div>
                        <div className="grid gap-2">
                            <MarkdownEditor
                                id="objective"
                                label="Study objective"
                                value={translation?.objective || ''}
                                onChange={(val: string) => handleChange('objective', val)}
                                placeholder="What is the research question or purpose of this study?"
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
                        Custom process explanation
                    </div>
                    <Switch
                        id="enable-instructions"
                        checked={
                            translation?.instructions !== null &&
                            translation?.instructions !== undefined
                        }
                        onCheckedChange={(checked: boolean) => {
                            if (checked) {
                                handleChange('instructions', '');
                            } else {
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
                                    label="Task overview"
                                    value={translation?.instructions || ''}
                                    onChange={(val: string) => handleChange('instructions', val)}
                                    placeholder="Briefly explain the study process to participants (optional)..."
                                    className="min-h-[200px]"
                                />
                            </div>
                        </CardContent>
                    </Card>
                )}
            </section>

            <section className="space-y-4 pb-12">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-primary font-semibold text-lg">
                        <span className="bg-primary/10 p-1 rounded">
                            <Info className="h-5 w-5" />
                        </span>
                        Custom consent form
                    </div>
                    <Switch
                        id="enable-consent"
                        checked={hasConsent}
                        onCheckedChange={(checked: boolean) => {
                            if (checked) {
                                updateTranslation(activeLocale, (t_trans: any) => {
                                    t_trans.consent_title =
                                        t_trans.consent_title || t('consent.title');
                                    t_trans.consent_description =
                                        t_trans.consent_description || t('consent.default_text');
                                });
                            } else {
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
                            <CardTitle className="text-sm">Consent form details</CardTitle>
                            <CardDescription>
                                Participants must agree to these terms before starting.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid gap-2">
                                <Label htmlFor="consent-title">Consent title</Label>
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
                                    label="Legal text / agreement"
                                    value={translation?.consent_description || ''}
                                    onChange={(val: string) =>
                                        handleChange('consent_description', val)
                                    }
                                    placeholder="Enter the full legal agreement text..."
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
