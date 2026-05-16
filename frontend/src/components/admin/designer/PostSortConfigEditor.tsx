import { useStudyDesigner } from '@/store/useStudyDesigner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Info, Plus, X, Mic } from 'lucide-react';
import { useState, useEffect } from 'react';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import QuestionBuilder from './QuestionBuilder';

import { useTranslation } from 'react-i18next';
import { MultiLangFieldIcon } from './MultiLangFieldIcon';
import { postsortConfig } from '@/utils/studyConfig';
import type { PostsortConfig } from '@/schemas/study';

type PromptsMap = Record<string, string | Record<string, string> | undefined>;

interface PostSortConfigEditorProps {
    readOnly?: boolean;
    structureLocked?: boolean;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: P5 — declarative tabbed form with conditional sections (consent / questions / audio / extreme-cards / contact); each mutation handler is a thin JSON-shape setter on postsort_config (load-bearing dynamic JSON column at the ORM boundary, see CLAUDE.md)
const PostSortConfigEditor = ({ readOnly, structureLocked }: PostSortConfigEditorProps) => {
    const { t, i18n } = useTranslation();
    const { draft, activeLocale, updateDraft } = useStudyDesigner();
    const [selectedScore, setSelectedScore] = useState<number | null>(null);

    // Ensure resources for the active editing language are loaded
    useEffect(() => {
        if (activeLocale && !i18n.hasResourceBundle(activeLocale, 'participant')) {
            i18n.loadLanguages(activeLocale);
        }
    }, [activeLocale, i18n]);

    if (!draft) return null;

    // Helper to get translations in the active study locale
    const tStudy = (key: string) => i18n.t(key, { lng: activeLocale }) as string;

    const config = postsortConfig(draft);

    const extremeColumns = config?.extreme_columns || [];
    const allowRandomComments = config?.allow_random_comments ?? true;
    const allowMissingStatements = config?.missing_statements_enabled ?? true;
    const prompts = (config?.prompts ?? {}) as PromptsMap;

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
            const ps = d.postsort_config as PostsortConfig;
            if (!ps.prompts) ps.prompts = {};
            const promptsMap = ps.prompts as PromptsMap;
            const current = promptsMap[key];

            if (!current) {
                promptsMap[key] = { [activeLocale]: value };
            } else if (typeof current === 'string') {
                promptsMap[key] = { en: current, [activeLocale]: value };
            } else {
                promptsMap[key] = { ...current, [activeLocale]: value };
            }
        });
    };

    const addExtremeColumn = (score: number) => {
        updateDraft((d) => {
            if (!d.postsort_config) d.postsort_config = {};
            const ps = d.postsort_config as PostsortConfig;
            const current = ps.extreme_columns || [];
            if (!current.includes(score)) {
                ps.extreme_columns = [...current, score].sort((a: number, b: number) => a - b);
            }
        });
        setSelectedScore(null);
    };

    const removeExtremeColumn = (score: number) => {
        updateDraft((d) => {
            const ps = d.postsort_config as PostsortConfig | null | undefined;
            if (ps) {
                ps.extreme_columns = (ps.extreme_columns || []).filter((s: number) => s !== score);
            }
        });
    };

    const toggleAllowRandomComments = (checked: boolean) => {
        updateDraft((d) => {
            if (!d.postsort_config) d.postsort_config = {};
            const ps = d.postsort_config as PostsortConfig;
            ps.allow_random_comments = checked;
        });
    };

    const toggleAllowMissingStatements = (checked: boolean) => {
        updateDraft((d) => {
            if (!d.postsort_config) d.postsort_config = {};
            const ps = d.postsort_config as PostsortConfig;
            ps.missing_statements_enabled = checked;
        });
    };

    const addDefaultExtremes = () => {
        if (availableScores.length < 2) return;
        const min = Math.min(...availableScores);
        const max = Math.max(...availableScores);

        updateDraft((d) => {
            if (!d.postsort_config) d.postsort_config = {};
            const ps = d.postsort_config as PostsortConfig;
            ps.extreme_columns = [min, max].sort((a: number, b: number) => a - b);
        });
    };

    const unselectedScores = availableScores.filter((s) => !extremeColumns.includes(s));
    const positiveColumns = extremeColumns.filter((s: number) => s > 0);
    const negativeColumns = extremeColumns.filter((s: number) => s < 0);
    const neutralColumns = extremeColumns.filter((s: number) => s === 0);

    return (
        <div className="space-y-6">
            <Tabs defaultValue="step1" className="w-full">
                <TabsList className="grid w-full grid-cols-2 mb-6">
                    <TabsTrigger value="step1">
                        {t('admin.design.postsort.steps.step1')}
                    </TabsTrigger>
                    <TabsTrigger value="step2">
                        {t('admin.design.postsort.steps.step2')}
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="step1" className="space-y-6">
                    {/* Extreme Columns Section (unchanged logic) */}
                    <Card className="border-none shadow-sm bg-white rounded-2xl overflow-hidden">
                        <CardHeader className="pb-4">
                            <div className="flex items-center gap-3 mb-1">
                                <div className="bg-indigo-50 p-2 rounded-xl border border-indigo-100 shadow-sm">
                                    <Info className="h-4 w-4 text-indigo-600" />
                                </div>
                                <CardTitle className="text-base font-black text-slate-900 tracking-tight">
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
                                    <div className="flex items-center gap-4">
                                        <span className="text-sm text-slate-400 font-medium italic">
                                            {t('admin.design.postsort.extreme.no_columns')}
                                        </span>
                                        {availableScores.length >= 2 &&
                                            !readOnly &&
                                            !structureLocked && (
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={addDefaultExtremes}
                                                    className="h-8 rounded-lg text-indigo-600 border-indigo-100 hover:bg-indigo-50"
                                                >
                                                    <Plus className="h-3.5 w-3.5 mr-1.5" />
                                                    {t(
                                                        'admin.design.postsort.extreme.add_defaults'
                                                    )}
                                                </Button>
                                            )}
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
                                            {!readOnly && !structureLocked && (
                                                <button
                                                    type="button"
                                                    onClick={() => removeExtremeColumn(score)}
                                                    className="ml-1 text-slate-400 hover:text-red-500 transition-colors"
                                                >
                                                    <X className="h-3.5 w-3.5" />
                                                </button>
                                            )}
                                        </Badge>
                                    ))
                                )}
                            </div>

                            {unselectedScores.length > 0 && !readOnly && !structureLocked && (
                                <div className="flex items-center gap-3 pt-6 border-t border-slate-100">
                                    <Label className="text-2xs font-black text-slate-500">
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
                                            selectedScore !== null &&
                                            addExtremeColumn(selectedScore)
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
                                    <div className="flex items-center gap-2">
                                        <Label
                                            htmlFor="extreme-prompt-positive"
                                            className="text-2xs font-black text-green-700"
                                        >
                                            {t('admin.design.postsort.extreme.prompt_label')} (+)
                                        </Label>
                                        <MultiLangFieldIcon
                                            activeLocale={activeLocale}
                                            translations={
                                                typeof prompts.extreme_positive === 'object'
                                                    ? prompts.extreme_positive
                                                    : { en: prompts.extreme_positive || '' }
                                            }
                                        />
                                    </div>
                                    <Textarea
                                        id="extreme-prompt-positive"
                                        value={
                                            getPromptText('extreme_positive') ||
                                            tStudy(
                                                'admin.design.postsort.extreme.prompt_placeholder'
                                            )
                                        }
                                        onChange={(e) =>
                                            setPromptText('extreme_positive', e.target.value)
                                        }
                                        placeholder={tStudy(
                                            'admin.design.postsort.extreme.prompt_placeholder'
                                        )}
                                        readOnly={readOnly}
                                        className="min-h-[80px] rounded-2xl border-green-100 focus:ring-green-500/20 focus:border-green-500 transition-all bg-green-50/10 text-slate-700 leading-relaxed font-medium"
                                    />
                                </div>
                            )}

                            {neutralColumns.length > 0 && (
                                <div className="pt-6 border-t border-slate-100 space-y-4">
                                    <div className="flex items-center gap-2">
                                        <Label
                                            htmlFor="extreme-prompt-neutral"
                                            className="text-2xs font-black text-slate-600"
                                        >
                                            {t('admin.design.postsort.extreme.prompt_label')} (0)
                                        </Label>
                                        <MultiLangFieldIcon
                                            activeLocale={activeLocale}
                                            translations={
                                                typeof prompts.extreme_neutral === 'object'
                                                    ? prompts.extreme_neutral
                                                    : { en: prompts.extreme_neutral || '' }
                                            }
                                        />
                                    </div>
                                    <Textarea
                                        id="extreme-prompt-neutral"
                                        value={
                                            getPromptText('extreme_neutral') ||
                                            tStudy(
                                                'admin.design.postsort.extreme.prompt_placeholder'
                                            )
                                        }
                                        onChange={(e) =>
                                            setPromptText('extreme_neutral', e.target.value)
                                        }
                                        placeholder={tStudy(
                                            'admin.design.postsort.extreme.prompt_placeholder'
                                        )}
                                        readOnly={readOnly}
                                        className="min-h-[80px] rounded-2xl border-slate-200 focus:ring-slate-500/20 focus:border-slate-500 transition-all bg-slate-50/30 text-slate-700 leading-relaxed font-medium"
                                    />
                                </div>
                            )}

                            {negativeColumns.length > 0 && (
                                <div className="pt-6 border-t border-slate-100 space-y-4">
                                    <div className="flex items-center gap-2">
                                        <Label
                                            htmlFor="extreme-prompt-negative"
                                            className="text-2xs font-black text-red-700"
                                        >
                                            {t('admin.design.postsort.extreme.prompt_label')} (-)
                                        </Label>
                                        <MultiLangFieldIcon
                                            activeLocale={activeLocale}
                                            translations={
                                                typeof prompts.extreme_negative === 'object'
                                                    ? prompts.extreme_negative
                                                    : { en: prompts.extreme_negative || '' }
                                            }
                                        />
                                    </div>
                                    <Textarea
                                        id="extreme-prompt-negative"
                                        value={
                                            getPromptText('extreme_negative') ||
                                            tStudy(
                                                'admin.design.postsort.extreme.prompt_placeholder'
                                            )
                                        }
                                        onChange={(e) =>
                                            setPromptText('extreme_negative', e.target.value)
                                        }
                                        placeholder={tStudy(
                                            'admin.design.postsort.extreme.prompt_placeholder'
                                        )}
                                        readOnly={readOnly}
                                        className="min-h-[80px] rounded-2xl border-red-100 focus:ring-red-500/20 focus:border-red-500 transition-all bg-red-50/10 text-slate-700 leading-relaxed font-medium"
                                    />
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Random Comments Section */}
                    <Card className="border-none shadow-sm bg-white rounded-2xl overflow-hidden">
                        <CardHeader className={allowRandomComments ? 'pb-4' : ''}>
                            <div className="flex items-center justify-between">
                                <div className="space-y-1">
                                    <CardTitle className="text-base font-black text-slate-900 tracking-tight">
                                        {t('admin.design.postsort.random_comments.title')}
                                    </CardTitle>
                                    <CardDescription className="text-sm font-medium text-slate-500 leading-relaxed">
                                        {t('admin.design.postsort.random_comments.desc')}
                                    </CardDescription>
                                </div>
                                <Switch
                                    data-testid="allow-random-comments-toggle"
                                    checked={allowRandomComments}
                                    onCheckedChange={(checked: boolean) => {
                                        if (checked === allowRandomComments) return;
                                        toggleAllowRandomComments(checked);
                                    }}
                                    disabled={readOnly || structureLocked}
                                />
                            </div>
                        </CardHeader>
                        {allowRandomComments && (
                            <CardContent className="pt-0">
                                <div className="space-y-4">
                                    <div className="flex items-center gap-2">
                                        <Label
                                            htmlFor="random-comments-prompt"
                                            className="text-2xs font-black text-slate-500"
                                        >
                                            {t('admin.design.postsort.missing.prompt_label')}
                                        </Label>
                                        <MultiLangFieldIcon
                                            activeLocale={activeLocale}
                                            translations={
                                                typeof prompts.random_comments_label === 'object'
                                                    ? prompts.random_comments_label
                                                    : { en: prompts.random_comments_label || '' }
                                            }
                                        />
                                    </div>
                                    <Textarea
                                        id="random-comments-prompt"
                                        value={
                                            getPromptText('random_comments_label') ||
                                            tStudy('post.optional.title')
                                        }
                                        onChange={(e) =>
                                            setPromptText('random_comments_label', e.target.value)
                                        }
                                        placeholder={tStudy('post.optional.title')}
                                        readOnly={readOnly}
                                        className="min-h-[80px] rounded-2xl border-slate-300 focus:ring-slate-500/20 focus:border-slate-500 transition-all bg-slate-50/30 text-slate-700 leading-relaxed font-medium"
                                    />
                                </div>
                            </CardContent>
                        )}
                    </Card>

                    {/* Missing Statements Section (NEW) */}
                    <Card className="border-none shadow-sm bg-white rounded-2xl overflow-hidden">
                        <CardHeader className="pb-4">
                            <div className="flex items-center justify-between">
                                <div className="space-y-1">
                                    <CardTitle className="text-base font-black text-slate-900 tracking-tight">
                                        {t('admin.design.postsort.missing.title')}
                                    </CardTitle>
                                    <CardDescription className="text-sm font-medium text-slate-500 leading-relaxed">
                                        {t('admin.design.postsort.missing.desc')}
                                    </CardDescription>
                                </div>
                                <Switch
                                    data-testid="allow-missing-statements-toggle"
                                    checked={allowMissingStatements}
                                    onCheckedChange={(checked: boolean) => {
                                        if (checked === allowMissingStatements) return;
                                        toggleAllowMissingStatements(checked);
                                    }}
                                    disabled={readOnly || structureLocked}
                                />
                            </div>
                        </CardHeader>
                        {allowMissingStatements && (
                            <CardContent className="pt-0">
                                <div className="space-y-4">
                                    <div className="flex items-center gap-2">
                                        <Label
                                            htmlFor="missing-prompt"
                                            className="text-2xs font-black text-slate-500"
                                        >
                                            {t('admin.design.postsort.missing.prompt_label')}
                                        </Label>
                                        <MultiLangFieldIcon
                                            activeLocale={activeLocale}
                                            translations={
                                                typeof prompts.missing_statements_label === 'object'
                                                    ? prompts.missing_statements_label
                                                    : { en: prompts.missing_statements_label || '' }
                                            }
                                        />
                                    </div>
                                    <Textarea
                                        id="missing-prompt"
                                        value={
                                            getPromptText('missing_statements_label') ||
                                            tStudy('admin.study.postsort.missing.desc')
                                        }
                                        onChange={(e) =>
                                            setPromptText(
                                                'missing_statements_label',
                                                e.target.value
                                            )
                                        }
                                        placeholder={tStudy('admin.study.postsort.missing.desc')}
                                        readOnly={readOnly}
                                        className="min-h-[80px] rounded-2xl border-slate-300 focus:ring-slate-500/20 focus:border-slate-500 transition-all bg-slate-50/30 text-slate-700 leading-relaxed font-medium"
                                    />
                                </div>
                            </CardContent>
                        )}
                    </Card>

                    {/* Audio Recording Section */}
                    <Card className="border-none shadow-sm bg-white rounded-2xl overflow-hidden">
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <div className="space-y-1">
                                    <CardTitle className="text-lg font-black text-slate-800 flex items-center gap-2">
                                        <Mic className="w-5 h-5 text-indigo-600" />
                                        {t('admin.design.postsort.audio.title') ||
                                            'Audio Recording'}
                                    </CardTitle>
                                    <CardDescription className="text-sm font-medium text-slate-500 leading-relaxed">
                                        {t('admin.design.postsort.audio.desc') ||
                                            'Allow participants to record audio responses instead of text'}
                                    </CardDescription>
                                </div>
                                <Switch
                                    data-testid="audio-recording-toggle"
                                    checked={config?.audio?.enabled || false}
                                    onCheckedChange={(checked: boolean) => {
                                        if (checked === (config?.audio?.enabled || false)) return;
                                        // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: P5 — audio-section toggle with conditional default-config seed (steps/durations/required defaults inlined for legibility); the conditional seeding IS the contract for "first-time enable"
                                        updateDraft((d) => {
                                            if (!d.postsort_config) d.postsort_config = {};
                                            const ps = d.postsort_config as PostsortConfig;
                                            if (!ps.audio) ps.audio = { enabled: false };
                                            ps.audio.enabled = checked;
                                            // Set defaults when enabling
                                            if (checked) {
                                                if (!ps.audio.max_duration_seconds) {
                                                    ps.audio.max_duration_seconds = 180;
                                                }
                                                if (!ps.audio.max_storage_mb) {
                                                    ps.audio.max_storage_mb = 100;
                                                }
                                            }
                                        });
                                    }}
                                    disabled={readOnly}
                                />
                            </div>
                        </CardHeader>
                        {config?.audio?.enabled && (
                            <CardContent className="pt-0 space-y-6">
                                {/* Max Duration */}
                                <div className="space-y-3">
                                    <Label
                                        htmlFor="audio-max-duration"
                                        className="text-sm font-bold text-slate-700"
                                    >
                                        {t('admin.design.postsort.audio.max_duration') ||
                                            'Maximum Duration'}
                                    </Label>
                                    <div className="flex items-center gap-3">
                                        <Input
                                            id="audio-max-duration"
                                            type="number"
                                            min={30}
                                            max={600}
                                            step={30}
                                            value={config?.audio?.max_duration_seconds ?? 180}
                                            onChange={(e) => {
                                                const value = Number(e.target.value);
                                                if (value < 30 || value > 600) return;
                                                updateDraft((d) => {
                                                    if (!d.postsort_config) d.postsort_config = {};
                                                    const ps = d.postsort_config as PostsortConfig;
                                                    if (!ps.audio) ps.audio = { enabled: true };
                                                    ps.audio.max_duration_seconds = value;
                                                });
                                            }}
                                            disabled={readOnly}
                                            className="w-32 rounded-xl border-slate-300"
                                        />
                                        <span className="text-sm text-slate-600 font-medium">
                                            {t('admin.design.postsort.audio.seconds') || 'seconds'}
                                        </span>
                                    </div>
                                    <p className="text-xs text-slate-500 leading-relaxed">
                                        {t('admin.design.postsort.audio.max_duration_help') ||
                                            'Maximum recording length per question (30-600 seconds)'}
                                    </p>
                                </div>

                                {/* Info Alert */}
                                <Alert className="border-indigo-200 bg-indigo-50/50">
                                    <Info className="h-4 w-4 text-indigo-600" />
                                    <AlertDescription className="text-sm text-indigo-900">
                                        {t('admin.design.postsort.audio.participant_choice_info') ||
                                            'Participants can choose to respond with either text OR audio for each question, but not both.'}
                                    </AlertDescription>
                                </Alert>
                            </CardContent>
                        )}
                    </Card>
                </TabsContent>

                <TabsContent value="step2" className="space-y-6">
                    {/* Custom Questions Section */}
                    <Card className="border-none shadow-sm bg-white rounded-2xl overflow-hidden">
                        <CardHeader>
                            <div className="space-y-1">
                                <CardTitle className="text-base font-black text-slate-900 tracking-tight">
                                    {t('admin.design.postsort.custom.title')}
                                </CardTitle>
                                <CardDescription className="text-sm font-medium text-slate-500 leading-relaxed">
                                    {t('admin.design.postsort.custom.desc')}
                                </CardDescription>
                            </div>
                        </CardHeader>
                        <CardContent className="pb-8">
                            <QuestionBuilder
                                type="post"
                                readOnly={readOnly}
                                structureLocked={structureLocked}
                            />
                        </CardContent>
                    </Card>

                    {/* Email/Contact Section */}
                    <div className="flex items-center justify-between rounded-2xl border border-indigo-100 bg-indigo-50/50 p-6 mt-6 shadow-sm group hover:border-indigo-200 hover:shadow-md transition-all">
                        <div className="space-y-1.5 text-indigo-900">
                            <Label className="text-base font-bold flex items-center gap-3 tracking-tight">
                                {t('admin.design.postsort.email.title')}
                                <Badge
                                    variant="outline"
                                    className="text-2xs font-black bg-white/80 border-indigo-200 text-indigo-600 px-2 py-0.5 rounded-lg shadow-sm"
                                >
                                    {t('common.optional')}
                                </Badge>
                            </Label>
                            <p className="text-[13px] font-medium text-indigo-600/80 leading-relaxed max-w-lg">
                                {t('admin.design.postsort.email.desc')}
                            </p>
                        </div>
                        <Switch
                            data-testid="email-collection-toggle"
                            checked={config?.email_collection_enabled || false}
                            onCheckedChange={(checked: boolean) => {
                                const currentValue = config?.email_collection_enabled || false;
                                if (checked === currentValue) return;
                                updateDraft((d) => {
                                    if (!d.postsort_config) d.postsort_config = {};
                                    (d.postsort_config as PostsortConfig).email_collection_enabled =
                                        checked;
                                });
                            }}
                            disabled={readOnly}
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
                                        data-testid="interview-consent-toggle"
                                        checked={config?.interview_consent_enabled ?? true}
                                        onCheckedChange={(checked: boolean) => {
                                            const currentValue =
                                                config?.interview_consent_enabled ?? true;
                                            if (checked === currentValue) return;
                                            updateDraft((d) => {
                                                if (!d.postsort_config) d.postsort_config = {};
                                                (
                                                    d.postsort_config as PostsortConfig
                                                ).interview_consent_enabled = checked;
                                            });
                                        }}
                                        disabled={readOnly}
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
                                    data-testid="newsletter-consent-toggle"
                                    checked={config?.newsletter_consent_enabled ?? true}
                                    onCheckedChange={(checked: boolean) => {
                                        const currentValue =
                                            config?.newsletter_consent_enabled ?? true;
                                        if (checked === currentValue) return;
                                        updateDraft((d) => {
                                            if (!d.postsort_config) d.postsort_config = {};
                                            (
                                                d.postsort_config as PostsortConfig
                                            ).newsletter_consent_enabled = checked;
                                        });
                                    }}
                                    disabled={readOnly}
                                />
                            </div>
                        </div>
                    )}
                </TabsContent>
            </Tabs>
        </div>
    );
};

export default PostSortConfigEditor;
