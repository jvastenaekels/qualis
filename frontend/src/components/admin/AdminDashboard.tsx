import { useState } from 'react';
import {
    Plus,
    Upload,
    ArrowRight,
    Users,
    Calendar,
    AlertTriangle,
    CheckCircle2,
    Circle,
    Clock,
    PencilRuler,
    Link2,
    Download,
    ChartColumnStacked,
    Briefcase,
    FlaskConical,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow, format } from 'date-fns';
import { cn } from '@/lib/utils';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useAuthStore } from '@/store/useAuthStore';
import { CreateStudyDialog } from '@/components/admin/CreateStudyDialog';
import { ImportStudyDialog } from '@/components/admin/ImportStudyDialog';
import { useTranslation } from 'react-i18next';
import { useAdminDashboard } from '@/hooks/admin/useAdminDashboard';
import type { StudyRead } from '@/api/model/studyRead';

type TranslateFn = ReturnType<typeof useTranslation>['t'];

function getStateColor(state: string | undefined): string {
    switch (state) {
        case 'active':
            return 'bg-emerald-100 text-emerald-700 border-emerald-200';
        case 'draft':
            return 'bg-slate-100 text-slate-600 border-slate-200';
        case 'paused':
            return 'bg-amber-100 text-amber-700 border-amber-200';
        case 'closed':
            return 'bg-blue-100 text-blue-700 border-blue-200';
        case 'archived':
            return 'bg-gray-100 text-gray-500 border-gray-200';
        default:
            return 'bg-slate-100 text-slate-600 border-slate-200';
    }
}

function getStateIcon(state: string | undefined) {
    switch (state) {
        case 'active':
            return (
                <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
            );
        case 'draft':
            return <Circle className="h-3 w-3 text-slate-400" />;
        case 'paused':
            return <Clock className="h-3 w-3 text-amber-500" />;
        case 'closed':
            return <CheckCircle2 className="h-3 w-3 text-blue-500" />;
        default:
            return <Circle className="h-3 w-3 text-slate-400" />;
    }
}

export function AdminDashboard() {
    const { currentProject } = useAuthStore();
    const navigate = useNavigate();
    const { t } = useTranslation();
    const {
        isLoading,
        hasStudies,
        projectSlug,
        studies,
        activeStudies,
        draftStudies,
        pausedStudies,
        closedStudies,
        totalParticipants,
        alerts,
        currentLocale,
        showCreateDialog,
        showImportDialog,
        setShowCreateDialog,
        setShowImportDialog,
        getStudyTitle,
        handleOpenStudy,
    } = useAdminDashboard();

    if (isLoading) {
        return (
            <div className="flex flex-1 flex-col gap-6 p-4 md:p-8 max-w-[1100px] mx-auto w-full">
                <Skeleton className="h-8 w-64" />
                <Skeleton className="h-5 w-48" />
                <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
                    <Skeleton className="h-40 rounded-xl" />
                    <Skeleton className="h-40 rounded-xl" />
                </div>
                <Skeleton className="h-60 rounded-xl" />
            </div>
        );
    }

    // Show onboarding only until a study is created
    if (!hasStudies) {
        return (
            <div className="flex flex-1 flex-col gap-6 p-4 md:p-8 max-w-[1100px] mx-auto w-full animate-in fade-in-50 duration-500">
                <div>
                    <div className="flex items-center gap-2.5">
                        <Briefcase className="h-6 w-6 text-indigo-500" />
                        <h1 className="text-2xl font-bold tracking-tight">
                            {currentProject?.title}
                        </h1>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                        {t('admin.dashboard.get_started', 'Get started with your research project')}
                    </p>
                </div>

                <Card className="border-dashed">
                    <CardContent className="pt-6">
                        <h2 className="text-lg font-semibold mb-6">
                            {t('admin.dashboard.onboarding_title', 'First steps')}
                        </h2>
                        <ol className="space-y-4">
                            <OnboardingStep
                                step={1}
                                done
                                title={t(
                                    'admin.dashboard.step_create_project',
                                    'Create your project'
                                )}
                                description={t(
                                    'admin.dashboard.step_create_project_desc',
                                    'Your project is ready.'
                                )}
                            />
                            <OnboardingStep
                                step={2}
                                done={false}
                                title={t(
                                    'admin.dashboard.step_concourse',
                                    'Collect statements in the concourse'
                                )}
                                description={t(
                                    'admin.dashboard.step_concourse_desc',
                                    'Add the candidate statements from your literature review.'
                                )}
                                action={() => navigate(`/app/${projectSlug}/concourses`)}
                                actionLabel={t('admin.dashboard.go_to_concourse', 'Open concourse')}
                            />
                            <OnboardingStep
                                step={3}
                                done={false}
                                title={t('admin.dashboard.step_qset', 'Select the Q-set')}
                                description={t(
                                    'admin.dashboard.step_qset_desc',
                                    'Review and accept the items that will form your Q-set.'
                                )}
                                action={() => navigate(`/app/${projectSlug}/concourses`)}
                                actionLabel={t('admin.dashboard.go_to_qset', 'Open Q-set')}
                            />
                            <OnboardingStep
                                step={4}
                                done={false}
                                title={t('admin.dashboard.step_study', 'Create a study')}
                                description={t(
                                    'admin.dashboard.step_study_desc',
                                    'Define the sorting grid for your Q-sort.'
                                )}
                                action={() => setShowCreateDialog(true)}
                                actionLabel={t('admin.dashboard.create_study', 'Create study')}
                            />
                        </ol>
                    </CardContent>
                </Card>

                <CreateStudyDialog
                    open={showCreateDialog}
                    onOpenChange={setShowCreateDialog}
                    projectSlug={projectSlug}
                />
            </div>
        );
    }

    return (
        <div className="flex flex-1 flex-col gap-6 p-4 md:p-8 max-w-[1100px] mx-auto w-full animate-in fade-in-50 duration-500">
            {/* Header */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <div className="flex items-center gap-2.5">
                        <Briefcase className="h-6 w-6 text-indigo-500" />
                        <h1 className="text-2xl font-bold tracking-tight">
                            {currentProject?.title}
                        </h1>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                        <TooltipProvider delayDuration={300}>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <span className="cursor-help underline decoration-dotted decoration-slate-300 underline-offset-4">
                                        {t('admin.dashboard.n_studies', {
                                            count: studies?.length ?? 0,
                                            defaultValue: '{{count}} studies',
                                        })}
                                    </span>
                                </TooltipTrigger>
                                <TooltipContent side="bottom" className="max-w-xs text-xs">
                                    {t(
                                        'admin.dashboard.n_studies_help',
                                        'Total number of studies in this project, including drafts and closed.'
                                    )}
                                </TooltipContent>
                            </Tooltip>
                            <span className="text-border">|</span>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <span className="cursor-help underline decoration-dotted decoration-slate-300 underline-offset-4">
                                        {t('admin.dashboard.n_active', {
                                            count: activeStudies.length,
                                            defaultValue: '{{count}} active',
                                        })}
                                    </span>
                                </TooltipTrigger>
                                <TooltipContent side="bottom" className="max-w-xs text-xs">
                                    {t(
                                        'admin.dashboard.n_active_help',
                                        'Studies currently accepting participant submissions (state = active).'
                                    )}
                                </TooltipContent>
                            </Tooltip>
                            <span className="text-border">|</span>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <span className="cursor-help underline decoration-dotted decoration-slate-300 underline-offset-4">
                                        {t('admin.dashboard.n_participants_total', {
                                            count: totalParticipants,
                                            defaultValue: '{{count}} participants',
                                        })}
                                    </span>
                                </TooltipTrigger>
                                <TooltipContent side="bottom" className="max-w-xs text-xs">
                                    {t(
                                        'admin.dashboard.n_participants_total_help',
                                        'Sum of completed participants across all studies in this project.'
                                    )}
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <Button onClick={() => setShowImportDialog(true)} variant="outline" size="sm">
                        <Upload className="mr-2 h-3.5 w-3.5" />
                        {t('admin.dashboard.import_study', 'Import')}
                    </Button>
                    <Button onClick={() => setShowCreateDialog(true)} size="sm">
                        <Plus className="mr-2 h-3.5 w-3.5" />
                        {t('admin.dashboard.create_study', 'Create study')}
                    </Button>
                </div>
            </div>

            {/* Alerts */}
            {alerts.length > 0 && (
                <Card className="border-amber-200 bg-amber-50/50">
                    <CardContent className="py-3 px-4">
                        <div className="flex items-start gap-3">
                            <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                            <div className="space-y-1.5 flex-1">
                                <p className="text-sm font-medium text-amber-800">
                                    {t('admin.dashboard.attention', 'Needs attention')}
                                </p>
                                {alerts.map((alert) => (
                                    <div
                                        key={alert.key}
                                        className="flex items-center justify-between gap-2"
                                    >
                                        <p className="text-sm text-amber-700">{alert.message}</p>
                                        {alert.action && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="text-amber-700 hover:text-amber-800 shrink-0 h-7 px-2"
                                                onClick={alert.action}
                                            >
                                                {alert.actionLabel}
                                            </Button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Studies */}
            {studies && studies.length === 1 && studies[0] ? (
                <SingleStudyCard
                    study={studies[0]}
                    title={getStudyTitle(studies[0])}
                    projectSlug={projectSlug}
                    locale={currentLocale}
                    t={t}
                    onCreateStudy={() => setShowCreateDialog(true)}
                />
            ) : (
                <>
                    <div className="flex items-center gap-2">
                        <FlaskConical className="h-5 w-5 text-indigo-500" />
                        <h2 className="text-lg font-semibold">
                            {t('admin.dashboard.studies', 'Studies')}
                        </h2>
                    </div>
                    <StudyGroups
                        activeStudies={activeStudies}
                        pausedStudies={pausedStudies}
                        draftStudies={draftStudies}
                        closedStudies={closedStudies}
                        getTitle={getStudyTitle}
                        onOpen={handleOpenStudy}
                        locale={currentLocale}
                        t={t}
                    />
                </>
            )}

            <CreateStudyDialog
                open={showCreateDialog}
                onOpenChange={setShowCreateDialog}
                projectSlug={projectSlug}
            />
            <ImportStudyDialog
                open={showImportDialog}
                onOpenChange={setShowImportDialog}
                projectSlug={projectSlug}
            />
        </div>
    );
}

// --- Sub-components ---

function OnboardingStep({
    step,
    done,
    title,
    description,
    action,
    actionLabel,
}: {
    step: number;
    done: boolean;
    title: string;
    description: string;
    action?: () => void;
    actionLabel?: string;
}) {
    return (
        <li className="flex gap-4">
            <div
                className={cn(
                    'flex items-center justify-center h-7 w-7 rounded-full text-xs font-bold shrink-0 mt-0.5',
                    done ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                )}
            >
                {done ? <CheckCircle2 className="h-4 w-4" /> : step}
            </div>
            <div className="flex-1 min-w-0">
                <p
                    className={cn(
                        'text-sm font-medium',
                        done && 'text-muted-foreground line-through'
                    )}
                >
                    {title}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
                {action && !done && (
                    <Button
                        variant="outline"
                        size="sm"
                        className="mt-2 h-7 text-xs"
                        onClick={action}
                    >
                        {actionLabel}
                    </Button>
                )}
            </div>
        </li>
    );
}

function SingleStudyCard({
    study,
    title,
    projectSlug,
    locale,
    t,
    onCreateStudy,
}: {
    study: StudyRead;
    title: string;
    projectSlug: string;
    // biome-ignore lint/suspicious/noExplicitAny: date-fns locale type
    locale: any;
    t: TranslateFn;
    onCreateStudy: () => void;
}) {
    const navigate = useNavigate();
    const participants = study.participant_count ?? 0;
    const languageCodes =
        study.translations?.map((tr) => tr.language_code.toUpperCase()).join(', ') ?? '';
    const studyBase = `/app/${projectSlug}/studies/${study.slug}`;

    const tools = [
        {
            key: 'design',
            icon: PencilRuler,
            label: t('admin.sidebar.design', 'Design'),
            help: t(
                'admin.dashboard.tool_help.design',
                'Configure the study: distribution grid, conditions of instruction, statements, consent.'
            ),
            url: `${studyBase}/design`,
        },
        {
            key: 'recruit',
            icon: Link2,
            label: t('admin.sidebar.recruit', 'Access'),
            help: t(
                'admin.dashboard.tool_help.recruit',
                'Recruitment links, access rules, and study URL settings.'
            ),
            url: `${studyBase}/recruitment`,
        },
        {
            key: 'data',
            icon: Download,
            label: t('admin.sidebar.data', 'Data'),
            help: t(
                'admin.dashboard.tool_help.data',
                'Participant responses and exports (CSV, Q-sort dumps).'
            ),
            url: `${studyBase}/data`,
        },
        {
            key: 'analysis',
            icon: ChartColumnStacked,
            label: t('admin.sidebar.analysis', 'Analysis'),
            help: t(
                'admin.dashboard.tool_help.analysis',
                'Factor analysis configuration and historical runs.'
            ),
            url: `${studyBase}/analysis`,
        },
    ];

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <FlaskConical className="h-5 w-5 text-indigo-500" />
                    <h2 className="text-lg font-semibold">
                        {t('admin.dashboard.studies', 'Studies')}
                    </h2>
                </div>
                <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs text-muted-foreground"
                    onClick={onCreateStudy}
                >
                    <Plus className="h-3 w-3 mr-1" />
                    {t('admin.dashboard.add_study', 'Add study')}
                </Button>
            </div>

            <Card
                className="group cursor-pointer hover:border-foreground/20 transition-colors"
                onClick={() => navigate(studyBase)}
            >
                <CardContent className="py-4 px-5">
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                                <div className="shrink-0">{getStateIcon(study.state)}</div>
                                <h3 className="text-base font-semibold truncate group-hover:text-indigo-600 transition-colors">
                                    {title}
                                </h3>
                                <Badge
                                    variant="outline"
                                    className={cn(
                                        'shrink-0 text-2xs border',
                                        getStateColor(study.state)
                                    )}
                                >
                                    {t(
                                        `admin.project.study_states.${study.state}`,
                                        study.state ?? 'draft'
                                    )}
                                </Badge>
                            </div>
                            <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                                {languageCodes && <span>{languageCodes}</span>}
                                <span className="inline-flex items-center gap-1">
                                    <Users className="h-3 w-3" />
                                    {t('admin.dashboard.n_participants', {
                                        count: participants,
                                        defaultValue: '{{count}} participants',
                                    })}
                                </span>
                                <span className="inline-flex items-center gap-1">
                                    <Calendar className="h-3 w-3" />
                                    {formatDistanceToNow(new Date(study.created_at), {
                                        addSuffix: true,
                                        locale,
                                    })}
                                </span>
                                {study.end_date && (
                                    <span className="inline-flex items-center gap-1">
                                        <Clock className="h-3 w-3" />
                                        {t('admin.dashboard.closes', 'Closes')}{' '}
                                        {format(new Date(study.end_date as string), 'PP', {
                                            locale,
                                        })}
                                    </span>
                                )}
                            </div>
                        </div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-1" />
                    </div>

                    {/* Quick-action tool links */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4 pt-3 border-t">
                        <TooltipProvider delayDuration={300}>
                            {tools.map((tool) => (
                                <Tooltip key={tool.key}>
                                    <TooltipTrigger asChild>
                                        <button
                                            type="button"
                                            className="flex flex-col items-center gap-1.5 py-2 px-1 rounded-lg hover:bg-slate-50 transition-colors text-muted-foreground hover:text-foreground"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                navigate(tool.url);
                                            }}
                                        >
                                            <tool.icon className="h-4 w-4" />
                                            <span className="text-2xs font-medium">
                                                {tool.label}
                                            </span>
                                        </button>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="max-w-xs text-xs">
                                        {tool.help}
                                    </TooltipContent>
                                </Tooltip>
                            ))}
                        </TooltipProvider>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

function StudyGroups({
    activeStudies,
    pausedStudies,
    draftStudies,
    closedStudies,
    getTitle,
    onOpen,
    locale,
    t,
}: {
    activeStudies: StudyRead[];
    pausedStudies: StudyRead[];
    draftStudies: StudyRead[];
    closedStudies: StudyRead[];
    getTitle: (s: StudyRead) => string;
    onOpen: (slug: string) => void;
    // biome-ignore lint/suspicious/noExplicitAny: date-fns locale type
    locale: any;
    t: TranslateFn;
}) {
    return (
        <>
            {activeStudies.length > 0 && (
                <StudyGroup
                    label={t('admin.dashboard.active_studies', 'Active')}
                    studies={activeStudies}
                    getTitle={getTitle}
                    onOpen={onOpen}
                    locale={locale}
                    t={t}
                />
            )}
            {pausedStudies.length > 0 && (
                <StudyGroup
                    label={t('admin.dashboard.paused_studies', 'Paused')}
                    studies={pausedStudies}
                    getTitle={getTitle}
                    onOpen={onOpen}
                    locale={locale}
                    t={t}
                />
            )}
            {draftStudies.length > 0 && (
                <StudyGroup
                    label={t('admin.dashboard.draft_studies', 'Drafts')}
                    studies={draftStudies}
                    getTitle={getTitle}
                    onOpen={onOpen}
                    locale={locale}
                    t={t}
                />
            )}
            {closedStudies.length > 0 && (
                <StudyGroup
                    label={t('admin.dashboard.closed_studies', 'Completed')}
                    studies={closedStudies}
                    getTitle={getTitle}
                    onOpen={onOpen}
                    locale={locale}
                    t={t}
                    collapsed
                />
            )}
        </>
    );
}

function StudyGroup({
    label,
    studies,
    getTitle,
    onOpen,
    locale,
    t,
    collapsed = false,
}: {
    label: string;
    studies: StudyRead[];
    getTitle: (s: StudyRead) => string;
    onOpen: (slug: string) => void;
    // biome-ignore lint/suspicious/noExplicitAny: date-fns locale type
    locale: any;
    t: TranslateFn;
    collapsed?: boolean;
}) {
    const [isOpen, setIsOpen] = useState(!collapsed);

    return (
        <div className="space-y-2">
            <button
                type="button"
                className="flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setIsOpen(!isOpen)}
            >
                <span className={cn('transition-transform', isOpen ? 'rotate-90' : 'rotate-0')}>
                    <ArrowRight className="h-3 w-3" />
                </span>
                {label}
                <Badge variant="secondary" className="text-2xs h-5 px-1.5 font-normal">
                    {studies.length}
                </Badge>
            </button>

            {isOpen && (
                <div className="space-y-2">
                    {studies.map((study) => (
                        <StudyRow
                            key={study.id}
                            study={study}
                            title={getTitle(study)}
                            onOpen={() => onOpen(study.slug)}
                            locale={locale}
                            t={t}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

function StudyRow({
    study,
    title,
    onOpen,
    locale,
    t,
}: {
    study: StudyRead;
    title: string;
    onOpen: () => void;
    // biome-ignore lint/suspicious/noExplicitAny: date-fns locale type
    locale: any;
    t: TranslateFn;
}) {
    const languageCodes =
        study.translations?.map((tr) => tr.language_code.toUpperCase()).join(', ') ?? '';
    const participants = study.participant_count ?? 0;

    return (
        <Card
            className="group hover:border-foreground/20 transition-colors cursor-pointer"
            onClick={onOpen}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onOpen();
                }
            }}
            tabIndex={0}
            role="button"
        >
            <CardContent className="py-3 px-4">
                <div className="flex items-center gap-3">
                    {/* State indicator */}
                    <div className="shrink-0 mt-0.5">{getStateIcon(study.state)}</div>

                    {/* Main content */}
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                            <h3 className="text-sm font-semibold truncate group-hover:text-indigo-600 transition-colors">
                                {title}
                            </h3>
                            <Badge
                                variant="outline"
                                className={cn(
                                    'shrink-0 text-2xs border',
                                    getStateColor(study.state)
                                )}
                            >
                                {t(
                                    `admin.project.study_states.${study.state}`,
                                    study.state ?? 'draft'
                                )}
                            </Badge>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                            {languageCodes && <span>{languageCodes}</span>}
                            <span className="inline-flex items-center gap-1">
                                <Users className="h-3 w-3" />
                                {t('admin.dashboard.n_participants', {
                                    count: participants,
                                    defaultValue: '{{count}} participants',
                                })}
                            </span>
                            <span className="inline-flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {formatDistanceToNow(new Date(study.created_at), {
                                    addSuffix: true,
                                    locale,
                                })}
                            </span>
                            {study.end_date && (
                                <span className="inline-flex items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    {t('admin.dashboard.closes', 'Closes')}{' '}
                                    {format(new Date(study.end_date as string), 'PP', { locale })}
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Arrow */}
                    <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                </div>
            </CardContent>
        </Card>
    );
}
