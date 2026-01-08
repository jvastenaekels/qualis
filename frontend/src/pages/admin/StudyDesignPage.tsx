import { useNavigate, useParams } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useEffect, useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
    Wand2,
    Save,
    Eye,
    Loader2,
    Lock,
    AlertTriangle,
    Globe,
    Check,
    ChevronDown,
    Languages,
    Settings2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DesignerSkeleton } from '@/components/admin/DashboardSkeleton';
import { useStudyDesigner } from '@/store/useStudyDesigner';
import IntroductionEditor from '@/components/admin/designer/IntroductionEditor';
import QuestionBuilder from '@/components/admin/designer/QuestionBuilder';
import QSortEditor from '@/components/admin/designer/QSortEditor';
import PostSortConfigEditor from '@/components/admin/designer/PostSortConfigEditor';
import BrandingEditor from '@/components/admin/designer/BrandingEditor';
import InterfaceEditor from '@/components/admin/designer/InterfaceEditor';
import ConditionOfInstructionEditor from '@/components/admin/designer/ConditionOfInstructionEditor';
import { GuidanceCard } from '@/components/admin/designer/GuidanceCard';

import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import {
    useGetStudyApiAdminStudiesSlugGet,
    useUpdateStudyApiAdminStudiesSlugPatch,
} from '@/api/generated';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import LanguageManagerModal from '@/components/admin/designer/LanguageManagerModal';

const StudyDesignPage = () => {
    const { t } = useTranslation();
    const { slug } = useParams<{ slug: string }>();
    const navigate = useNavigate();
    const { draft, activeStep, activeLocale, setStudy, setActiveStep, setActiveLocale } =
        useStudyDesigner();

    const [isLangModalOpen, setIsLangModalOpen] = useState(false);

    const { data: study, isLoading } = useGetStudyApiAdminStudiesSlugGet(slug ?? '', {
        query: {
            enabled: !!slug,
        },
    });
    const updateMutation = useUpdateStudyApiAdminStudiesSlugPatch();

    // Initialize designer state when study is loaded
    useEffect(() => {
        if (study) {
            setStudy(study);
        }
    }, [study, setStudy]);

    // Dirty State Detection
    const isDirty = JSON.stringify(draft) !== JSON.stringify(study);

    // Permission States
    const isFullyReadOnly = draft?.state !== 'draft';
    const isStructureLocked = draft?.state !== 'draft'; // active, paused, closed

    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            // biome-ignore lint/suspicious/noExplicitAny: window hack
            if (isDirty && !(window as any).__isAutoLogout) {
                e.preventDefault();
                e.returnValue = '';
            }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [isDirty]);

    // Grid Validation
    const statementsCount = draft?.statements?.length || 0;
    const gridCapacity = (draft?.grid_config || []).reduce(
        (acc, col) => acc + (col.capacity || 0),
        0
    );
    const isGridValid = statementsCount === gridCapacity;

    const handleSave = async () => {
        if (!slug || !draft) return;

        try {
            await updateMutation.mutateAsync({
                slug,
                // biome-ignore lint/suspicious/noExplicitAny: schema cast
                data: draft as any,
            });
            toast.success(t('admin.design.qsort.updated') || 'Study design saved successfully');
        } catch (error) {
            toast.error(t('common.errors.unknown') || 'Failed to save study design');
            console.error(error);
        }
    };

    const handleTestRun = () => {
        if (!draft || !slug) return;

        // 1. Build synthetic config (same logic as side-preview)
        // biome-ignore lint/suspicious/noExplicitAny: complex draft type
        const translation = (draft.translations as any[])?.find(
            // biome-ignore lint/suspicious/noExplicitAny: complex draft type
            (t: any) => t.language_code === activeLocale
        );

        const syntheticConfig = {
            ...draft,
            title: translation?.title || 'No Title',
            subtitle: translation?.subtitle,
            description: translation?.description,
            objective: translation?.objective,
            instructions: translation?.instructions,
            consent: {
                title: translation?.consent_title,
                description: translation?.consent_description,
                accept: translation?.consent_accept,
                decline: translation?.consent_decline,
            },
            condition_of_instruction: translation?.condition_of_instruction,
            pre_instruction: translation?.pre_instruction,
            ui_labels: translation?.ui_labels || {},
            language: activeLocale,
            // biome-ignore lint/suspicious/noExplicitAny: complex draft type
            statements: (draft.statements || []).map((s: any, index: number) => {
                // biome-ignore lint/suspicious/noExplicitAny: complex draft type
                const st = s.translations?.find((t: any) => t.language_code === activeLocale);
                return {
                    id: index + 1, // Stable numerical ID
                    code: s.code,
                    text: st?.text || '',
                };
            }),
        };

        // 2. Persist to localStorage
        localStorage.setItem(`open-q-test-config-${slug}`, JSON.stringify(syntheticConfig));
        localStorage.setItem(`open-q-pilot-reset-${slug}`, 'true');

        // 3. Open in new tab with mode=test
        window.open(`/study/${slug}?mode=test`, '_blank');
        toast.info(`${t('admin.design.toolbar.test_run')}...`);
    };

    if (isLoading) {
        return <DesignerSkeleton />;
    }

    if (!draft) return <div>{t('common.errors.study_not_found.title')}</div>;

    return (
        <div
            className="flex flex-col h-[calc(100vh-theme(spacing.16))] animate-in fade-in duration-500 overflow-x-hidden"
            style={{ animationFillMode: 'forwards' }}
        >
            {/* Toolbar */}
            <div className="border-b bg-background px-4 sm:px-6 py-2 flex flex-col sm:flex-row gap-2 sm:gap-4 sm:items-center justify-between shrink-0">
                <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1">
                    <div className="flex items-center gap-2 px-2 sm:px-3 py-1 bg-primary/5 rounded-md border border-primary/10 shrink-0">
                        <Wand2 className="h-4 w-4 text-primary" />
                        <span className="text-xs sm:text-sm font-semibold hidden sm:inline">
                            {t('admin.design.toolbar.title')}
                        </span>
                    </div>
                    <div className="h-4 w-px bg-border hidden sm:block" />
                    <h2 className="text-xs sm:text-sm font-medium truncate min-w-0">
                        {draft.translations?.find((t) => t.language_code === activeLocale)?.title ||
                            draft.slug}
                    </h2>
                    {/* Status Badge */}
                    <div
                        className={cn(
                            'px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border shrink-0',
                            draft.state === 'active'
                                ? 'bg-green-100 text-green-700 border-green-200'
                                : draft.state === 'closed'
                                  ? 'bg-red-100 text-red-700 border-red-200'
                                  : 'bg-amber-100 text-amber-700 border-amber-200'
                        )}
                    >
                        {/* Translate status */}
                        {draft.state === 'active'
                            ? t('admin.status.active')
                            : draft.state === 'closed'
                              ? t('admin.status.closed')
                              : draft.state === 'paused'
                                ? t('admin.status.paused')
                                : t('admin.status.draft')}
                    </div>
                </div>

                <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                    {/* Language Switcher - Study Content Language */}
                    <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1 text-slate-400 text-xs hidden sm:flex">
                            <Languages className="h-3.5 w-3.5" />
                            <span className="font-bold uppercase tracking-wider text-[10px]">
                                {t('admin.design.toolbar.editing_language')}
                            </span>
                        </div>

                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    data-testid="language-switcher"
                                    className="h-8 gap-2 font-black bg-white/50 border-slate-200 rounded-lg hover:border-indigo-500 hover:text-indigo-600 transition-all shadow-sm"
                                >
                                    <Globe className="h-3.5 w-3.5 text-indigo-500" />
                                    {activeLocale.toUpperCase()}
                                    <ChevronDown className="h-3 w-3 opacity-50" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                                align="end"
                                className="w-56 rounded-2xl shadow-2xl border-slate-200 p-2"
                            >
                                <DropdownMenuLabel className="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
                                    {t('admin.design.toolbar.select_lang', 'Select language')}
                                </DropdownMenuLabel>
                                <DropdownMenuSeparator className="bg-slate-100 mb-1" />
                                {(() => {
                                    const activeLangs = (draft.translations || [])
                                        // biome-ignore lint/suspicious/noExplicitAny: duck typing translation
                                        .filter((t) => !(t as any).is_disabled)
                                        .map((t) => t.language_code);

                                    const langs = activeLangs.length > 0 ? activeLangs : ['en'];
                                    return langs.map((lang: string) => (
                                        <DropdownMenuItem
                                            key={lang}
                                            onSelect={() => setActiveLocale(lang)}
                                            className={cn(
                                                'flex items-center justify-between cursor-pointer py-2.5 px-3 rounded-xl transition-all font-bold',
                                                activeLocale === lang
                                                    ? 'bg-indigo-50 text-indigo-700 font-black'
                                                    : 'hover:bg-slate-50 text-slate-600'
                                            )}
                                        >
                                            <span className="flex items-center gap-2 uppercase tracking-wide">
                                                {lang}
                                            </span>
                                            {activeLocale === lang && (
                                                <Check className="h-4 w-4 stroke-[3px]" />
                                            )}
                                        </DropdownMenuItem>
                                    ));
                                })()}
                                <DropdownMenuSeparator className="bg-slate-100 my-1" />
                                <DropdownMenuItem
                                    onSelect={() => setIsLangModalOpen(true)}
                                    className="gap-2 cursor-pointer py-2.5 px-3 rounded-xl text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 font-bold transition-all"
                                >
                                    <Settings2 className="h-4 w-4" />
                                    <span>
                                        {t('admin.design.toolbar.manage_langs', 'Manage Languages')}
                                    </span>
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>

                    <LanguageManagerModal
                        isOpen={isLangModalOpen}
                        onClose={() => setIsLangModalOpen(false)}
                    />

                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={handleTestRun}
                        className="gap-2 h-8 font-bold bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg shadow-sm transition-all"
                    >
                        <Eye className="h-4 w-4 text-indigo-500" />
                        <span className="hidden sm:inline">
                            {t('admin.design.toolbar.test_run')}
                        </span>
                    </Button>

                    <Button
                        size="sm"
                        onClick={handleSave}
                        disabled={updateMutation.isPending || isFullyReadOnly}
                        className={cn(
                            'transition-all h-8 font-bold rounded-lg shadow-sm',
                            isDirty &&
                                !isFullyReadOnly &&
                                'ring-2 ring-primary ring-offset-2 shadow-lg animate-pulse'
                        )}
                    >
                        {updateMutation.isPending ? (
                            <Loader2 className="h-4 w-4 sm:mr-2 animate-spin" />
                        ) : (
                            <Save className="h-4 w-4 sm:mr-2" />
                        )}
                        <span className="hidden sm:inline">
                            {isFullyReadOnly
                                ? t('admin.design.toolbar.closed')
                                : isDirty
                                  ? `${t('admin.design.toolbar.save')}*`
                                  : t('admin.design.toolbar.save')}
                        </span>
                    </Button>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex flex-1 overflow-hidden relative">
                {/* Read-only Overlay - For non-draft studies */}
                {isFullyReadOnly && (
                    <div className="absolute inset-0 z-50 bg-white/60 backdrop-blur-md flex items-center justify-center p-4 sm:p-8 pointer-events-none">
                        <div className="bg-white border-none shadow-2xl rounded-3xl p-10 max-w-lg text-center pointer-events-auto animate-in zoom-in duration-500">
                            <div
                                className={cn(
                                    'w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-8 shadow-inner border',
                                    draft.state === 'active'
                                        ? 'bg-emerald-50 border-emerald-100 text-emerald-600'
                                        : draft.state === 'paused'
                                          ? 'bg-amber-50 border-amber-100 text-amber-600'
                                          : 'bg-rose-50 border-rose-100 text-rose-600'
                                )}
                            >
                                {draft.state === 'active' ? (
                                    <Globe className="h-10 w-10" />
                                ) : (
                                    <Lock className="h-10 w-10" />
                                )}
                            </div>
                            <h3 className="text-2xl font-black text-slate-900 tracking-tight">
                                {draft.state === 'active'
                                    ? t('admin.design.qsort.grid.locked_active')
                                    : draft.state === 'paused'
                                      ? t('admin.design.qsort.grid.locked_paused')
                                      : t('admin.design.qsort.grid.locked_closed')}
                            </h3>
                            <p className="text-base font-medium text-slate-500 mt-4 mb-10 text-pretty leading-relaxed">
                                {draft.state === 'active'
                                    ? t('admin.design.qsort.grid.locked_active_desc')
                                    : draft.state === 'paused'
                                      ? t('admin.design.qsort.grid.locked_paused_desc')
                                      : t('admin.design.qsort.grid.locked_closed_desc')}
                            </p>
                            <div className="flex flex-col sm:flex-row gap-4 justify-center">
                                <Button
                                    variant="outline"
                                    className="h-12 px-8 rounded-xl font-bold border-slate-200 hover:bg-slate-50 text-slate-600"
                                    onClick={() => navigate(`/admin/studies/${draft.slug}`)}
                                >
                                    {t('admin.design.toolbar.back_to_study', 'Back to Study')}
                                </Button>
                                {draft.state === 'active' && (
                                    <Button
                                        variant="default"
                                        className="h-12 px-8 rounded-xl font-bold shadow-lg shadow-primary/20"
                                        onClick={() => navigate(`/admin/studies/${draft.slug}`)}
                                    >
                                        {t('admin.study.state.manage')}
                                    </Button>
                                )}
                            </div>
                        </div>
                    </div>
                )}
                {/* Left Pane: Editor */}
                <div className="flex-1 overflow-y-auto bg-muted/30 p-6">
                    <Tabs
                        value={activeStep}
                        // biome-ignore lint/suspicious/noExplicitAny: enum cast
                        onValueChange={(v: string) => setActiveStep(v as any)}
                        className="w-full"
                    >
                        <TabsList className="bg-white/70 backdrop-blur-md border border-slate-200/60 p-1 flex flex-nowrap overflow-x-auto w-full max-w-4xl mx-auto shadow-sm mb-12 scrollbar-hide [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] snap-x snap-mandatory rounded-2xl h-14">
                            <TabsTrigger
                                value="intro"
                                className="gap-2.5 min-w-fit px-6 flex-none snap-start rounded-xl data-[state=active]:bg-white data-[state=active]:text-indigo-600 data-[state=active]:shadow-md font-bold transition-all data-[state=active]:ring-1 data-[state=active]:ring-indigo-100 text-slate-500 hover:text-slate-900"
                            >
                                <span className="opacity-80 group-data-[state=active]:opacity-100 text-lg">
                                    👋
                                </span>{' '}
                                {t('admin.design.tabs.welcome')}
                            </TabsTrigger>
                            <TabsTrigger
                                value="pre-sort"
                                className="gap-2.5 min-w-fit px-6 flex-none snap-start rounded-xl data-[state=active]:bg-white data-[state=active]:text-amber-600 data-[state=active]:shadow-md font-bold transition-all data-[state=active]:ring-1 data-[state=active]:ring-amber-100 text-slate-500 hover:text-slate-900"
                            >
                                <span className="opacity-80 group-data-[state=active]:opacity-100 text-lg">
                                    📋
                                </span>{' '}
                                {t('admin.design.tabs.presort')}
                            </TabsTrigger>
                            <TabsTrigger
                                value="condition"
                                className="gap-2.5 min-w-fit px-6 flex-none snap-start rounded-xl data-[state=active]:bg-white data-[state=active]:text-rose-600 data-[state=active]:shadow-md font-bold transition-all data-[state=active]:ring-1 data-[state=active]:ring-rose-100 text-slate-500 hover:text-slate-900"
                            >
                                <span className="opacity-80 group-data-[state=active]:opacity-100 text-lg">
                                    🎯
                                </span>{' '}
                                {t('admin.design.tabs.condition')}
                            </TabsTrigger>
                            <TabsTrigger
                                value="q-sort"
                                data-testid="tab-q-sort"
                                className="gap-2.5 min-w-fit px-6 flex-none snap-start rounded-xl data-[state=active]:bg-white data-[state=active]:text-purple-600 data-[state=active]:shadow-md font-bold transition-all data-[state=active]:ring-1 data-[state=active]:ring-purple-100 text-slate-500 hover:text-slate-900"
                            >
                                <span className="opacity-80 group-data-[state=active]:opacity-100 text-lg">
                                    🧩
                                </span>{' '}
                                {t('admin.design.tabs.qsort')}
                                {isStructureLocked && (
                                    <Lock size={12} className="text-slate-400 ml-1" />
                                )}
                            </TabsTrigger>
                            <TabsTrigger
                                value="post-sort"
                                className="gap-2.5 min-w-fit px-6 flex-none snap-start rounded-xl data-[state=active]:bg-white data-[state=active]:text-emerald-600 data-[state=active]:shadow-md font-bold transition-all data-[state=active]:ring-1 data-[state=active]:ring-emerald-100 text-slate-500 hover:text-slate-900"
                            >
                                <span className="opacity-80 group-data-[state=active]:opacity-100 text-lg">
                                    🏁
                                </span>{' '}
                                {t('admin.design.tabs.postsort')}
                            </TabsTrigger>
                            <TabsTrigger
                                value="branding"
                                className="gap-2.5 min-w-fit px-6 flex-none snap-start rounded-xl data-[state=active]:bg-white data-[state=active]:text-pink-600 data-[state=active]:shadow-md font-bold transition-all data-[state=active]:ring-1 data-[state=active]:ring-pink-100 text-slate-500 hover:text-slate-900"
                            >
                                <span className="opacity-80 group-data-[state=active]:opacity-100 text-lg">
                                    🎨
                                </span>{' '}
                                {t('admin.design.tabs.theme')}
                            </TabsTrigger>
                            <TabsTrigger
                                value="interface"
                                className="gap-2.5 min-w-fit px-6 flex-none snap-start rounded-xl data-[state=active]:bg-white data-[state=active]:text-cyan-600 data-[state=active]:shadow-md font-bold transition-all data-[state=active]:ring-1 data-[state=active]:ring-cyan-100 text-slate-500 hover:text-slate-900"
                            >
                                <span className="opacity-80 group-data-[state=active]:opacity-100 text-lg">
                                    ✨
                                </span>{' '}
                                {t('admin.design.tabs.interface')}
                            </TabsTrigger>
                        </TabsList>

                        {(() => {
                            const isCopy = (
                                draft.translations?.find(
                                    (t) => t.language_code === activeLocale
                                ) as any
                            )?._is_copy;
                            if (!isCopy) return null;

                            return (
                                <div className="max-w-4xl mx-auto mb-10 bg-rose-50 border border-rose-100 p-6 rounded-2xl flex items-center gap-6 text-rose-900 shadow-sm animate-in fade-in slide-in-from-top-4 duration-700">
                                    <div className="h-12 w-12 bg-white rounded-xl shadow-sm border border-rose-100 flex items-center justify-center shrink-0">
                                        <AlertTriangle className="h-6 w-6 text-rose-500" />
                                    </div>
                                    <div className="space-y-1">
                                        <h4 className="font-black text-sm uppercase tracking-widest text-rose-500">
                                            {t(
                                                'admin.design.translation_needed',
                                                'Translation Required'
                                            )}
                                        </h4>
                                        <p className="text-sm text-rose-900/70 font-bold leading-relaxed">
                                            {t('admin.design.translation_needed_desc')}
                                        </p>
                                    </div>
                                </div>
                            );
                        })()}

                        <div className="max-w-3xl mx-auto pb-20">
                            <TabsContent value="intro" className="mt-0 outline-none space-y-6">
                                <GuidanceCard
                                    title={t(
                                        'admin.design.guidance.intro_title',
                                        'Welcome to the Studio'
                                    )}
                                    description={t(
                                        'admin.design.guidance.intro_desc',
                                        'Start by defining the purpose of your study. This information will be shown to participants before they begin the sorting process.'
                                    )}
                                />
                                <IntroductionEditor />
                            </TabsContent>

                            <TabsContent value="pre-sort" className="mt-0 outline-none">
                                <QuestionBuilder type="pre" />
                            </TabsContent>

                            <TabsContent value="condition" className="mt-0 outline-none space-y-6">
                                <ConditionOfInstructionEditor />
                            </TabsContent>

                            <TabsContent value="q-sort" className="mt-0 outline-none space-y-6">
                                {isStructureLocked && (
                                    <div className="p-6 bg-indigo-50/50 border border-indigo-100 rounded-2xl flex items-start gap-4 shadow-sm mb-6 animate-in fade-in duration-500 translate-y-0 text-indigo-900 font-bold">
                                        <div className="bg-white p-2 rounded-xl border border-indigo-100 shadow-sm shrink-0">
                                            <Lock className="h-5 w-5 text-indigo-600" />
                                        </div>
                                        <div className="flex-1 space-y-1">
                                            <h4 className="text-base font-black tracking-tight">
                                                {t('admin.design.qsort.grid.locked')}
                                            </h4>
                                            <p className="text-sm font-medium opacity-70 leading-relaxed">
                                                {t('admin.design.qsort.grid.locked_desc')}
                                            </p>
                                        </div>
                                    </div>
                                )}
                                {!isGridValid && (
                                    <div className="p-6 bg-rose-50/50 border border-rose-100 rounded-2xl flex items-start gap-4 shadow-sm mb-6 animate-in shake-1 duration-500 text-rose-900 font-bold">
                                        <div className="bg-white p-2 rounded-xl border border-rose-100 shadow-sm shrink-0">
                                            <AlertTriangle className="h-5 w-5 text-rose-500" />
                                        </div>
                                        <div className="flex-1 space-y-1">
                                            <h4 className="text-base font-black tracking-tight">
                                                {t('admin.design.qsort.grid.mismatch_title')}
                                            </h4>
                                            <p className="text-sm font-medium opacity-70 leading-relaxed">
                                                {t('admin.design.qsort.grid.mismatch_desc', {
                                                    statements: statementsCount,
                                                    slots: gridCapacity,
                                                })}
                                            </p>
                                        </div>
                                    </div>
                                )}
                                <GuidanceCard
                                    title={t(
                                        'admin.design.guidance.qsort_title',
                                        'Statement & Grid Balance'
                                    )}
                                    description={t(
                                        'admin.design.guidance.qsort_desc',
                                        'Ensure your grid capacity exactly matches the number of statements. A balanced Q-set usually has between 30 and 60 items for robust factor analysis.'
                                    )}
                                />
                                <QSortEditor />
                            </TabsContent>

                            <TabsContent value="post-sort" className="mt-0 outline-none">
                                <PostSortConfigEditor />
                            </TabsContent>

                            <TabsContent value="interface" className="mt-0 outline-none">
                                <InterfaceEditor />
                            </TabsContent>

                            <TabsContent value="branding" className="mt-0 outline-none">
                                <BrandingEditor />
                            </TabsContent>
                        </div>
                    </Tabs>
                </div>
            </div>
        </div>
    );
};

export default StudyDesignPage;
