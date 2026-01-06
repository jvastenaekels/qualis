import { useStudyDesigner } from '@/store/useStudyDesigner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { RefreshCcw, MousePointerClick, ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const InterfaceEditor = () => {
    const { draft, activeLocale, updateTranslation, setActiveSubStep } = useStudyDesigner();
    const { t } = useTranslation();

    if (!draft) return null;

    const translation = draft.translations?.find((t) => t.language_code === activeLocale);
    const uiLabels = translation?.ui_labels || {};

    const updateLabel = (key: string, value: string) => {
        updateTranslation(activeLocale, (t: any) => {
            if (!t.ui_labels) t.ui_labels = {};
            if (!value) {
                delete t.ui_labels[key];
            } else {
                t.ui_labels[key] = value;
            }
        });
    };

    const getLabel = (key: string) => (uiLabels[key] || t(key)) as string;

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-2 text-primary font-semibold text-lg">
                <MousePointerClick className="h-5 w-5" />
                Interface customization
            </div>

            <p className="text-sm text-muted-foreground">
                Customize the buttons and labels of the interface to match your study's tone (e.g.,
                changing "Agree/Disagree" to "Like/Dislike").
            </p>

            {/* Navigation & Actions */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                        <ArrowRight className="h-4 w-4" /> Navigation buttons
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Start button</Label>
                            <Input
                                value={getLabel('welcome.start')}
                                onChange={(e) => updateLabel('welcome.start', e.target.value)}
                                onFocus={() => setActiveSubStep('welcome.start')}
                                placeholder="Get Started"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Next step button</Label>
                            <Input
                                value={getLabel('common.next')}
                                onChange={(e) => updateLabel('common.next', e.target.value)}
                                onFocus={() => setActiveSubStep('common.next')}
                                placeholder="Next step"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Submit button</Label>
                            <Input
                                value={getLabel('post.submit')}
                                onChange={(e) => updateLabel('post.submit', e.target.value)}
                                onFocus={() => setActiveSubStep('post.submit')}
                                placeholder="Share my perspective"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Confirm Sort button</Label>
                            <Input
                                value={getLabel('fine.actions.validate')}
                                onChange={(e) =>
                                    updateLabel('fine.actions.validate', e.target.value)
                                }
                                onFocus={() => setActiveSubStep('fine.actions.validate')}
                                placeholder="Confirm Sort"
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Sorting Terminology */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                        <RefreshCcw className="h-4 w-4" /> Sorting terminology
                    </CardTitle>
                    <CardDescription>
                        Define the labels for the spontaneous sort and the grid spectrum.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="space-y-4">
                        <Label className="text-xs text-muted-foreground uppercase tracking-wider">
                            Rough Sort Labels
                        </Label>
                        <div className="grid grid-cols-3 gap-4">
                            <div className="space-y-2">
                                <Label>Agree</Label>
                                <Input
                                    value={getLabel('common.agree')}
                                    onChange={(e) => updateLabel('common.agree', e.target.value)}
                                    onFocus={() => setActiveSubStep('common.agree')}
                                    placeholder="Agree"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Neutral</Label>
                                <Input
                                    value={getLabel('common.neutral')}
                                    onChange={(e) => updateLabel('common.neutral', e.target.value)}
                                    onFocus={() => setActiveSubStep('common.neutral')}
                                    placeholder="Neutral"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Disagree</Label>
                                <Input
                                    value={getLabel('common.disagree')}
                                    onChange={(e) => updateLabel('common.disagree', e.target.value)}
                                    onFocus={() => setActiveSubStep('common.disagree')}
                                    placeholder="Disagree"
                                />
                            </div>
                        </div>

                        <Separator />

                        <div className="space-y-2">
                            <Label className="text-xs text-muted-foreground uppercase tracking-wider">
                                Grid Legends (extremes)
                            </Label>
                            <div className="grid grid-cols-3 gap-4">
                                <div className="space-y-2">
                                    <Label>Most Agree</Label>
                                    <Input
                                        value={getLabel('fine.legend.agree')}
                                        onChange={(e) =>
                                            updateLabel('fine.legend.agree', e.target.value)
                                        }
                                        onFocus={() => setActiveSubStep('fine.legend.agree')}
                                        placeholder="Most Agree"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Neutral</Label>
                                    <Input
                                        value={getLabel('fine.legend.neutral')}
                                        onChange={(e) =>
                                            updateLabel('fine.legend.neutral', e.target.value)
                                        }
                                        onFocus={() => setActiveSubStep('fine.legend.neutral')}
                                        placeholder="Neutral"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Most Disagree</Label>
                                    <Input
                                        value={getLabel('fine.legend.disagree')}
                                        onChange={(e) =>
                                            updateLabel('fine.legend.disagree', e.target.value)
                                        }
                                        onFocus={() => setActiveSubStep('fine.legend.disagree')}
                                        placeholder="Most Disagree"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};

export default InterfaceEditor;
