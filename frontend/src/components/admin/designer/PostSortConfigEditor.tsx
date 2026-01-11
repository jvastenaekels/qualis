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

    const getPromptText = (key: string): string => {
        const prompt = prompts[key];
        if (!prompt) return '';
        if (typeof prompt === 'string') return prompt;
        return prompt[activeLocale] || prompt.en || '';
    };

    const setPromptText = (key: string, value: string) => {
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
    const positiveColumns = extremeColumns.filter((s: number) => s > 0);
    const negativeColumns = extremeColumns.filter((s: number) => s < 0);

    return (
        <div className="space-y-6">
            <Card className="border-none shadow-sm bg-white rounded-2xl overflow-hidden">
                <CardHeader className="pb-4">
                    <div className="flex items-center gap-3 mb-1">
                        <div className="bg-indigo-50 p-2 rounded-xl border border-indigo-100 shadow-sm">
                            <Info className="h-4 w-4 text-indigo-600" />
                        </div>
                        <CardTitle className="text-base font-bold text-slate-900 tracking-tight">
                            {t('admin.design.postsort.extreme.title')}
                        </CardTitle>
                    </div>
                    <CardDescription className="text-sm font-medium text-slate-500">
                        {t('admin.design.postsort.extreme.desc')}
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="flex flex-wrap gap-3">
                        {extremeColumns.length === 0 ? (
                            <div className="py-2 text-sm text-slate-400 font-medium italic">
                                {t('admin.design.postsort.extreme.no_columns')}
                            </div>
                        ) : (
                            extremeColumns.map((score: number) => (
                                <Badge
                                    key={score}
                                    variant="secondary"
                                    className="px-4 py-2 text-sm font-bold font-mono bg-slate-100 text-slate-700 border-none rounded-xl flex items-center gap-2 group/badge transition-all hover:bg-slate-200"
                                >
                                    {score > 0 ? '+' : ''}
                                    {score}
                                    <button
                                        type="button"
                                        onClick={() => removeExtremeColumn(score)}
                                        className="ml-1 text-slate-400 hover:text-red-500 transition-colors"
                                    >
                                        <X className="h-3.5 w-3.5" />
                                    </button>
                                </Badge>
                            ))
                        )}
                    </div>

                    {unselectedScores.length > 0 && (
                        <div className="flex items-center gap-3 pt-6 border-t border-slate-100">
                            <Label className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                                {t('admin.design.postsort.extreme.add_label')}
                            </Label>
                            <Select
                                value={selectedScore?.toString() || ''}
                                onValueChange={(val) => setSelectedScore(Number(val))}
                            >
                                <SelectTrigger className="w-32 h-10 rounded-xl border-slate-200 bg-white font-bold">
                                    <SelectValue
                                        placeholder={t(
                                            'admin.design.postsort.extreme.select_placeholder'
                                        )}
                                    />
                                </SelectTrigger>
                                <SelectContent className="rounded-xl border-slate-200 shadow-xl font-bold">
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
                                className="h-10 px-4 rounded-xl border-slate-200 hover:border-indigo-500 hover:text-indigo-600 hover:bg-indigo-50/30 transition-all font-bold shadow-sm"
                            >
                                <Plus className="h-4 w-4 mr-2" />
                                {t('admin.design.postsort.extreme.add')}
                            </Button>
                        </div>
                    )}

                    {positiveColumns.length > 0 && (
                        <div className="pt-6 border-t border-slate-100 space-y-4">
                            <Label
                                htmlFor="extreme-prompt-positive"
                                className="text-[10px] font-black uppercase tracking-wider text-green-700"
                            >
                                {t('admin.design.postsort.extreme.prompt_label')} (+)
                            </Label>
                            <Textarea
                                id="extreme-prompt-positive"
                                value={getPromptText('extreme_positive')}
                                onChange={(e) => setPromptText('extreme_positive', e.target.value)}
                                placeholder={t('admin.design.postsort.extreme.prompt_placeholder')}
                                className="min-h-[80px] rounded-2xl border-green-100 focus:ring-green-500/20 focus:border-green-500 transition-all bg-green-50/10 text-slate-700 leading-relaxed font-medium"
                            />
                        </div>
                    )}
                    {negativeColumns.length > 0 && (
                        <div className="pt-6 border-t border-slate-100 space-y-4">
                            <Label
                                htmlFor="extreme-prompt-negative"
                                className="text-[10px] font-black uppercase tracking-wider text-red-700"
                            >
                                {t('admin.design.postsort.extreme.prompt_label')} (-)
                            </Label>
                            <Textarea
                                id="extreme-prompt-negative"
                                value={getPromptText('extreme_negative')}
                                onChange={(e) => setPromptText('extreme_negative', e.target.value)}
                                placeholder={t('admin.design.postsort.extreme.prompt_placeholder')}
                                className="min-h-[80px] rounded-2xl border-red-100 focus:ring-red-500/20 focus:border-red-500 transition-all bg-red-50/10 text-slate-700 leading-relaxed font-medium"
                            />
                        </div>
                    )}
                </CardContent>
            </Card>

            <Card className="border-none shadow-sm bg-white rounded-2xl overflow-hidden">
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div className="space-y-1">
                            <CardTitle className="text-base font-bold text-slate-900 tracking-tight">
                                {t('admin.design.postsort.random_comments.title')}
                            </CardTitle>
                            <CardDescription className="text-sm font-medium text-slate-500 leading-relaxed">
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

            <Card className="border-none shadow-sm bg-white rounded-2xl overflow-hidden">
                <CardHeader>
                    <div className="space-y-1">
                        <CardTitle className="text-base font-bold text-slate-900 tracking-tight">
                            {t('admin.design.postsort.custom.title')}
                        </CardTitle>
                        <CardDescription className="text-sm font-medium text-slate-500 leading-relaxed">
                            {t('admin.design.postsort.custom.desc')}
                        </CardDescription>
                    </div>
                </CardHeader>
                <CardContent className="pb-8">
                    <QuestionBuilder type="post" />
                </CardContent>
            </Card>

            <div className="flex items-center justify-between rounded-2xl border border-indigo-100 bg-indigo-50/50 p-6 mt-6 shadow-sm group hover:border-indigo-200 hover:shadow-md transition-all">
                <div className="space-y-1.5 text-indigo-900">
                    <Label className="text-base font-bold flex items-center gap-3 tracking-tight">
                        {t('admin.design.postsort.email.title')}
                        <Badge
                            variant="outline"
                            className="text-[10px] font-black uppercase tracking-wider bg-white/80 border-indigo-200 text-indigo-600 px-2 py-0.5 rounded-lg shadow-sm"
                        >
                            {t('common.optional')}
                        </Badge>
                    </Label>
                    <p className="text-[13px] font-medium text-indigo-600/80 leading-relaxed max-w-lg">
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
                <div className="ml-8 mt-4 space-y-4 border-l-2 border-indigo-100 pl-8 animate-in slide-in-from-left-4 duration-500">
                    <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-6 shadow-sm">
                        <div className="flex items-center justify-between group/item mb-2">
                            <Label className="text-sm font-bold text-amber-900 group-hover/item:text-amber-950 transition-colors tracking-tight">
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
                        <p className="text-xs font-medium text-amber-700/80 leading-relaxed">
                            {t('admin.design.postsort.email.interview_warning')}
                        </p>
                    </div>

                    <div className="flex items-center justify-between group/item py-4 px-6 bg-white rounded-2xl border border-slate-100 shadow-sm">
                        <div className="space-y-1">
                            <Label className="text-sm font-bold text-slate-800 group-hover/item:text-indigo-600 transition-all tracking-tight">
                                {t('admin.design.postsort.email.results')}
                            </Label>
                            <p className="text-xs font-medium text-slate-500">
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
