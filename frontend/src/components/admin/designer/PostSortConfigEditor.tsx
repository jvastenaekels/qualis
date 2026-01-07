import { useStudyDesigner } from '@/store/useStudyDesigner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Info, Plus, X } from 'lucide-react';
import { useState } from 'react';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import QuestionBuilder from './QuestionBuilder';

import { useTranslation } from 'react-i18next';

const PostSortConfigEditor = () => {
    const { t } = useTranslation();
    const { draft, activeLocale, updateDraft } = useStudyDesigner();
    const [selectedScore, setSelectedScore] = useState<number | null>(null);

    if (!draft) return null;

    // biome-ignore lint/suspicious/noExplicitAny: complex config object
    const config = draft.postsort_config as any;

    const extremeColumns = config?.extreme_columns || [];
    const allowRandomComments = config?.allow_random_comments ?? true;
    const prompts = config?.prompts || {};

    const gridConfig = draft.grid_config as Array<{ score: number; capacity: number }> | undefined;
    const availableScores = gridConfig?.map((col) => col.score) || [];

    const getPromptText = (key: 'extreme'): string => {
        const prompt = prompts[key];
        if (!prompt) return '';
        if (typeof prompt === 'string') return prompt;
        return prompt[activeLocale] || prompt.en || '';
    };

    const setPromptText = (key: 'extreme', value: string) => {
        updateDraft((d) => {
            if (!d.postsort_config) d.postsort_config = {};
            // biome-ignore lint/suspicious/noExplicitAny: cast to any
            const ps = d.postsort_config as any;
            if (!ps.prompts) ps.prompts = {};
            const current = ps.prompts[key];

            if (!current) {
                ps.prompts[key] = { [activeLocale]: value };
            } else if (typeof current === 'string') {
                ps.prompts[key] = { en: current, [activeLocale]: value };
            } else {
                ps.prompts[key] = { ...current, [activeLocale]: value };
            }
        });
    };

    const addExtremeColumn = (score: number) => {
        updateDraft((d) => {
            if (!d.postsort_config) d.postsort_config = {};
            // biome-ignore lint/suspicious/noExplicitAny: cast to any
            const ps = d.postsort_config as any;
            const current = ps.extreme_columns || [];
            if (!current.includes(score)) {
                ps.extreme_columns = [...current, score].sort((a: number, b: number) => a - b);
            }
        });
        setSelectedScore(null);
    };

    const removeExtremeColumn = (score: number) => {
        updateDraft((d) => {
            // biome-ignore lint/suspicious/noExplicitAny: cast to any
            const ps = d.postsort_config as any;
            if (ps) {
                ps.extreme_columns = (ps.extreme_columns || []).filter((s: number) => s !== score);
            }
        });
    };

    const toggleAllowRandomComments = (checked: boolean) => {
        updateDraft((d) => {
            if (!d.postsort_config) d.postsort_config = {};
            // biome-ignore lint/suspicious/noExplicitAny: cast to any
            const ps = d.postsort_config as any;
            ps.allow_random_comments = checked;
        });
    };

    const unselectedScores = availableScores.filter((s) => !extremeColumns.includes(s));

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <span className="bg-primary/10 p-1 rounded">
                            <Info className="h-5 w-5 text-primary" />
                        </span>
                        {t('admin.design.postsort.extreme.title')}
                    </CardTitle>
                    <CardDescription>{t('admin.design.postsort.extreme.desc')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex flex-wrap gap-2">
                        {extremeColumns.length === 0 ? (
                            <p className="text-sm text-muted-foreground italic">
                                {t('admin.design.postsort.extreme.no_columns')}
                            </p>
                        ) : (
                            extremeColumns.map((score: number) => (
                                <Badge
                                    key={score}
                                    variant="secondary"
                                    className="px-3 py-1.5 text-sm font-mono flex items-center gap-2"
                                >
                                    {score > 0 ? '+' : ''}
                                    {score}
                                    <button
                                        type="button"
                                        onClick={() => removeExtremeColumn(score)}
                                        className="ml-1 hover:text-destructive transition-colors"
                                    >
                                        <X className="h-3 w-3" />
                                    </button>
                                </Badge>
                            ))
                        )}
                    </div>

                    {unselectedScores.length > 0 && (
                        <div className="flex items-center gap-2 pt-2 border-t">
                            <Label className="text-xs text-muted-foreground">
                                {t('admin.design.postsort.extreme.add_label')}
                            </Label>
                            <Select
                                value={selectedScore?.toString() || ''}
                                onValueChange={(val) => setSelectedScore(Number(val))}
                            >
                                <SelectTrigger className="w-32 h-8">
                                    <SelectValue
                                        placeholder={t(
                                            'admin.design.postsort.extreme.select_placeholder'
                                        )}
                                    />
                                </SelectTrigger>
                                <SelectContent>
                                    {unselectedScores.map((score) => (
                                        <SelectItem key={score} value={score.toString()}>
                                            {score > 0 ? '+' : ''}
                                            {score}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                    selectedScore !== null && addExtremeColumn(selectedScore)
                                }
                                disabled={selectedScore === null}
                                className="h-8"
                            >
                                <Plus className="h-3 w-3 mr-1" />{' '}
                                {t('admin.design.postsort.extreme.add')}
                            </Button>
                        </div>
                    )}

                    {extremeColumns.length > 0 && (
                        <div className="pt-4 border-t space-y-2">
                            <Label htmlFor="extreme-prompt">
                                {t('admin.design.postsort.extreme.prompt_label')}
                            </Label>
                            <Textarea
                                id="extreme-prompt"
                                value={getPromptText('extreme')}
                                onChange={(e) => setPromptText('extreme', e.target.value)}
                                placeholder={t('admin.design.postsort.extreme.prompt_placeholder')}
                                className="min-h-[80px]"
                            />
                        </div>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div className="space-y-1">
                            <CardTitle className="text-base">
                                {t('admin.design.postsort.random_comments.title')}
                            </CardTitle>
                            <CardDescription className="text-sm">
                                {t('admin.design.postsort.random_comments.desc')}
                            </CardDescription>
                        </div>
                        <Switch
                            checked={allowRandomComments}
                            onCheckedChange={(checked: boolean) => {
                                if (checked === allowRandomComments) return;
                                toggleAllowRandomComments(checked);
                            }}
                        />
                    </div>
                </CardHeader>
            </Card>

            <Card>
                <CardHeader>
                    <div className="space-y-1">
                        <CardTitle className="text-base">
                            {t('admin.design.postsort.custom.title')}
                        </CardTitle>
                        <CardDescription className="text-sm">
                            {t('admin.design.postsort.custom.desc')}
                        </CardDescription>
                    </div>
                </CardHeader>
                <CardContent>
                    <QuestionBuilder type="post" />
                </CardContent>
            </Card>

            <div className="flex items-center justify-between rounded-lg border p-4 bg-blue-50/50 border-blue-100 mt-4 shadow-sm group hover:border-blue-200 transition-colors">
                <div className="space-y-0.5">
                    <Label className="text-base flex items-center gap-2 text-blue-900">
                        {t('admin.design.postsort.email.title')}
                        <Badge
                            variant="outline"
                            className="text-[10px] font-bold uppercase tracking-wider bg-white/50"
                        >
                            {t('common.optional', 'Optional')}
                        </Badge>
                    </Label>
                    <p className="text-sm text-blue-800/60">
                        {t('admin.design.postsort.email.desc')}
                    </p>
                </div>
                <Switch
                    checked={config?.email_collection_enabled || false}
                    onCheckedChange={(checked: boolean) => {
                        const currentValue = config?.email_collection_enabled || false;
                        if (checked === currentValue) return;
                        updateDraft((d) => {
                            if (!d.postsort_config) d.postsort_config = {};
                            // biome-ignore lint/suspicious/noExplicitAny: complex config
                            (d.postsort_config as any).email_collection_enabled = checked;
                        });
                    }}
                />
            </div>
            {config?.email_collection_enabled && (
                <div className="ml-8 mt-2 space-y-3 border-l-2 border-blue-100 pl-6 animate-in slide-in-from-left-2 duration-300">
                    <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
                        <div className="flex items-center justify-between group/item mb-1">
                            <Label className="text-sm font-medium text-amber-900 group-hover/item:text-amber-950 transition-colors">
                                {t('admin.design.postsort.email.interview')}
                            </Label>
                            <Switch
                                checked={config?.interview_consent_enabled ?? true}
                                onCheckedChange={(checked: boolean) => {
                                    const currentValue = config?.interview_consent_enabled ?? true;
                                    if (checked === currentValue) return;
                                    updateDraft((d) => {
                                        if (!d.postsort_config) d.postsort_config = {};
                                        // biome-ignore lint/suspicious/noExplicitAny: complex config
                                        (d.postsort_config as any).interview_consent_enabled =
                                            checked;
                                    });
                                }}
                            />
                        </div>
                        <p className="text-xs text-amber-700">
                            {t('admin.design.postsort.email.interview_warning')}
                        </p>
                    </div>

                    <div className="flex items-center justify-between group/item py-2">
                        <div className="space-y-0.5">
                            <Label className="text-sm text-slate-600 group-hover/item:text-slate-900 transition-colors">
                                {t('admin.design.postsort.email.results')}
                            </Label>
                            <p className="text-xs text-muted-foreground">
                                {t('admin.design.postsort.email.results_hint')}
                            </p>
                        </div>
                        <Switch
                            checked={config?.newsletter_consent_enabled ?? true}
                            onCheckedChange={(checked: boolean) => {
                                const currentValue = config?.newsletter_consent_enabled ?? true;
                                if (checked === currentValue) return;
                                updateDraft((d) => {
                                    if (!d.postsort_config) d.postsort_config = {};
                                    // biome-ignore lint/suspicious/noExplicitAny: complex config
                                    (d.postsort_config as any).newsletter_consent_enabled = checked;
                                });
                            }}
                        />
                    </div>
                </div>
            )}
        </div>
    );
};

export default PostSortConfigEditor;
