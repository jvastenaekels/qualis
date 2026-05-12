import { cn } from '@/lib/utils';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import type { StudyTranslationCreate } from '@/api/model';
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
    Rocket,
    ArrowRight,
    ChevronLeft,
    ChevronRight,
    Save,
    Languages,
    MoreHorizontal,
    Upload,
    Download,
    NotebookPen,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet';
import { MemoSection } from '@/components/admin/memo/MemoSection';
import { useMemoUnreadBadge } from '@/hooks/admin/useMemoUnreadBadge';
import { useAuthStore } from '@/store/useAuthStore';
import { usePermission } from '@/hooks/usePermission';
import { useAdminContext } from '@/hooks/useAdminContext';
import { DesignerSkeleton } from '@/components/admin/DashboardSkeleton';
import IntroductionEditor from '@/components/admin/designer/IntroductionEditor';
import QuestionBuilder from '@/components/admin/designer/QuestionBuilder';
import QSortEditor from '@/components/admin/designer/QSortEditor';
import PostSortConfigEditor from '@/components/admin/designer/PostSortConfigEditor';
import BrandingEditor from '@/components/admin/designer/BrandingEditor';
import InterfaceEditor from '@/components/admin/designer/InterfaceEditor';
import ConditionOfInstructionEditor from '@/components/admin/designer/ConditionOfInstructionEditor';
import { GuidanceCard } from '@/components/admin/GuidanceCard';
import { useImportConfig, useExportConfig } from '@/hooks/admin/useImportExportConfig';
import { UnsavedChangesDialog } from '@/components/admin/designer/UnsavedChangesDialog';
import { ActivateStudyDialog } from '@/components/admin/designer/ActivateStudyDialog';
import { formatBackendError } from '@/utils/i18nHelpers';
import { useTranslation } from 'react-i18next';
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
import { useStudyDesignPage, type DesignStepId } from '@/hooks/admin/useStudyDesignPage';
import { useStudyDesigner } from '@/store/useStudyDesigner';

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: JSX shell complexity from 7 step-editor panels + toolbar + checklist + read-only overlay; all logic lives in useStudyDesignPage
const StudyDesignPage = () => {
    const { t, i18n } = useTranslation();
    const [activateDialogOpen, setActivateDialogOpen] = useState(false);
    const [memoOpen, setMemoOpen] = useState(false);
    const api = useStudyDesignPage();
    const original = useStudyDesigner((s) => s.original);
    const { user: currentUser } = useAuthStore();
    const { role: projectRole } = usePermission();
    const { project } = useAdminContext();
    const memoUnreadCount = useMemoUnreadBadge('study', original?.id ?? 0, currentUser?.id ?? 0);
    const projectMembers = (project?.members ?? []).map((m) => ({
        user_id: m.user_id,
        display_name: m.user.full_name ?? m.user.email,
    }));
    // Wave B — Import/Export config moved to a `⋯` overflow menu next to Save.
    // The icon-only buttons in the toolbar were ambiguous; a labelled dropdown
    // restores discoverability without re-promoting them to primary actions.
    const importer = useImportConfig();
    const exporter = useExportConfig(api.effectiveSlug);

    // Visual-only state: tab-list scroll chevrons (tightly coupled to the DOM ref)
    const tabsListRef = useRef<HTMLDivElement>(null);
    const [showLeftArrow, setShowLeftArrow] = useState(false);
    const [showRightArrow, setShowRightArrow] = useState(false);

    const checkScroll = useCallback(() => {
        if (tabsListRef.current) {
            const { scrollLeft, scrollWidth, clientWidth } = tabsListRef.current;
            setShowLeftArrow(scrollLeft > 0);
            setShowRightArrow(scrollLeft < scrollWidth - clientWidth - 2);
        }
    }, []);

    useEffect(() => {
        const timer = setTimeout(checkScroll, 100);
        window.addEventListener('resize', checkScroll);
        return () => {
            window.removeEventListener('resize', checkScroll);
            clearTimeout(timer);
        };
    }, [checkScroll]);

    const scrollTabs = (direction: 'left' | 'right') => {
        if (tabsListRef.current) {
            const scrollAmount = 300;
            tabsListRef.current.scrollBy({
                left: direction === 'left' ? -scrollAmount : scrollAmount,
                behavior: 'smooth',
            });
        }
    };

    if (api.isLoading) {
        return <DesignerSkeleton />;
    }

    const { draft } = api;

    if (!draft) return <div>{t('common.errors.study_not_found.title')}</div>;

    return (
        <div
            className="flex flex-col h-full animate-in fade-in duration-500 overflow-hidden max-w-full"
            style={{ animationFillMode: 'forwards' }}
        >
            {/* Toolbar */}
            <div className="border-b bg-background px-3 sm:px-6 py-2 sm:py-3 shrink-0">
                <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-4 min-w-0">
                    {/* Left section: Icon + Title + Status */}
                    <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                        <div
                            className="flex items-center justify-center h-9 w-9 bg-indigo-50/50 border border-indigo-100 rounded-xl shrink-0"
                            title={t('admin.design.toolbar.title')}
                        >
                            <Wand2 className="h-4.5 w-4.5 text-indigo-600" />
                        </div>
                        <div className="h-6 w-px bg-border hidden lg:block" />
                        <h2 className="text-sm font-bold text-slate-800 truncate flex-1">
                            {api.currentTranslation?.title || api.effectiveSlug}
                        </h2>
                        {/* Status Badge */}
                        <div
                            role="status"
                            data-testid="study-status"
                            className={cn(
                                'px-2.5 py-1 rounded-md text-xs font-semibold border shrink-0 hidden md:flex',
                                draft.state === 'active'
                                    ? 'bg-green-50 text-green-700 border-green-200'
                                    : draft.state === 'closed'
                                      ? 'bg-red-50 text-red-700 border-red-200'
                                      : 'bg-amber-50 text-amber-700 border-amber-200'
                            )}
                        >
                            {draft.state === 'active'
                                ? t('admin.status.active')
                                : draft.state === 'closed'
                                  ? t('admin.status.closed')
                                  : draft.state === 'paused'
                                    ? t('admin.status.paused')
                                    : t('admin.status.draft')}
                        </div>
                    </div>

                    {/* Right section: Actions grouped logically */}
                    <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                        {/* Language + Test Group */}
                        <div className="flex items-center gap-1.5 sm:gap-2">
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        data-testid="language-switcher"
                                        className="h-9 gap-2 font-bold bg-white border-slate-200 rounded-lg hover:border-indigo-300 hover:text-indigo-600 transition-all shadow-sm px-2 sm:px-3"
                                    >
                                        <Globe className="h-4 w-4 text-indigo-500" />
                                        <span className="hidden sm:inline">
                                            {api.activeLocale.toUpperCase()}
                                        </span>
                                        <ChevronDown className="h-3 w-3 opacity-50 hidden sm:inline" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent
                                    align="end"
                                    className="w-56 rounded-xl shadow-xl border-slate-100 p-1.5"
                                >
                                    <DropdownMenuLabel className="px-2 py-1.5 text-xs font-semibold text-slate-400">
                                        {t('admin.design.toolbar.select_lang', 'Select language')}
                                    </DropdownMenuLabel>
                                    <DropdownMenuSeparator className="bg-slate-100 my-1" />
                                    {api.activeLanguageCodes.map((lang: string) => (
                                        <DropdownMenuItem
                                            key={lang}
                                            onSelect={() => api.setActiveLocale(lang)}
                                            className={cn(
                                                'flex items-center justify-between cursor-pointer py-2 px-3 rounded-lg transition-all font-medium text-sm',
                                                api.activeLocale === lang
                                                    ? 'bg-indigo-50 text-indigo-700 font-bold'
                                                    : 'hover:bg-slate-50 text-slate-600'
                                            )}
                                        >
                                            <span className="flex items-center gap-3">
                                                {lang.toUpperCase()}
                                            </span>
                                            {api.activeLocale === lang && (
                                                <Check className="h-3.5 w-3.5" />
                                            )}
                                        </DropdownMenuItem>
                                    ))}
                                    <DropdownMenuSeparator className="bg-slate-100 my-1" />
                                    <DropdownMenuItem
                                        onSelect={api.openLangModal}
                                        className="gap-2.5 cursor-pointer py-2 px-3 rounded-lg text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 font-semibold transition-all"
                                    >
                                        <Settings2 className="h-3.5 w-3.5" />
                                        <span>
                                            {t(
                                                'admin.design.toolbar.manage_langs',
                                                'Manage Languages'
                                            )}
                                        </span>
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>

                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={api.handleTestRun}
                                disabled={!api.isLaunchReady}
                                title={t(
                                    'admin.design.toolbar.test_run_help',
                                    "Preview as a participant. These runs aren't included in your data."
                                )}
                                className={cn(
                                    'gap-2 h-9 font-bold rounded-lg shadow-sm transition-all px-2 sm:px-3',
                                    api.isLaunchReady
                                        ? 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700'
                                        : 'bg-slate-50 border-slate-100 text-slate-400 opacity-50 cursor-not-allowed'
                                )}
                            >
                                <Eye className="h-4 w-4 text-indigo-500" />
                                <span className="hidden md:inline">
                                    {t('admin.design.toolbar.test_run')}
                                </span>
                            </Button>

                            <Button
                                variant="outline"
                                size="icon"
                                className="h-9 w-9 rounded-lg relative bg-white border-slate-200 hover:border-indigo-300 hover:text-indigo-600 transition-all shadow-sm"
                                onClick={() => setMemoOpen(true)}
                                aria-label={t('admin.memo.title_study', 'Methodology memo')}
                                title={t('admin.memo.title_study', 'Methodology memo')}
                            >
                                <NotebookPen className="h-4 w-4" />
                                {memoUnreadCount > 0 && (
                                    <span className="absolute -top-1 -right-1 rounded-full bg-amber-100 text-amber-800 text-[10px] leading-none px-1.5 py-0.5 font-medium border border-white">
                                        {memoUnreadCount}
                                    </span>
                                )}
                            </Button>
                        </div>

                        <div className="h-6 w-px bg-slate-200 hidden lg:block" />

                        {/* Save + Export Group */}
                        <div className="flex items-center gap-1.5 sm:gap-2">
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={api.save}
                                // Use the standardised toolbar.save key (Wave E.1).
                                // The previous "save_changes" key was orphaned —
                                // never present in any locale file.
                                title={t('admin.design.toolbar.save', 'Save')}
                                disabled={
                                    api.syncStatus === 'synced' ||
                                    api.syncStatus === 'saving' ||
                                    api.isFullyReadOnly
                                }
                                className={cn(
                                    'h-9 px-2 sm:px-3 font-bold rounded-lg shadow-sm transition-all active:scale-95 gap-2',
                                    api.syncStatus === 'modified'
                                        ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100 hover:border-amber-300'
                                        : 'bg-white text-slate-400 border-slate-200'
                                )}
                            >
                                {api.syncStatus === 'saving' ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : api.syncStatus === 'modified' ? (
                                    <Save className="h-4 w-4" />
                                ) : (
                                    <CheckCircle className="h-4 w-4 text-emerald-500 opacity-80" />
                                )}
                                <span className="hidden md:inline">
                                    {api.syncStatus === 'saving'
                                        ? t('admin.sync.saving', 'Saving...')
                                        : api.syncStatus === 'modified'
                                          ? t('admin.design.toolbar.save', 'Save')
                                          : t('admin.design.toolbar.saved', 'Saved')}
                                </span>
                            </Button>

                            {importer.fileInput}
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        disabled={api.isFullyReadOnly}
                                        title={t(
                                            'admin.design.toolbar.more_actions',
                                            'More actions'
                                        )}
                                        className="h-9 w-9 p-0 rounded-lg text-slate-400 border-slate-200 hover:bg-slate-50 hover:text-slate-600"
                                    >
                                        <MoreHorizontal className="h-4 w-4" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent
                                    align="end"
                                    className="w-56 rounded-xl shadow-xl border-slate-100 p-1.5"
                                >
                                    <DropdownMenuItem
                                        onSelect={importer.triggerImport}
                                        disabled={importer.isImporting || api.isFullyReadOnly}
                                        className="gap-2.5 cursor-pointer py-2 px-3 rounded-lg font-medium text-sm"
                                    >
                                        {importer.isImporting ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                            <Upload className="h-4 w-4 text-indigo-500" />
                                        )}
                                        {t('admin.import.config', 'Import configuration')}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                        onSelect={() => void exporter.triggerExport()}
                                        disabled={exporter.isExporting}
                                        className="gap-2.5 cursor-pointer py-2 px-3 rounded-lg font-medium text-sm"
                                    >
                                        {exporter.isExporting ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                            <Download className="h-4 w-4 text-indigo-500" />
                                        )}
                                        {t('admin.export.config', 'Export configuration')}
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    </div>
                </div>
            </div>

            <LanguageManagerModal isOpen={api.isLangModalOpen} onClose={api.closeLangModal} />
            <UnsavedChangesDialog blocker={api.blocker} />

            <Sheet open={memoOpen} onOpenChange={setMemoOpen}>
                <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
                    <SheetHeader>
                        <SheetTitle>{t('admin.memo.title_study', 'Methodology memo')}</SheetTitle>
                        <SheetDescription>
                            {t(
                                'admin.memo.summary_empty_study',
                                'Optional · for replication & pre-registration'
                            )}
                        </SheetDescription>
                    </SheetHeader>
                    <div className="mt-4">
                        {original && currentUser && (
                            <MemoSection
                                parentType="study"
                                parentId={original.id}
                                currentUserId={currentUser.id}
                                isOwner={projectRole === 'owner'}
                                canEdit={projectRole === 'owner' || projectRole === 'member'}
                                members={projectMembers}
                            />
                        )}
                    </div>
                </SheetContent>
            </Sheet>

            <ActivateStudyDialog
                open={activateDialogOpen}
                onOpenChange={setActivateDialogOpen}
                checklist={api.checklist}
                languageReadiness={api.languageReadiness}
                isActivating={api.isActivating}
                onConfirm={async () => {
                    await api.handleActivate();
                    setActivateDialogOpen(false);
                }}
            />

            {/* Main Content */}
            <div className="flex flex-1 overflow-hidden relative max-w-full min-w-0">
                {/* Read-only Overlay - For non-draft studies */}
                {api.isFullyReadOnly && (
                    <div className="absolute inset-0 z-50 bg-white/60 backdrop-blur-md flex items-start justify-center p-4 sm:p-8 pt-24">
                        <div className="bg-white border-none shadow-2xl rounded-3xl p-6 sm:p-10 max-w-sm sm:max-w-lg text-center pointer-events-auto animate-in zoom-in duration-500">
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
                            <h3 className="text-2xl font-bold text-slate-800 tracking-normal mb-8">
                                {draft.state === 'active'
                                    ? t('admin.design.qsort.grid.locked_active')
                                    : draft.state === 'paused'
                                      ? t('admin.design.qsort.grid.locked_paused')
                                      : t('admin.design.qsort.grid.locked_closed')}
                            </h3>
                            {draft.state === 'active' && (
                                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                                    <Button
                                        variant="default"
                                        disabled={api.isSwitchingToDraft}
                                        className="h-11 px-6 rounded-xl font-bold shadow-lg shadow-amber-200 bg-amber-500 hover:bg-amber-600 text-white"
                                        onClick={api.handleSwitchToDraft}
                                    >
                                        {api.isSwitchingToDraft && (
                                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                        )}
                                        {t(
                                            'admin.study_status.state.switch_to_draft',
                                            'Draft Mode'
                                        )}
                                    </Button>
                                </div>
                            )}
                        </div>
                    </div>
                )}
                {/* Left Pane: Editor */}
                <div className="flex-1 overflow-y-auto overflow-x-hidden bg-muted/30 p-4 sm:p-6 min-w-0">
                    {(() => {
                        // Banner: chrome locale ≠ language being edited.
                        // Researchers are editing one language while reading the
                        // form chrome in another — easy to overwrite the wrong
                        // version unless we say so explicitly.
                        const chromeLocale = (i18n.resolvedLanguage ?? '').toLowerCase();
                        const editing = (api.activeLocale ?? '').toLowerCase();
                        if (!editing || !chromeLocale || chromeLocale === editing) return null;
                        return (
                            <div className="max-w-full lg:max-w-5xl mx-auto mb-4">
                                <div
                                    role="status"
                                    aria-live="polite"
                                    className="flex items-start gap-2 px-3 py-2 rounded-md text-sm bg-amber-50 border border-amber-200 text-amber-900"
                                >
                                    <Languages
                                        className="h-4 w-4 mt-0.5 flex-shrink-0 text-amber-700"
                                        aria-hidden="true"
                                    />
                                    <span>
                                        {t(
                                            'admin.design.editing_language_banner',
                                            'Editing the {{language}} version. Use the language selector in the toolbar to switch.',
                                            { language: api.activeLocale.toUpperCase() }
                                        )}
                                    </span>
                                </div>
                            </div>
                        );
                    })()}
                    <Tabs
                        value={api.activeStep}
                        onValueChange={(v: string) => api.setActiveStep(v as DesignStepId)}
                        className="w-full"
                    >
                        <div className="relative max-w-full lg:max-w-5xl mx-auto mb-8 group/tabs">
                            {showLeftArrow && (
                                <button
                                    type="button"
                                    onClick={() => scrollTabs('left')}
                                    className="absolute -left-4 top-1/2 -translate-y-1/2 z-20 h-9 w-9 flex items-center justify-center bg-white/90 backdrop-blur-md border border-slate-200 rounded-full shadow-xl text-slate-500 hover:text-indigo-600 hover:border-indigo-200 transition-all hover:scale-110 active:scale-95 animate-in fade-in zoom-in duration-300"
                                    aria-label="Scroll left"
                                >
                                    <ChevronLeft size={18} strokeWidth={2.5} />
                                </button>
                            )}

                            <TabsList
                                ref={tabsListRef}
                                onScroll={checkScroll}
                                className="bg-white/70 backdrop-blur-md border border-slate-200/60 p-1 flex flex-nowrap justify-start overflow-x-auto w-full max-w-full shadow-sm snap-x snap-mandatory scroll-smooth rounded-xl h-12 custom-scrollbar"
                            >
                                <TabsTrigger
                                    value="intro"
                                    data-testid="tab-intro"
                                    className="gap-2.5 min-w-fit px-6 flex-none snap-start rounded-xl data-[state=active]:bg-white data-[state=active]:text-indigo-600 data-[state=active]:shadow-md font-bold transition-all data-[state=active]:ring-1 data-[state=active]:ring-indigo-100 text-slate-500 hover:text-slate-900"
                                >
                                    <span
                                        className="opacity-80 group-data-[state=active]:opacity-100 text-lg"
                                        aria-hidden="true"
                                    >
                                        👋
                                    </span>{' '}
                                    {t('admin.design.tabs.welcome')}
                                    {!api.isIntroValid && (
                                        <AlertTriangle size={14} className="text-amber-500 ml-1" />
                                    )}
                                </TabsTrigger>
                                <TabsTrigger
                                    value="pre-sort"
                                    data-testid="tab-pre-sort"
                                    className="gap-2.5 min-w-fit px-6 flex-none snap-start rounded-xl data-[state=active]:bg-white data-[state=active]:text-amber-600 data-[state=active]:shadow-md font-bold transition-all data-[state=active]:ring-1 data-[state=active]:ring-amber-100 text-slate-500 hover:text-slate-900"
                                >
                                    <span
                                        className="opacity-80 group-data-[state=active]:opacity-100 text-lg"
                                        aria-hidden="true"
                                    >
                                        📋
                                    </span>{' '}
                                    {t('admin.design.tabs.presort')}
                                </TabsTrigger>
                                <TabsTrigger
                                    value="condition"
                                    data-testid="tab-condition"
                                    className="gap-2.5 min-w-fit px-6 flex-none snap-start rounded-xl data-[state=active]:bg-white data-[state=active]:text-rose-600 data-[state=active]:shadow-md font-bold transition-all data-[state=active]:ring-1 data-[state=active]:ring-rose-100 text-slate-500 hover:text-slate-900"
                                >
                                    <span
                                        className="opacity-80 group-data-[state=active]:opacity-100 text-lg"
                                        aria-hidden="true"
                                    >
                                        🎯
                                    </span>{' '}
                                    {t('admin.design.tabs.condition')}
                                    {!api.isConditionValid && (
                                        <AlertTriangle size={14} className="text-amber-500 ml-1" />
                                    )}
                                </TabsTrigger>
                                <TabsTrigger
                                    value="q-sort"
                                    data-testid="tab-q-sort"
                                    className="gap-2.5 min-w-fit px-6 flex-none snap-start rounded-xl data-[state=active]:bg-white data-[state=active]:text-purple-600 data-[state=active]:shadow-md font-bold transition-all data-[state=active]:ring-1 data-[state=active]:ring-purple-100 text-slate-500 hover:text-slate-900"
                                >
                                    <span
                                        className="opacity-80 group-data-[state=active]:opacity-100 text-lg"
                                        aria-hidden="true"
                                    >
                                        🧩
                                    </span>{' '}
                                    {t('admin.design.tabs.qsort')}
                                    {!api.isQSortValid && !api.isStructureLocked && (
                                        <AlertTriangle size={14} className="text-amber-500 ml-1" />
                                    )}
                                    {api.isStructureLocked && (
                                        <Lock size={12} className="text-slate-400 ml-1" />
                                    )}
                                </TabsTrigger>
                                <TabsTrigger
                                    value="post-sort"
                                    data-testid="tab-post-sort"
                                    className="gap-2.5 min-w-fit px-6 flex-none snap-start rounded-xl data-[state=active]:bg-white data-[state=active]:text-emerald-600 data-[state=active]:shadow-md font-bold transition-all data-[state=active]:ring-1 data-[state=active]:ring-emerald-100 text-slate-500 hover:text-slate-900"
                                >
                                    <span
                                        className="opacity-80 group-data-[state=active]:opacity-100 text-lg"
                                        aria-hidden="true"
                                    >
                                        💬
                                    </span>{' '}
                                    {t('admin.design.tabs.postsort')}
                                </TabsTrigger>
                                <TabsTrigger
                                    value="branding"
                                    data-testid="tab-branding"
                                    className="gap-2.5 min-w-fit px-6 flex-none snap-start rounded-xl data-[state=active]:bg-white data-[state=active]:text-pink-600 data-[state=active]:shadow-md font-bold transition-all data-[state=active]:ring-1 data-[state=active]:ring-pink-100 text-slate-500 hover:text-slate-900"
                                >
                                    <span
                                        className="opacity-80 group-data-[state=active]:opacity-100 text-lg"
                                        aria-hidden="true"
                                    >
                                        🎨
                                    </span>{' '}
                                    {t('admin.design.tabs.theme')}
                                </TabsTrigger>
                                <TabsTrigger
                                    value="interface"
                                    data-testid="tab-interface"
                                    className="gap-2.5 min-w-fit px-6 flex-none snap-start rounded-xl data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-md font-bold transition-all data-[state=active]:ring-1 data-[state=active]:ring-slate-100 text-slate-500 hover:text-slate-900"
                                >
                                    <span
                                        className="opacity-80 group-data-[state=active]:opacity-100 text-lg"
                                        aria-hidden="true"
                                    >
                                        ✨
                                    </span>{' '}
                                    {t('admin.design.tabs.interface')}
                                </TabsTrigger>
                            </TabsList>

                            {showRightArrow && (
                                <button
                                    type="button"
                                    onClick={() => scrollTabs('right')}
                                    className="absolute -right-4 top-1/2 -translate-y-1/2 z-20 h-10 w-10 flex items-center justify-center bg-white/90 backdrop-blur-md border border-slate-200 rounded-full shadow-xl text-slate-500 hover:text-indigo-600 hover:border-indigo-200 transition-all hover:scale-110 active:scale-95 animate-in fade-in zoom-in duration-300"
                                    aria-label="Scroll right"
                                >
                                    <ChevronRight size={20} strokeWidth={3} />
                                </button>
                            )}
                        </div>

                        {(() => {
                            const isCopy = (
                                api.currentTranslation as
                                    | (StudyTranslationCreate & { _is_copy?: boolean })
                                    | undefined
                            )?._is_copy;
                            if (!isCopy) return null;

                            return (
                                <div className="max-w-4xl mx-auto mb-10 bg-rose-50 border border-rose-100 p-6 rounded-2xl flex items-center gap-6 text-rose-900 shadow-sm animate-in fade-in slide-in-from-top-4 duration-700">
                                    <div className="h-12 w-12 bg-white rounded-xl shadow-sm border border-rose-100 flex items-center justify-center shrink-0">
                                        <AlertTriangle className="h-6 w-6 text-rose-500" />
                                    </div>
                                    <div className="space-y-1">
                                        <h4 className="font-black text-sm text-rose-500">
                                            {t(
                                                'admin.design.translation_needed',
                                                'Translation Required'
                                            )}
                                        </h4>
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
                                <IntroductionEditor readOnly={api.isFullyReadOnly} />
                            </TabsContent>

                            <TabsContent value="pre-sort" className="mt-0 outline-none">
                                <QuestionBuilder
                                    type="pre"
                                    readOnly={api.isFullyReadOnly}
                                    structureLocked={api.isStructureLocked}
                                />
                            </TabsContent>

                            <TabsContent value="condition" className="mt-0 outline-none space-y-6">
                                <ConditionOfInstructionEditor
                                    readOnly={api.isFullyReadOnly}
                                    roughSortLocked={api.roughSortLocked}
                                    roughSortLockedCount={api.roughSortLockedCount}
                                />
                            </TabsContent>

                            <TabsContent value="q-sort" className="mt-0 outline-none space-y-6">
                                {api.isStructureLocked && (
                                    <div className="p-4 sm:p-6 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3 sm:gap-4 shadow-sm mb-6 animate-in fade-in duration-500 translate-y-0 text-amber-900 font-bold">
                                        <div className="bg-white p-2 rounded-xl border border-amber-100 shadow-sm shrink-0">
                                            <Lock className="h-5 w-5 text-amber-600" />
                                        </div>
                                        <div className="flex-1 min-w-0 space-y-1">
                                            <h4 className="text-base font-black tracking-tight">
                                                {t('admin.design.qsort.grid.locked')}
                                            </h4>
                                            <p className="text-sm font-medium opacity-70 leading-relaxed break-words">
                                                {t('admin.design.qsort.grid.locked_desc')}
                                            </p>
                                            {api.original?.state === 'draft' && (
                                                <Button
                                                    variant="link"
                                                    className="h-auto p-0 text-amber-700 underline font-bold text-xs mt-2 hover:text-amber-900 whitespace-normal text-left break-words inline"
                                                    onClick={() =>
                                                        api.navigate(
                                                            `/app/${api.projectSlug}/studies/${api.effectiveSlug}/data`
                                                        )
                                                    }
                                                >
                                                    {t(
                                                        'admin.design.qsort.grid.unlock_hint',
                                                        'Go to Data Explorer to purge sessions and unlock structure'
                                                    )}
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                )}
                                {!api.isGridValid && (
                                    <div className="p-6 bg-rose-50/50 border border-rose-100 rounded-2xl flex items-start gap-4 shadow-sm mb-6 animate-in shake-1 duration-500 text-rose-900 font-bold">
                                        <div className="bg-white p-2 rounded-xl border border-rose-100 shadow-sm shrink-0">
                                            <AlertTriangle className="h-5 w-5 text-rose-500" />
                                        </div>
                                        <div className="flex-1 space-y-1">
                                            <h4 className="text-base font-black tracking-tight">
                                                {t(
                                                    'admin.design.qsort.grid.mismatch_title',
                                                    'Grid capacity mismatch'
                                                )}
                                            </h4>
                                            <p className="text-sm font-medium opacity-70 leading-relaxed">
                                                {t('admin.design.qsort.grid.mismatch_desc', {
                                                    statements: api.statementsCount,
                                                    slots: api.gridCapacity,
                                                })}
                                            </p>
                                        </div>
                                    </div>
                                )}
                                {!api.isStructureLocked && (
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
                                )}
                                <QSortEditor
                                    readOnly={api.isFullyReadOnly}
                                    structureLocked={api.isStructureLocked}
                                />
                            </TabsContent>

                            <TabsContent value="post-sort" className="mt-0 outline-none">
                                <PostSortConfigEditor
                                    readOnly={api.isFullyReadOnly}
                                    structureLocked={api.isStructureLocked}
                                />
                            </TabsContent>

                            <TabsContent value="interface" className="mt-0 outline-none">
                                <InterfaceEditor readOnly={api.isFullyReadOnly} />
                            </TabsContent>

                            <TabsContent value="branding" className="mt-0 outline-none">
                                <BrandingEditor readOnly={api.isFullyReadOnly} />
                            </TabsContent>

                            {/* Sequential Navigation Buttons */}
                            <div className="mt-16 flex items-center justify-between pt-8 border-t border-slate-100">
                                {api.prevStep ? (
                                    <Button
                                        variant="ghost"
                                        onClick={() =>
                                            api.prevStep && api.setActiveStep(api.prevStep.id)
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

                                {api.nextStep ? (
                                    <Button
                                        onClick={() =>
                                            api.nextStep && api.setActiveStep(api.nextStep.id)
                                        }
                                        className="gap-2 h-12 px-8 rounded-xl font-bold bg-white border-2 border-slate-900 text-slate-900 hover:bg-slate-900 hover:text-white transition-all shadow-md group"
                                        data-testid="next-step-button"
                                    >
                                        {t('common.next', 'Next Step')}
                                        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                                    </Button>
                                ) : (
                                    <Button
                                        onClick={() => setActivateDialogOpen(true)}
                                        disabled={
                                            api.isActivating ||
                                            api.isFullyReadOnly ||
                                            !api.isLaunchReady
                                        }
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
                <div className="hidden lg:block w-56 xl:w-64 shrink-0 border-l bg-white p-4 overflow-y-auto">
                    <div className="sticky top-0 space-y-6">
                        <div>
                            <div className="flex items-center gap-3 mb-6">
                                <div className="p-2 bg-indigo-50 rounded-xl">
                                    <CheckCircle className="h-5 w-5 text-indigo-600" />
                                </div>
                                <h3 className="text-sm font-black text-slate-900">
                                    {t('admin.design.checklist.title', 'Checklist')}
                                </h3>
                            </div>

                            <div className="space-y-3" data-testid="readiness-checklist">
                                {api.checklist.map((item, idx) => (
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
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="pt-6 border-t border-slate-100">
                            <h4 className="text-2xs font-black text-slate-400 mb-3">
                                {t('admin.design.checklist.languages', 'Languages')}
                            </h4>
                            <div className="space-y-2">
                                {api.languageReadiness.map((lang) => (
                                    <div
                                        key={lang.code}
                                        className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-100"
                                    >
                                        <span className="text-xs font-black text-slate-700">
                                            {lang.code}
                                        </span>
                                        {lang.isReady ? (
                                            <CheckCircle
                                                className="h-4 w-4 text-emerald-600"
                                                aria-label={t(
                                                    'admin.design.checklist.status_ready',
                                                    'Ready'
                                                )}
                                            />
                                        ) : (
                                            <CircleDashed
                                                className="h-4 w-4 text-amber-600"
                                                aria-label={t(
                                                    'admin.design.checklist.status_pending',
                                                    'Pending'
                                                )}
                                            />
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            {/* Validation Error Dialog */}
            <Dialog open={api.isValidationErrorOpen} onOpenChange={api.setIsValidationErrorOpen}>
                <DialogContent className="max-w-md p-6">
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
                                'Fix these issues to activate:'
                            )}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="mt-4 space-y-3">
                        {api.validationErrors.map((err, idx) => (
                            <div
                                key={idx}
                                className="flex gap-3 text-sm font-bold text-slate-700 bg-slate-50 p-3 rounded-xl border border-slate-100"
                            >
                                <div className="h-2 w-2 rounded-full bg-rose-400 mt-1.5 shrink-0" />
                                <span>{formatBackendError(err, t)}</span>
                            </div>
                        ))}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default StudyDesignPage;
