import { useStudyDesigner } from '@/store/useStudyDesigner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import {
    RotateCcw,
    MousePointerClick,
    ArrowRight,
    Info,
    Lightbulb,
    Trash2,
    Plus,
} from 'lucide-react';
import { createResetToDefaultHandler } from '@/utils/studyResetHelpers';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

import { useEffect } from 'react';
import { toast } from 'sonner';

const InterfaceEditor = ({ readOnly = false }: { readOnly?: boolean }) => {
    const { draft, activeLocale, updateTranslation, updateDraft, setActiveSubStep } =
        useStudyDesigner();
    const { t, i18n } = useTranslation();

    const resetToDefaults = createResetToDefaultHandler(updateDraft, t);

    // Ensure resources for the active editing language are loaded
    useEffect(() => {
        if (activeLocale && !i18n.hasResourceBundle(activeLocale, 'translation')) {
            i18n.loadLanguages(activeLocale);
        }
    }, [activeLocale, i18n]);

    // Ensure structural consistency for methodology tips
    // If one language has more tips, pad others with empty strings
    // biome-ignore lint/correctness/useExhaustiveDependencies: updateDraft stable
    useEffect(() => {
        if (!draft?.translations) return;

        const maxTips = Math.max(...draft.translations.map((t) => t.methodology_tips?.length ?? 0));

        const someMismatch = draft.translations.some(
            (t) => (t.methodology_tips?.length ?? 0) !== maxTips
        );

        if (someMismatch && maxTips > 0) {
            updateDraft((d) => {
                for (const t of d.translations || []) {
                    if (!t.methodology_tips) t.methodology_tips = [];
                    while (t.methodology_tips.length < maxTips) {
                        t.methodology_tips.push('');
                    }
                }
            });
        }
    }, [draft?.translations]);

    if (!draft) return null;

    const translation = draft.translations?.find((t) => t.language_code === activeLocale);
    const uiLabels = (translation?.ui_labels || {}) as Record<string, string>;

    // Helper to get translations in the active study locale (not the admin UI locale)
    // We force a key change/re-render when activeLocale changes to ensure placeholders update instantly
    const tStudy = (key: string) => i18n.t(key, { lng: activeLocale }) as string;

    // Explicitly used for Input placeholders to ensure they re-render on locale change
    const tPlaceHolder = (key: string) => i18n.t(key, { lng: activeLocale }) as string;

    const visibleSteps = [
        { id: 'presort', labelKey: 'study.steps.presort' },
        { id: 'rough', labelKey: 'study.steps.rough' },
        { id: 'fine', labelKey: 'study.steps.fine' },
        { id: 'post', labelKey: 'study.steps.post' },
    ];

    const updateLabel = (key: string, value: string) => {
        updateTranslation(activeLocale, (t) => {
            if (!t.ui_labels) t.ui_labels = {};
            if (!value) {
                delete (t.ui_labels as Record<string, unknown>)[key];
            } else {
                (t.ui_labels as Record<string, unknown>)[key] = value;
            }
        });
    };

    const getLabel = (key: string) => (uiLabels[key] || tStudy(key)) as string;

    const resetLabel = (key: string) => {
        updateTranslation(activeLocale, (t_trans) => {
            if (t_trans.ui_labels) {
                delete (t_trans.ui_labels as Record<string, unknown>)[key];
            }
        });
        toast.success(t('common.reset_to_default_success'));
    };

    const resetStepHelp = (stepId: string) => {
        updateTranslation(activeLocale, (t_trans) => {
            if (t_trans.step_help?.[stepId]) {
                delete t_trans.step_help[stepId];
            }
        });
        toast.success(t('common.reset_to_default_success'));
    };

    const resetTerminologyGroup = (keys: string[]) => {
        updateTranslation(activeLocale, (t_trans) => {
            if (t_trans.ui_labels) {
                for (const key of keys) {
                    delete (t_trans.ui_labels as Record<string, unknown>)[key];
                }
            }
        });
        toast.success(t('common.reset_to_default_success'));
    };

    return (
        <div className="space-y-12 pb-12">
            <div className="flex items-center gap-3 text-slate-900 font-bold text-xl tracking-tight">
                <div className="bg-indigo-50 p-2 rounded-xl border border-indigo-100 shadow-sm">
                    <MousePointerClick className="h-5 w-5 text-indigo-600" />
                </div>
                {t('admin.design.interface.title')}
            </div>

            {/* Navigation & Actions */}
            <Card className="border-none shadow-sm bg-white rounded-2xl overflow-hidden">
                <CardHeader className="pb-4">
                    <div className="flex items-center gap-2">
                        <ArrowRight className="h-4 w-4 text-indigo-500" />
                        <CardTitle className="text-sm font-black">
                            {t('admin.design.interface.nav.title')}
                        </CardTitle>
                    </div>
                    <CardDescription className="text-xs font-medium text-slate-500">
                        {t('admin.design.interface.desc')}
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-8">
                        <div className="space-y-2.5">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Label className="text-2xs font-black text-slate-500">
                                        {t('admin.design.interface.nav.start')}
                                    </Label>
                                    <TooltipProvider>
                                        <Tooltip>
                                            <TooltipTrigger>
                                                <Info className="size-3 text-slate-400" />
                                            </TooltipTrigger>
                                            <TooltipContent className="text-2xs">
                                                {t('admin.design.interface.nav.tooltips.start')}
                                            </TooltipContent>
                                        </Tooltip>
                                    </TooltipProvider>
                                </div>
                                {uiLabels['welcome.start'] && (
                                    <button
                                        type="button"
                                        disabled={readOnly}
                                        onClick={() => resetLabel('welcome.start')}
                                        className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[9px]
                                                 font-black text-slate-400
                                                 hover:bg-slate-100 hover:text-indigo-600 transition-colors"
                                        title={t('common.reset_to_default')}
                                    >
                                        <RotateCcw className="size-2.5" />
                                        {t('common.reset_to_default')}
                                    </button>
                                )}
                            </div>
                            <Input
                                name="welcome.start"
                                value={getLabel('welcome.start')}
                                onChange={(e) => updateLabel('welcome.start', e.target.value)}
                                onFocus={() => setActiveSubStep('welcome.start')}
                                placeholder={tPlaceHolder('welcome.start')}
                                disabled={readOnly}
                                className="font-bold text-sm h-11 rounded-xl"
                            />
                        </div>
                        <div className="space-y-2.5">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Label className="text-2xs font-black text-slate-500">
                                        {t('admin.design.interface.nav.next')}
                                    </Label>
                                    <TooltipProvider>
                                        <Tooltip>
                                            <TooltipTrigger>
                                                <Info className="size-3 text-slate-400" />
                                            </TooltipTrigger>
                                            <TooltipContent className="text-2xs">
                                                {t('admin.design.interface.nav.tooltips.next')}
                                            </TooltipContent>
                                        </Tooltip>
                                    </TooltipProvider>
                                </div>
                                {uiLabels['common.next'] && (
                                    <button
                                        type="button"
                                        disabled={readOnly}
                                        onClick={() => resetLabel('common.next')}
                                        className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[9px]
                                                 font-black text-slate-400
                                                 hover:bg-slate-100 hover:text-indigo-600 transition-colors"
                                        title={t('common.reset_to_default')}
                                    >
                                        <RotateCcw className="size-2.5" />
                                        {t('common.reset_to_default')}
                                    </button>
                                )}
                            </div>
                            <Input
                                name="common.next"
                                value={getLabel('common.next')}
                                onChange={(e) => updateLabel('common.next', e.target.value)}
                                onFocus={() => setActiveSubStep('common.next')}
                                placeholder={tPlaceHolder('common.next')}
                                disabled={readOnly}
                                className="font-bold text-sm h-11 rounded-xl"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-8">
                        <div className="space-y-2.5">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Label className="text-2xs font-black text-slate-500">
                                        {t('admin.design.interface.nav.submit')}
                                    </Label>
                                    <TooltipProvider>
                                        <Tooltip>
                                            <TooltipTrigger>
                                                <Info className="size-3 text-slate-400" />
                                            </TooltipTrigger>
                                            <TooltipContent className="text-2xs">
                                                {t('admin.design.interface.nav.tooltips.submit')}
                                            </TooltipContent>
                                        </Tooltip>
                                    </TooltipProvider>
                                </div>
                                {uiLabels['post.submit'] && (
                                    <button
                                        type="button"
                                        disabled={readOnly}
                                        onClick={() => resetLabel('post.submit')}
                                        className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[9px]
                                                 font-black text-slate-400
                                                 hover:bg-slate-100 hover:text-indigo-600 transition-colors"
                                        title={t('common.reset_to_default')}
                                    >
                                        <RotateCcw className="size-2.5" />
                                        {t('common.reset_to_default')}
                                    </button>
                                )}
                            </div>
                            <Input
                                name="post.submit"
                                value={getLabel('post.submit')}
                                onChange={(e) => updateLabel('post.submit', e.target.value)}
                                onFocus={() => setActiveSubStep('post.submit')}
                                placeholder={tPlaceHolder('post.submit')}
                                disabled={readOnly}
                                className="font-bold text-sm h-11 rounded-xl"
                            />
                        </div>
                        <div className="space-y-2.5">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Label className="text-2xs font-black text-slate-500">
                                        {t('admin.design.interface.nav.confirm')}
                                    </Label>
                                    <TooltipProvider>
                                        <Tooltip>
                                            <TooltipTrigger>
                                                <Info className="size-3 text-slate-400" />
                                            </TooltipTrigger>
                                            <TooltipContent className="text-2xs">
                                                {t('admin.design.interface.nav.tooltips.confirm')}
                                            </TooltipContent>
                                        </Tooltip>
                                    </TooltipProvider>
                                </div>
                                {uiLabels['fine.actions.validate'] && (
                                    <button
                                        type="button"
                                        disabled={readOnly}
                                        onClick={() => resetLabel('fine.actions.validate')}
                                        className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[9px]
                                                 font-black text-slate-400
                                                 hover:bg-slate-100 hover:text-indigo-600 transition-colors"
                                        title={t('common.reset_to_default')}
                                    >
                                        <RotateCcw className="size-2.5" />
                                        {t('common.reset_to_default')}
                                    </button>
                                )}
                            </div>
                            <Input
                                name="fine.actions.validate"
                                value={getLabel('fine.actions.validate')}
                                onChange={(e) =>
                                    updateLabel('fine.actions.validate', e.target.value)
                                }
                                onFocus={() => setActiveSubStep('fine.actions.validate')}
                                placeholder={tPlaceHolder('fine.actions.validate')}
                                disabled={readOnly}
                                className="font-bold text-sm h-11 rounded-xl"
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Sorting Terminology */}
            <Card className="border-none shadow-sm bg-white rounded-2xl overflow-hidden">
                <CardHeader className="pb-4">
                    <div className="flex items-center gap-2">
                        <RotateCcw className="h-4 w-4 text-indigo-500" />
                        <CardTitle className="text-sm font-black">
                            {t('admin.design.interface.terms.title')}
                        </CardTitle>
                    </div>
                    <CardDescription className="text-xs font-medium text-slate-500">
                        {t('admin.design.interface.terms.desc')}
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-8">
                    <div className="space-y-6">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 py-1.5 px-3 bg-slate-50 border border-slate-100 rounded-xl w-fit">
                                <span className="text-2xs font-black text-slate-600">
                                    {t('admin.design.interface.terms.rough')}
                                </span>
                            </div>
                            {(uiLabels['common.agree'] ||
                                uiLabels['common.neutral'] ||
                                uiLabels['common.disagree']) && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    disabled={readOnly}
                                    onClick={() =>
                                        resetTerminologyGroup([
                                            'common.agree',
                                            'common.neutral',
                                            'common.disagree',
                                        ])
                                    }
                                    className="text-slate-500 hover:text-indigo-600 rounded-xl font-bold h-8 text-xs"
                                >
                                    <RotateCcw className="size-3.5 mr-2" />
                                    {t('common.reset_to_default')}
                                </Button>
                            )}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
                            <div className="space-y-2.5">
                                <Label className="text-2xs font-black text-slate-400">
                                    {t('admin.design.interface.terms.agree')}
                                </Label>
                                <Input
                                    name="common.agree"
                                    value={getLabel('common.agree')}
                                    onChange={(e) => updateLabel('common.agree', e.target.value)}
                                    onFocus={() => setActiveSubStep('common.agree')}
                                    placeholder={tPlaceHolder('common.agree')}
                                    disabled={readOnly}
                                    className="font-bold text-sm h-10 rounded-xl"
                                />
                            </div>
                            <div className="space-y-2.5">
                                <Label className="text-2xs font-black text-slate-400">
                                    {t('admin.design.interface.terms.neutral')}
                                </Label>
                                <Input
                                    name="common.neutral"
                                    value={getLabel('common.neutral')}
                                    onChange={(e) => updateLabel('common.neutral', e.target.value)}
                                    onFocus={() => setActiveSubStep('common.neutral')}
                                    placeholder={tPlaceHolder('common.neutral')}
                                    disabled={readOnly}
                                    className="font-bold text-sm h-10 rounded-xl"
                                />
                            </div>
                            <div className="space-y-2.5">
                                <Label className="text-2xs font-black text-slate-400">
                                    {t('admin.design.interface.terms.disagree')}
                                </Label>
                                <Input
                                    name="common.disagree"
                                    value={getLabel('common.disagree')}
                                    onChange={(e) => updateLabel('common.disagree', e.target.value)}
                                    onFocus={() => setActiveSubStep('common.disagree')}
                                    placeholder={tPlaceHolder('common.disagree')}
                                    disabled={readOnly}
                                    className="font-bold text-sm h-10 rounded-xl"
                                />
                            </div>
                        </div>

                        <Separator className="bg-slate-100" />

                        <div className="space-y-6">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 py-1.5 px-3 bg-slate-50 border border-slate-100 rounded-xl w-fit">
                                    <span className="text-2xs font-black text-slate-600">
                                        {t('admin.design.interface.terms.grid')}
                                    </span>
                                </div>
                                {!!(
                                    uiLabels['fine.legend.agree'] ||
                                    uiLabels['fine.legend.neutral'] ||
                                    uiLabels['fine.legend.disagree']
                                ) && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        disabled={readOnly}
                                        onClick={() =>
                                            resetTerminologyGroup([
                                                'fine.legend.agree',
                                                'fine.legend.neutral',
                                                'fine.legend.disagree',
                                            ])
                                        }
                                        className="text-slate-500 hover:text-indigo-600 rounded-xl font-bold h-8 text-xs"
                                    >
                                        <RotateCcw className="size-3.5 mr-2" />
                                        {t('common.reset_to_default')}
                                    </Button>
                                )}
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
                                <div className="space-y-2.5">
                                    <Label className="text-2xs font-black text-slate-400">
                                        {t('admin.design.interface.terms.most_agree')}
                                    </Label>
                                    <Input
                                        name="fine.legend.agree"
                                        value={getLabel('fine.legend.agree')}
                                        onChange={(e) =>
                                            updateLabel('fine.legend.agree', e.target.value)
                                        }
                                        onFocus={() => setActiveSubStep('fine.legend.agree')}
                                        placeholder={tPlaceHolder('fine.legend.agree')}
                                        disabled={readOnly}
                                        className="font-bold text-sm h-10 rounded-xl"
                                    />
                                </div>
                                <div className="space-y-2.5">
                                    <Label className="text-2xs font-black text-slate-400">
                                        {t('admin.design.interface.terms.neutral')}
                                    </Label>
                                    <Input
                                        name="fine.legend.neutral"
                                        value={getLabel('fine.legend.neutral')}
                                        onChange={(e) =>
                                            updateLabel('fine.legend.neutral', e.target.value)
                                        }
                                        onFocus={() => setActiveSubStep('fine.legend.neutral')}
                                        placeholder={tPlaceHolder('fine.legend.neutral')}
                                        disabled={readOnly}
                                        className="font-bold text-sm h-10 rounded-xl"
                                    />
                                </div>
                                <div className="space-y-2.5">
                                    <Label className="text-2xs font-black text-slate-400">
                                        {t('admin.design.interface.terms.most_disagree')}
                                    </Label>
                                    <Input
                                        name="fine.legend.disagree"
                                        value={getLabel('fine.legend.disagree')}
                                        onChange={(e) =>
                                            updateLabel('fine.legend.disagree', e.target.value)
                                        }
                                        onFocus={() => setActiveSubStep('fine.legend.disagree')}
                                        placeholder={tPlaceHolder('fine.legend.disagree')}
                                        disabled={readOnly}
                                        className="font-bold text-sm h-10 rounded-xl"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Methodology Hints */}
            <Card className="border-none shadow-sm bg-white rounded-2xl overflow-hidden">
                <CardHeader className="pb-4">
                    <div className="flex items-center gap-2">
                        <Lightbulb className="h-4 w-4 text-amber-500" />
                        <CardTitle className="text-sm font-black">
                            {t('admin.design.interface.hints.title')}
                        </CardTitle>
                    </div>
                    <CardDescription className="text-xs font-medium text-slate-500">
                        {t('admin.design.interface.hints.desc')}
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="space-y-4">
                        {translation?.methodology_tips?.map((tip: string, index: number) => (
                            <div key={index} className="flex gap-4 items-center group">
                                <div className="size-2 rounded-full bg-amber-400 shrink-0 shadow-sm shadow-amber-200" />
                                <div className="flex-1">
                                    <Input
                                        value={tip}
                                        onChange={(e) => {
                                            updateTranslation(activeLocale, (t) => {
                                                if (!t.methodology_tips) t.methodology_tips = [];
                                                t.methodology_tips[index] = e.target.value;
                                            });
                                        }}
                                        placeholder={t('admin.design.interface.hints.placeholder')}
                                        disabled={readOnly}
                                        className="font-medium text-sm rounded-xl h-10 bg-slate-50/30"
                                    />
                                </div>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    disabled={readOnly}
                                    onClick={() => {
                                        updateDraft((d) => {
                                            for (const t of d.translations || []) {
                                                t.methodology_tips?.splice(index, 1);
                                            }
                                        });
                                    }}
                                    className="text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl h-10 w-10 transition-all border border-transparent hover:border-red-100 shadow-none hover:shadow-sm"
                                >
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </div>
                        ))}

                        <div className="flex gap-4 pt-4">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                    updateDraft((d) => {
                                        for (const t of d.translations || []) {
                                            if (!t.methodology_tips) t.methodology_tips = [];
                                            t.methodology_tips.push('');
                                        }
                                    });
                                }}
                                disabled={readOnly}
                                className="rounded-xl border-dashed border-2 hover:border-indigo-500 hover:bg-indigo-50/30 font-bold transition-all px-6 py-5"
                            >
                                <Plus className="size-4 mr-2" />
                                {t('admin.design.interface.hints.add')}
                            </Button>

                            <Button
                                variant="ghost"
                                size="sm"
                                disabled={readOnly}
                                onClick={() => resetToDefaults('methodology_tips')}
                                className="text-slate-500 hover:text-indigo-600 rounded-xl font-bold px-4"
                            >
                                <RotateCcw className="size-4 mr-2" />
                                {t('admin.design.interface.hints.reset')}
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Step Guidance (What/Why) */}
            <Card className="border-none shadow-sm bg-white rounded-2xl overflow-hidden">
                <CardHeader className="pb-4">
                    <div className="flex items-center gap-2">
                        <Info className="h-4 w-4 text-indigo-500" />
                        <CardTitle className="text-sm font-black">
                            {t('admin.design.interface.help.title')}
                        </CardTitle>
                    </div>
                    <CardDescription className="text-xs font-medium text-slate-500">
                        {t('admin.design.interface.help.desc')}
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-10">
                    {visibleSteps.map((step, index) => {
                        const stepHelp = translation?.step_help?.[step.id.toString()] ?? {};

                        return (
                            <div key={step.id} className="space-y-6">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2 py-1.5 px-3 bg-indigo-50/50 border border-indigo-100 rounded-xl w-fit">
                                        <span className="text-2xs font-black text-indigo-900">
                                            {t('common.step', 'Step')} {index + 1}:{' '}
                                            {t(step.labelKey)}
                                        </span>
                                    </div>
                                    {translation?.step_help?.[step.id.toString()] && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => resetStepHelp(step.id.toString())}
                                            disabled={readOnly}
                                            className="text-slate-500 hover:text-indigo-600 rounded-xl font-bold h-8 text-xs"
                                        >
                                            <RotateCcw className="size-3.5 mr-2" />
                                            {t('common.reset_to_default')}
                                        </Button>
                                    )}
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pl-6 border-l-2 border-slate-100">
                                    <div className="space-y-2.5">
                                        <Label className="text-2xs font-black text-slate-400">
                                            {t('study.help.what')}
                                        </Label>
                                        <Input
                                            value={
                                                stepHelp.what ||
                                                tStudy(`study.help.step_${step.id}.what`)
                                            }
                                            onChange={(e) => {
                                                updateTranslation(activeLocale, (t) => {
                                                    if (!t.step_help) t.step_help = {};
                                                    if (!t.step_help[step.id.toString()])
                                                        t.step_help[step.id.toString()] = {};
                                                    t.step_help[step.id.toString()].what =
                                                        e.target.value;
                                                });
                                            }}
                                            placeholder={tPlaceHolder(
                                                `study.help.step_${step.id}.what`
                                            )}
                                            disabled={readOnly}
                                            className="font-medium text-sm h-11 rounded-xl bg-slate-50/30"
                                        />
                                    </div>
                                    <div className="space-y-2.5">
                                        <Label className="text-2xs font-black text-slate-400">
                                            {t('study.help.why')}
                                        </Label>
                                        <Input
                                            value={
                                                stepHelp.why ||
                                                tStudy(`study.help.step_${step.id}.why`)
                                            }
                                            onChange={(e) => {
                                                updateTranslation(activeLocale, (t) => {
                                                    if (!t.step_help) t.step_help = {};
                                                    if (!t.step_help[step.id.toString()])
                                                        t.step_help[step.id.toString()] = {};
                                                    t.step_help[step.id.toString()].why =
                                                        e.target.value;
                                                });
                                            }}
                                            placeholder={tPlaceHolder(
                                                `study.help.step_${step.id}.why`
                                            )}
                                            disabled={readOnly}
                                            className="font-medium text-sm h-11 rounded-xl bg-slate-50/30"
                                        />
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </CardContent>
            </Card>
        </div>
    );
};

export default InterfaceEditor;
