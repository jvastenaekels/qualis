import { useNavigate, useParams } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useEffect, useState, useRef } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import type {
    StudyUpdate,
    StudyRead,
    StudyTranslationRead,
    StudyTranslationCreate,
} from '@/api/model';
import {
    Wand2,
    Eye,
    Loader2,
    Lock,
    AlertTriangle,
    Globe,
    Check,
    ChevronDown,
    Settings2,
    History,
    Rocket,
    ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { DesignerSkeleton } from '@/components/admin/DashboardSkeleton';
import { useStudyDesigner, projectStudyToUpdate, areStudiesEqual } from '@/store/useStudyDesigner';
import { DEFAULT_STUDY_CONTENT } from '@/constants/studyDefaults';
import IntroductionEditor from '@/components/admin/designer/IntroductionEditor';
import QuestionBuilder from '@/components/admin/designer/QuestionBuilder';
import QSortEditor from '@/components/admin/designer/QSortEditor';
import PostSortConfigEditor from '@/components/admin/designer/PostSortConfigEditor';
import BrandingEditor from '@/components/admin/designer/BrandingEditor';
import InterfaceEditor from '@/components/admin/designer/InterfaceEditor';
import ConditionOfInstructionEditor from '@/components/admin/designer/ConditionOfInstructionEditor';
import { GuidanceCard } from '@/components/admin/designer/GuidanceCard';
import { useAutoSave } from '@/hooks/useAutoSave';
import { SyncStatusIndicator } from '@/components/admin/designer/SyncStatusIndicator';
import { customInstance } from '@/api/mutator';

import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { useGetStudyApiAdminStudiesSlugGet } from '@/api/generated';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import LanguageManagerModal from '@/components/admin/designer/LanguageManagerModal';
import { CircleCheck, CircleDashed, ArrowLeft, CheckCircle } from 'lucide-react';

const DESIGN_STEPS = [
    { id: 'intro', label: 'Welcome' },
    { id: 'pre-sort', label: 'Presort' },
    { id: 'condition', label: 'Instruction' },
    { id: 'q-sort', label: 'Grid & Q-Set' },
    { id: 'post-sort', label: 'Post-sort' },
    { id: 'branding', label: 'Branding' },
    { id: 'interface', label: 'Interface' },
];

const StudyDesignPage = () => {
    const { t } = useTranslation();
    const { slug } = useParams<{ slug: string }>();
    const navigate = useNavigate();
    const {
        draft,
        activeStep,
        activeLocale,
        setStudy,
        setActiveStep,
        setActiveLocale,
        syncStatus,
    } = useStudyDesigner();

    // Enable auto-save
    useAutoSave(1000);

    const [isLangModalOpen, setIsLangModalOpen] = useState(false);

    const { data: study, isLoading } = useGetStudyApiAdminStudiesSlugGet(slug ?? '', {
        query: {
            enabled: !!slug,
        },
    });

    // Initialize designer state when study is loaded
    useEffect(() => {
        if (study) {
            // Deep clone to allow mutation for defaults
            const studyWithDefaults = JSON.parse(JSON.stringify(study));

            // Ensure defaults for methodology tips if missing
            studyWithDefaults.translations?.forEach((tr: StudyTranslationRead) => {
                if (!tr.methodology_tips || tr.methodology_tips.length === 0) {
                    const defaults =
                        DEFAULT_STUDY_CONTENT[tr.language_code] || DEFAULT_STUDY_CONTENT.en;
                    if (defaults?.methodology_tips) {
                        tr.methodology_tips = [...defaults.methodology_tips];
                    }
                }
            });

            const currentDraft = useStudyDesigner.getState().draft;

            if (!currentDraft) {
                // First time load: initialize both original and draft
                setStudy(studyWithDefaults);
            } else {
                // Background update (e.g., after state change in dashboard)
                // Update original first
                useStudyDesigner.getState().updateOriginal(study);

                // Check if draft has unsaved changes
                const projectedUpdate = projectStudyToUpdate(study);
                const draftHasChanges = !areStudiesEqual(currentDraft, projectedUpdate);

                // If draft has no real changes, sync it with the new data
                // This prevents false "unsaved changes" warnings
                if (!draftHasChanges) {
                    useStudyDesigner.setState({
                        draft: projectedUpdate,
                        syncStatus: 'synced',
                    });
                }
                // Otherwise, keep the draft as-is (user has real unsaved changes)
            }
        }
    }, [study, setStudy]);

    const [isActivating, setIsActivating] = useState(false);
    const [validationErrors, setValidationErrors] = useState<string[]>([]);
    const [isValidationErrorOpen, setIsValidationErrorOpen] = useState(false);

    // Dirty State Detection
    const isDirty = syncStatus !== 'synced';

    // Permission States
    const isFullyReadOnly = draft ? draft.state !== 'draft' : false;
    const isStructureLocked = draft ? draft.state !== 'draft' : false; // active, paused, closed

    // Recovery logic: Detect local backup on mount
    const [isRecoveryModalOpen, setIsRecoveryModalOpen] = useState(false);
    const [backupToRestore, setBackupToRestore] = useState<StudyUpdate | null>(null);
    const hasCheckedRecovery = useRef(false);

    useEffect(() => {
        // Only run this check once per page load to prevent annoying popups while editing
        if (hasCheckedRecovery.current) return;

        const backupJson = localStorage.getItem(`open-q-draft-backup-${slug}`);

        // We need draft to be loaded to compare
        if (backupJson && draft) {
            hasCheckedRecovery.current = true;
            try {
                const backup = JSON.parse(backupJson);
                // Compare current live draft (with defaults/normalizations) with backup
                if (!areStudiesEqual(backup, draft)) {
                    setBackupToRestore(backup);
                    setIsRecoveryModalOpen(true);
                }
            } catch (e) {
                console.error('Failed to parse backup:', e);
            }
        } else if (draft) {
            // If draft is loaded but no backup exists, we can also consider the check "done"
            hasCheckedRecovery.current = true;
        }
    }, [slug, draft]);

    const handleRestoreBackup = () => {
        if (backupToRestore) {
            setStudy(backupToRestore as unknown as StudyRead);
            toast.success(t('admin.design.sync.recovered', 'Draft recovered from local backup!'));
        }
        setIsRecoveryModalOpen(false);
    };

    const handleDiscardBackup = () => {
        if (slug) {
            localStorage.removeItem(`open-q-draft-backup-${slug}`);
        }
        setIsRecoveryModalOpen(false);
    };

    // Grid Validation
    const statementsCount = draft?.statements?.length || 0;
    const gridCapacity = (draft?.grid_config || []).reduce(
        (acc, col) => acc + (col.capacity || 0),
        0
    );
    const isGridValid = statementsCount === gridCapacity;

    const handleActivate = async () => {
        if (!slug || !draft) return;

        if (isDirty) {
            toast.warning(
                t('admin.design.sync.wait_save', 'Saving in progress... please wait a moment.')
            );
            return;
        }

        setIsActivating(true);
        try {
            // 1. Explicit Validation
            const errors = await customInstance<string[]>({
                url: `/api/admin/studies/${slug}/validate`,
                method: 'POST',
            });

            if (errors.length > 0) {
                setValidationErrors(errors);
                setIsValidationErrorOpen(true);
                return;
            }

            // 2. Perform state change
            await customInstance({
                url: `/api/admin/studies/${slug}/state`,
                method: 'POST',
                params: { new_state: 'active' },
            });

            toast.success(t('admin.study.state_changed_active') || 'Study is now active!');
            // Reload or partial update? For now, re-fetch study
            window.location.reload();
        } catch (error) {
            toast.error(t('common.errors.unknown') || 'Failed to activate study');
            console.error(error);
        } finally {
            setIsActivating(false);
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

    const currentStepIndex = DESIGN_STEPS.findIndex((s) => s.id === activeStep);
    const nextStep = DESIGN_STEPS[currentStepIndex + 1];
    const prevStep = DESIGN_STEPS[currentStepIndex - 1];

    // Design Checklist logic - in logical/chronological order
    const currentTranslation = draft.translations?.find((t) => t.language_code === activeLocale);

    const checklist = [
        {
            label: t('admin.design.checklist.study_title', 'Study Title'),
            isComplete: !!currentTranslation?.title,
            required: true,
        },
        {
            label: t('admin.design.checklist.consent_defined', 'Consent Form'),
            isComplete: !!(
                currentTranslation?.consent_title && currentTranslation?.consent_description
            ),
            required: true,
        },
        {
            label: t('admin.design.checklist.instructions', 'Instructions'),
            isComplete: !!currentTranslation?.condition_of_instruction,
            required: true,
        },
        {
            label: t('admin.design.checklist.statements', 'Statements'),
            isComplete: (draft.statements?.length || 0) > 0,
            required: true,
        },
        {
            label: t('admin.design.checklist.grid_balance', 'Grid balanced'),
            isComplete: isGridValid,
            required: true,
        },
    ];

    // Calculate readiness for all languages for the global indicator
    const globalRequirementsMet = (draft.statements?.length || 0) > 0 && isGridValid;
    const languageReadiness = (draft.translations || [])
        .filter((t: StudyTranslationCreate & { is_disabled?: boolean }) => !t.is_disabled)
        .map((tr: StudyTranslationCreate) => {
            const isTranslationComplete = !!(
                tr.title &&
                tr.consent_title &&
                tr.consent_description &&
                tr.condition_of_instruction
            );
            return {
                code: tr.language_code,
                isReady: globalRequirementsMet && isTranslationComplete,
            };
        });

    const completedRequiredCount = checklist.filter(
        (item) => item.required && item.isComplete
    ).length;
    const totalRequiredCount = checklist.filter((item) => item.required).length;
    const isLaunchReady = completedRequiredCount === totalRequiredCount;

    return (
        <div
            className="flex flex-col h-full animate-in fade-in duration-500 overflow-hidden max-w-full"
            style={{ animationFillMode: 'forwards' }}
        >
            {/* Toolbar */}
            <div className="border-b bg-background px-4 py-2 flex flex-col lg:flex-row gap-3 lg:items-center justify-between shrink-0">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div
                        className="flex items-center justify-center h-8 w-8 bg-indigo-50 border border-indigo-100 rounded-lg shrink-0"
                        title={t('admin.design.toolbar.title')}
                    >
                        <Wand2 className="h-4 w-4 text-indigo-600" />
                    </div>
                    <div className="h-4 w-px bg-border hidden lg:block" />
                    <div className="flex-1 min-w-0">
                        <h2 className="text-xs sm:text-sm font-black text-slate-900 truncate">
                            {draft.translations?.find((t) => t.language_code === activeLocale)
                                ?.title || draft.slug}
                        </h2>
                    </div>
                    {/* Status Badge */}
                    <div
                        role="status"
                        data-testid="study-status"
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

                <div className="flex items-center gap-2 flex-wrap">
                    {/* Language Switcher - Study Content Language */}
                    <div className="flex items-center gap-2">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    data-testid="language-switcher"
                                    className="h-8 gap-2 font-black bg-white border-slate-200 rounded-lg hover:border-indigo-500 hover:text-indigo-600 transition-all shadow-sm"
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
                                        .filter(
                                            (
                                                t: StudyTranslationCreate & {
                                                    is_disabled?: boolean;
                                                }
                                            ) => !t.is_disabled
                                        )
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
                        disabled
                        className="gap-2 h-8 font-bold bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg shadow-sm transition-all"
                    >
                        <Eye className="h-4 w-4 text-indigo-500" />
                        <span className="hidden sm:inline">
                            {t('admin.design.toolbar.test_run')}
                        </span>
                    </Button>

                    <SyncStatusIndicator className="hidden sm:flex mr-4" />

                    <Button
                        size="sm"
                        onClick={handleActivate}
                        disabled={isActivating || isFullyReadOnly}
                        className={cn(
                            'transition-all h-8 font-black rounded-lg shadow-sm',
                            !isFullyReadOnly
                                ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                                : 'bg-slate-100 text-slate-400'
                        )}
                    >
                        {isActivating ? (
                            <Loader2 className="h-4 w-4 sm:mr-2 animate-spin" />
                        ) : (
                            <Rocket className="h-4 w-4 sm:mr-2" />
                        )}
                        <span className="hidden sm:inline">
                            {t('admin.study_status.state.activate', 'Activate Study')}
                        </span>
                    </Button>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex flex-1 overflow-hidden relative max-w-full">
                {/* Read-only Overlay - For non-draft studies */}
                {isFullyReadOnly && (
                    <div className="absolute inset-0 z-50 bg-white/60 backdrop-blur-md flex items-center justify-center p-4 sm:p-8">
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
                <div className="flex-1 overflow-y-auto overflow-x-hidden bg-muted/30 p-6 min-w-0">
                    <Tabs
                        value={activeStep}
                        // biome-ignore lint/suspicious/noExplicitAny: enum cast
                        onValueChange={(v: string) => setActiveStep(v as any)}
                        className="w-full"
                    >
                        <TabsList className="bg-white/70 backdrop-blur-md border border-slate-200/60 p-1 flex flex-nowrap overflow-x-auto w-full max-w-5xl mx-auto shadow-sm mb-12 scrollbar-hide [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] snap-x snap-mandatory scroll-smooth rounded-2xl h-14">
                            <TabsTrigger
                                value="intro"
                                data-testid="tab-intro"
                                className="gap-2.5 min-w-fit px-6 flex-none snap-start rounded-xl data-[state=active]:bg-white data-[state=active]:text-indigo-600 data-[state=active]:shadow-md font-bold transition-all data-[state=active]:ring-1 data-[state=active]:ring-indigo-100 text-slate-500 hover:text-slate-900"
                            >
                                <span className="opacity-80 group-data-[state=active]:opacity-100 text-lg">
                                    👋
                                </span>{' '}
                                {t('admin.design.tabs.welcome')}
                            </TabsTrigger>
                            <TabsTrigger
                                value="pre-sort"
                                data-testid="tab-pre-sort"
                                className="gap-2.5 min-w-fit px-6 flex-none snap-start rounded-xl data-[state=active]:bg-white data-[state=active]:text-amber-600 data-[state=active]:shadow-md font-bold transition-all data-[state=active]:ring-1 data-[state=active]:ring-amber-100 text-slate-500 hover:text-slate-900"
                            >
                                <span className="opacity-80 group-data-[state=active]:opacity-100 text-lg">
                                    📋
                                </span>{' '}
                                {t('admin.design.tabs.presort')}
                            </TabsTrigger>
                            <TabsTrigger
                                value="condition"
                                data-testid="tab-condition"
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
                                data-testid="tab-post-sort"
                                className="gap-2.5 min-w-fit px-6 flex-none snap-start rounded-xl data-[state=active]:bg-white data-[state=active]:text-emerald-600 data-[state=active]:shadow-md font-bold transition-all data-[state=active]:ring-1 data-[state=active]:ring-emerald-100 text-slate-500 hover:text-slate-900"
                            >
                                <span className="opacity-80 group-data-[state=active]:opacity-100 text-lg">
                                    💬
                                </span>{' '}
                                {t('admin.design.tabs.postsort')}
                            </TabsTrigger>
                            <TabsTrigger
                                value="branding"
                                data-testid="tab-branding"
                                className="gap-2.5 min-w-fit px-6 flex-none snap-start rounded-xl data-[state=active]:bg-white data-[state=active]:text-pink-600 data-[state=active]:shadow-md font-bold transition-all data-[state=active]:ring-1 data-[state=active]:ring-pink-100 text-slate-500 hover:text-slate-900"
                            >
                                <span className="opacity-80 group-data-[state=active]:opacity-100 text-lg">
                                    🎨
                                </span>{' '}
                                {t('admin.design.tabs.theme')}
                            </TabsTrigger>
                            <TabsTrigger
                                value="interface"
                                data-testid="tab-interface"
                                className="gap-2.5 min-w-fit px-6 flex-none snap-start rounded-xl data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-md font-bold transition-all data-[state=active]:ring-1 data-[state=active]:ring-slate-100 text-slate-500 hover:text-slate-900"
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
                                    // biome-ignore lint/suspicious/noExplicitAny: dynamic copy flag
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

                            {/* Sequential Navigation Buttons */}
                            <div className="mt-16 flex items-center justify-between pt-8 border-t border-slate-100">
                                {prevStep ? (
                                    <Button
                                        variant="ghost"
                                        onClick={() =>
                                            setActiveStep(
                                                prevStep.id as
                                                    | 'intro'
                                                    | 'pre-sort'
                                                    | 'condition'
                                                    | 'q-sort'
                                                    | 'post-sort'
                                                    | 'interface'
                                                    | 'branding'
                                            )
                                        }
                                        className="gap-2 h-12 px-6 rounded-xl font-bold text-slate-500 hover:text-slate-900 group"
                                        data-testid="back-step-button"
                                    >
                                        <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
                                        {t('common.back', 'Back')}
                                    </Button>
                                ) : (
                                    <div />
                                )}

                                {nextStep ? (
                                    <Button
                                        onClick={() =>
                                            setActiveStep(
                                                nextStep.id as
                                                    | 'intro'
                                                    | 'pre-sort'
                                                    | 'condition'
                                                    | 'q-sort'
                                                    | 'post-sort'
                                                    | 'interface'
                                                    | 'branding'
                                            )
                                        }
                                        className="gap-2 h-12 px-8 rounded-xl font-bold bg-white border-2 border-slate-900 text-slate-900 hover:bg-slate-900 hover:text-white transition-all shadow-md group"
                                        data-testid="next-step-button"
                                    >
                                        {t('common.next', 'Next Step')}
                                        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                                    </Button>
                                ) : (
                                    <Button
                                        onClick={handleActivate}
                                        disabled={isActivating || isFullyReadOnly || !isLaunchReady}
                                        className="gap-2 h-12 px-8 rounded-xl font-black bg-indigo-600 hover:bg-indigo-700 text-white shadow-xl shadow-indigo-200 transition-all"
                                        data-testid="activate-button"
                                    >
                                        <Rocket className="h-5 w-5" />
                                        {t('admin.study_status.state.activate', 'Activate Study')}
                                    </Button>
                                )}
                            </div>
                        </div>
                    </Tabs>
                </div>

                {/* Design Checklist Sidebar/Widget */}
                {/* Hidden on smaller screens for responsiveness */}
                <div className="hidden xl:block w-64 shrink-0 border-l bg-white p-4 overflow-y-auto">
                    <div className="sticky top-0 space-y-6">
                        <div>
                            <div className="flex items-center gap-3 mb-6">
                                <div className="p-2 bg-indigo-50 rounded-xl">
                                    <CheckCircle className="h-5 w-5 text-indigo-600" />
                                </div>
                                <h3 className="text-sm font-black uppercase tracking-widest text-slate-900">
                                    {t('admin.design.checklist.title', 'Checklist')}
                                </h3>
                            </div>

                            <div className="space-y-3" data-testid="readiness-checklist">
                                {checklist.map((item, idx) => (
                                    <div
                                        key={idx}
                                        className="flex items-start gap-2.5 p-2 rounded-lg border border-transparent transition-all hover:bg-slate-50"
                                    >
                                        {item.isComplete ? (
                                            <CircleCheck
                                                data-testid="checklist-item-complete"
                                                className="h-4 w-4 text-green-500 shrink-0 mt-0.5"
                                            />
                                        ) : item.required ? (
                                            <CircleDashed
                                                data-testid="checklist-item-incomplete"
                                                className="h-4 w-4 text-slate-300 shrink-0 mt-0.5"
                                            />
                                        ) : (
                                            <CircleDashed
                                                data-testid="checklist-item-optional"
                                                className="h-4 w-4 text-slate-200 shrink-0 mt-0.5"
                                            />
                                        )}
                                        <div className="space-y-0.5">
                                            <p
                                                className={cn(
                                                    'text-xs font-bold leading-tight',
                                                    item.isComplete
                                                        ? 'text-slate-900'
                                                        : 'text-slate-500'
                                                )}
                                            >
                                                {item.label}
                                            </p>
                                            {/* Required label removed as per user request */}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="pt-6 border-t border-slate-100">
                            <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">
                                {t('admin.design.checklist.languages', 'Languages')}
                            </h4>
                            <div className="space-y-2">
                                {languageReadiness.map((lang) => (
                                    <div
                                        key={lang.code}
                                        className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-100"
                                    >
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-black uppercase text-slate-700">
                                                {lang.code}
                                            </span>
                                        </div>
                                        {lang.isReady ? (
                                            <div className="flex items-center gap-1.5 px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-md">
                                                <CheckCircle className="h-3 w-3" />
                                                <span className="text-[10px] font-bold uppercase tracking-wide">
                                                    {t(
                                                        'admin.design.checklist.status_ready',
                                                        'Ready'
                                                    )}
                                                </span>
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-1.5 px-2 py-0.5 bg-amber-100 text-amber-700 rounded-md">
                                                <CircleDashed className="h-3 w-3" />
                                                <span className="text-[10px] font-bold uppercase tracking-wide">
                                                    {t(
                                                        'admin.design.checklist.status_pending',
                                                        'Pending'
                                                    )}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Quick Tips removed as requested */}
                    </div>
                </div>
            </div>
            {/* Validation Error Dialog */}
            <Dialog open={isValidationErrorOpen} onOpenChange={setIsValidationErrorOpen}>
                <DialogContent className="max-w-md rounded-3xl p-6">
                    <DialogHeader>
                        <div className="w-12 h-12 bg-rose-50 rounded-xl flex items-center justify-center mb-4 border border-rose-100">
                            <AlertTriangle className="h-6 w-6 text-rose-500" />
                        </div>
                        <DialogTitle className="text-xl font-black text-slate-900 tracking-tight">
                            {t('admin.design.validation.failed_title', 'Configuration Incomplete')}
                        </DialogTitle>
                        <DialogDescription className="text-sm font-medium text-slate-500 mt-2">
                            {t(
                                'admin.design.validation.failed_desc',
                                'Your study cannot be activated yet. Please fix the following issues:'
                            )}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="mt-4 space-y-3">
                        {validationErrors.map((err, idx) => (
                            <div
                                key={idx}
                                className="flex gap-3 text-sm font-bold text-slate-700 bg-slate-50 p-3 rounded-xl border border-slate-100"
                            >
                                <div className="h-2 w-2 rounded-full bg-rose-400 mt-1.5 shrink-0" />
                                <span>{err}</span>
                            </div>
                        ))}
                    </div>
                </DialogContent>
            </Dialog>

            <AlertDialog open={isRecoveryModalOpen} onOpenChange={setIsRecoveryModalOpen}>
                <AlertDialogContent className="max-w-lg rounded-3xl p-8">
                    <AlertDialogHeader>
                        <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center mb-4 border border-indigo-100">
                            <History className="h-6 w-6 text-indigo-500" />
                        </div>
                        <AlertDialogTitle className="text-xl font-black text-slate-900 tracking-tight">
                            {t('admin.design.sync.recovery_title', 'Unsaved Changes Found')}
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-sm font-medium text-slate-500 mt-2 leading-relaxed">
                            {t(
                                'admin.design.sync.recovery_desc',
                                'We found a local version of this study that is more recent than the one on the server. Would you like to restore it?'
                            )}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="flex flex-col sm:flex-row gap-2 mt-6">
                        <AlertDialogCancel
                            onClick={handleDiscardBackup}
                            className="rounded-xl font-bold border-slate-200 text-slate-600 hover:bg-slate-50"
                        >
                            {t('admin.design.sync.recovery_discard', 'Discard local version')}
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleRestoreBackup}
                            className="rounded-xl font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-200"
                        >
                            {t('admin.design.sync.recovery_restore', 'Restore local version')}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
};

export default StudyDesignPage;
