import { useState } from 'react';
import {
    Plus,
    Upload,
    ArrowRight,
    Users,
    Calendar,
    Library,
    AlertTriangle,
    CheckCircle2,
    Circle,
    Clock,
    Settings2,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow, format } from 'date-fns';
import { enUS, fr, fi } from 'date-fns/locale';
import { cn } from '@/lib/utils';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthStore } from '@/store/useAuthStore';
import {
    useListStudiesApiAdminStudiesGet,
    useListConcoursesApiAdminConcoursesGet,
    useGetConcourseApiAdminConcoursesConcourseIdGet,
    useListTagsApiAdminConcoursesTagsGet,
    useListProjectMembersApiAdminProjectsSlugMembersGet,
} from '@/api/generated';
import { CreateStudyDialog } from '@/components/admin/CreateStudyDialog';
import { ImportStudyDialog } from '@/components/admin/ImportStudyDialog';
import { useAdminStore } from '@/store/useAdminStore';
import { useTranslation } from 'react-i18next';
import { usePermission } from '@/hooks/usePermission';
import type { StudyRead } from '@/api/model/studyRead';
import type { ProjectMemberRead } from '@/api/model/projectMemberRead';
import type { ConcourseTagRead } from '@/api/model/concourseTagRead';

type TranslateFn = ReturnType<typeof useTranslation>['t'];

// biome-ignore lint/suspicious/noExplicitAny: date locales from date-fns
const DATE_LOCALES: Record<string, any> = { en: enUS, fr, fi };

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
    const { setActiveStudy } = useAdminStore();
    const [showCreateDialog, setShowCreateDialog] = useState(false);
    const [showImportDialog, setShowImportDialog] = useState(false);
    const { t, i18n } = useTranslation();
    const { can } = usePermission();
    const currentLocale = DATE_LOCALES[i18n.language] || enUS;
    const projectSlug = currentProject?.slug || '';

    // Data fetching
    const { data: allStudiesData, isLoading: studiesLoading } = useListStudiesApiAdminStudiesGet(
        undefined,
        { query: { enabled: !!currentProject?.id } }
    );
    const { data: concoursesData, isLoading: concoursesLoading } =
        useListConcoursesApiAdminConcoursesGet(undefined, {
            query: { enabled: !!currentProject?.id },
        });
    const { data: tagsData } = useListTagsApiAdminConcoursesTagsGet({
        query: { enabled: !!currentProject?.id },
    });
    const { data: membersData } = useListProjectMembersApiAdminProjectsSlugMembersGet(
        projectSlug,
        undefined,
        { query: { enabled: !!projectSlug } }
    );

    const concourses = concoursesData?.items?.filter((c) => c.project_id === currentProject?.id);
    const concourseId = concourses?.[0]?.id;

    const { data: concourseDetail } = useGetConcourseApiAdminConcoursesConcourseIdGet(
        concourseId as number,
        { query: { enabled: !!concourseId } }
    );

    const studies = allStudiesData?.items?.filter((s) => s.project_id === currentProject?.id);
    const tags = tagsData?.filter((tag) => tag.project_id === currentProject?.id);
    const members = membersData?.items;

    // Derived data
    const activeStudies = studies?.filter((s) => s.state === 'active') ?? [];
    const draftStudies = studies?.filter((s) => s.state === 'draft') ?? [];
    const pausedStudies = studies?.filter((s) => s.state === 'paused') ?? [];
    const closedStudies =
        studies?.filter((s) => s.state === 'closed' || s.state === 'archived') ?? [];
    const totalParticipants = studies?.reduce((sum, s) => sum + (s.participant_count ?? 0), 0) ?? 0;

    // Concourse stats
    const items = concourseDetail?.items ?? [];
    const acceptedCount = items.filter((i) => i.status === 'accepted').length;
    const proposedCount = items.filter((i) => i.status === 'proposed').length;
    const rejectedCount = items.filter((i) => i.status === 'rejected').length;
    const totalItems = items.length;

    // Alerts
    const alerts: Array<{
        key: string;
        message: string;
        action?: () => void;
        actionLabel?: string;
    }> = [];

    // Check for studies near deadline with low participation
    for (const study of activeStudies) {
        if (study.end_date) {
            const endDate = new Date(study.end_date as string);
            const now = new Date();
            const daysLeft = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            if (daysLeft <= 7 && daysLeft > 0) {
                const title = getStudyTitle(study);
                alerts.push({
                    key: `deadline-${study.id}`,
                    message: t('admin.dashboard.alert_deadline', {
                        study: title,
                        days: daysLeft,
                        count: study.participant_count ?? 0,
                        defaultValue:
                            '{{study}}: closing in {{days}} days with {{count}} participants',
                    }),
                    action: () => handleOpenStudy(study.slug),
                    actionLabel: t('admin.dashboard.view', 'View'),
                });
            }
        }
    }

    const isLoading = studiesLoading || concoursesLoading;

    function getStudyTitle(study: NonNullable<typeof studies>[number]): string {
        const translation = study.translations?.find((tr) => tr.language_code === i18n.language);
        if (translation?.title) return translation.title;
        const fallback = study.translations?.find((tr) => tr.language_code === 'en');
        if (fallback?.title) return fallback.title;
        const anyTranslation = study.translations?.find((tr) => tr.title);
        if (anyTranslation?.title) return anyTranslation.title;
        return study.slug;
    }

    function handleOpenStudy(studySlug: string) {
        setActiveStudy(studySlug);
        navigate(`/app/${projectSlug}/studies/${studySlug}`);
    }

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

    const hasStudies = studies && studies.length > 0;
    const hasConcourseItems = totalItems > 0;
    const hasActiveStudy = activeStudies.length > 0;
    const hasLaunchedStudy =
        hasActiveStudy ||
        (studies?.some((s) => s.state === 'closed' || s.state === 'paused') ?? false);
    const hasParticipants = totalParticipants > 0;

    // Onboarding progress
    const onboardingDone = {
        project: true,
        concourse: hasConcourseItems,
        study: !!hasStudies,
        import: hasLaunchedStudy || hasParticipants,
        launch: hasActiveStudy || hasParticipants,
    };
    const allStepsDone = Object.values(onboardingDone).every(Boolean);

    // Show onboarding when not all steps are complete
    if (!allStepsDone) {
        // Find next action step
        const nextStep = !onboardingDone.concourse
            ? 'concourse'
            : !onboardingDone.study
              ? 'study'
              : !onboardingDone.import
                ? 'import'
                : 'launch';

        return (
            <div className="flex flex-1 flex-col gap-6 p-4 md:p-8 max-w-[1100px] mx-auto w-full animate-in fade-in-50 duration-500">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">{currentProject?.title}</h1>
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
                                done={onboardingDone.project}
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
                                done={onboardingDone.concourse}
                                title={t('admin.dashboard.step_concourse', 'Build your concourse')}
                                description={t(
                                    'admin.dashboard.step_concourse_desc',
                                    'Add the candidate statements that participants will sort.'
                                )}
                                action={
                                    nextStep === 'concourse'
                                        ? () => navigate(`/app/${projectSlug}/concourses`)
                                        : undefined
                                }
                                actionLabel={t('admin.dashboard.go_to_concourse', 'Open concourse')}
                            />
                            <OnboardingStep
                                step={3}
                                done={onboardingDone.study}
                                title={t('admin.dashboard.step_study', 'Create a study')}
                                description={t(
                                    'admin.dashboard.step_study_desc',
                                    'Configure the sorting grid, instructions, and participant flow.'
                                )}
                                action={
                                    nextStep === 'study'
                                        ? () => setShowCreateDialog(true)
                                        : undefined
                                }
                                actionLabel={t('admin.dashboard.create_study', 'Create study')}
                            />
                            <OnboardingStep
                                step={4}
                                done={onboardingDone.import}
                                title={t(
                                    'admin.dashboard.step_import',
                                    'Import accepted items into your study'
                                )}
                                description={t(
                                    'admin.dashboard.step_import_desc',
                                    'Select which concourse items become study statements.'
                                )}
                                action={
                                    nextStep === 'import' && hasStudies
                                        ? () => handleOpenStudy(studies[0].slug)
                                        : undefined
                                }
                                actionLabel={t('admin.dashboard.open_study', 'Open study')}
                            />
                            <OnboardingStep
                                step={5}
                                done={onboardingDone.launch}
                                title={t('admin.dashboard.step_launch', 'Launch recruitment')}
                                description={t(
                                    'admin.dashboard.step_launch_desc',
                                    'Generate participation links and share them.'
                                )}
                                action={
                                    nextStep === 'launch' && hasStudies
                                        ? () => handleOpenStudy(studies[0].slug)
                                        : undefined
                                }
                                actionLabel={t('admin.dashboard.open_study', 'Open study')}
                            />
                        </ol>
                    </CardContent>
                </Card>

                {/* Still show studies/concourse below onboarding if they exist */}
                {(hasStudies || hasConcourseItems) && (
                    <>
                        {/* Concourse + Team row */}
                        <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
                            <ConcourseCard
                                totalItems={totalItems}
                                acceptedCount={acceptedCount}
                                proposedCount={proposedCount}
                                rejectedCount={rejectedCount}
                                tags={tags}
                                onNavigate={() => navigate(`/app/${projectSlug}/concourses`)}
                                t={t}
                            />
                            <TeamCard
                                members={members}
                                canManage={can('project:settings')}
                                onNavigate={() => navigate(`/app/${projectSlug}/settings`)}
                                t={t}
                            />
                        </div>

                        {hasStudies && (
                            <>
                                <div className="space-y-1">
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
                    </>
                )}

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
                    <h1 className="text-2xl font-bold tracking-tight">{currentProject?.title}</h1>
                    <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                        <span>
                            {t('admin.dashboard.n_studies', {
                                count: studies?.length ?? 0,
                                defaultValue: '{{count}} studies',
                            })}
                        </span>
                        <span className="text-border">|</span>
                        <span>
                            {t('admin.dashboard.n_active', {
                                count: activeStudies.length,
                                defaultValue: '{{count}} active',
                            })}
                        </span>
                        <span className="text-border">|</span>
                        <span>
                            {t('admin.dashboard.n_participants_total', {
                                count: totalParticipants,
                                defaultValue: '{{count}} participants',
                            })}
                        </span>
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

            {/* Concourse + Team row */}
            <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
                <ConcourseCard
                    totalItems={totalItems}
                    acceptedCount={acceptedCount}
                    proposedCount={proposedCount}
                    rejectedCount={rejectedCount}
                    tags={tags}
                    onNavigate={() => navigate(`/app/${projectSlug}/concourses`)}
                    t={t}
                />
                <TeamCard
                    members={members}
                    canManage={can('project:settings')}
                    onNavigate={() => navigate(`/app/${projectSlug}/settings`)}
                    t={t}
                />
            </div>

            {/* Studies */}
            <div className="space-y-1">
                <h2 className="text-lg font-semibold">{t('admin.dashboard.studies', 'Studies')}</h2>
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

function ConcourseCard({
    totalItems,
    acceptedCount,
    proposedCount,
    rejectedCount,
    tags,
    onNavigate,
    t,
}: {
    totalItems: number;
    acceptedCount: number;
    proposedCount: number;
    rejectedCount: number;
    tags?: ConcourseTagRead[];
    onNavigate: () => void;
    t: TranslateFn;
}) {
    return (
        <Card
            className="md:col-span-2 cursor-pointer hover:border-foreground/20 transition-colors"
            onClick={onNavigate}
        >
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Library className="h-4 w-4 text-muted-foreground" />
                        <CardTitle className="text-sm font-semibold">
                            {t('admin.dashboard.concourse', 'Concourse')}
                        </CardTitle>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </div>
            </CardHeader>
            <CardContent className="space-y-3">
                {totalItems > 0 ? (
                    <>
                        <div className="flex items-baseline gap-2">
                            <span className="text-2xl font-bold">{totalItems}</span>
                            <span className="text-sm text-muted-foreground">
                                {t('admin.concourse.items_label', 'items')}
                            </span>
                        </div>
                        <div className="flex h-2.5 rounded-full overflow-hidden bg-slate-100">
                            {acceptedCount > 0 && (
                                <div
                                    className="bg-emerald-500 transition-all"
                                    style={{ width: `${(acceptedCount / totalItems) * 100}%` }}
                                />
                            )}
                            {proposedCount > 0 && (
                                <div
                                    className="bg-amber-400 transition-all"
                                    style={{ width: `${(proposedCount / totalItems) * 100}%` }}
                                />
                            )}
                            {rejectedCount > 0 && (
                                <div
                                    className="bg-red-300 transition-all"
                                    style={{ width: `${(rejectedCount / totalItems) * 100}%` }}
                                />
                            )}
                        </div>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1.5">
                                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                                {acceptedCount} {t('admin.concourse.status.accepted', 'Accepted')}
                            </span>
                            <span className="flex items-center gap-1.5">
                                <span className="h-2 w-2 rounded-full bg-amber-400" />
                                {proposedCount} {t('admin.concourse.status.proposed', 'Proposed')}
                            </span>
                            {rejectedCount > 0 && (
                                <span className="flex items-center gap-1.5">
                                    <span className="h-2 w-2 rounded-full bg-red-300" />
                                    {rejectedCount}{' '}
                                    {t('admin.concourse.status.rejected', 'Rejected')}
                                </span>
                            )}
                        </div>
                        {tags && tags.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 pt-1">
                                {tags.map((tag) => (
                                    <Badge
                                        key={tag.id}
                                        variant="outline"
                                        className="text-2xs font-normal"
                                    >
                                        {tag.color ? (
                                            <span
                                                className="h-2 w-2 rounded-full mr-1.5 shrink-0"
                                                style={{ backgroundColor: tag.color }}
                                            />
                                        ) : null}
                                        {tag.name}
                                    </Badge>
                                ))}
                            </div>
                        )}
                    </>
                ) : (
                    <p className="text-sm text-muted-foreground">
                        {t(
                            'admin.dashboard.concourse_empty',
                            'No items yet. Start building your statement collection.'
                        )}
                    </p>
                )}
            </CardContent>
        </Card>
    );
}

function TeamCard({
    members,
    canManage,
    onNavigate,
    t,
}: {
    members?: ProjectMemberRead[];
    canManage: boolean;
    onNavigate: () => void;
    t: TranslateFn;
}) {
    return (
        <Card
            className={cn(
                'transition-colors',
                canManage && 'cursor-pointer hover:border-foreground/20'
            )}
            onClick={() => canManage && onNavigate()}
        >
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        <CardTitle className="text-sm font-semibold">
                            {t('admin.dashboard.team', 'Team')}
                        </CardTitle>
                    </div>
                    {canManage && <Settings2 className="h-4 w-4 text-muted-foreground" />}
                </div>
            </CardHeader>
            <CardContent>
                {members && members.length > 0 ? (
                    <div className="space-y-2.5">
                        {members.map((member) => (
                            <div key={member.user_id} className="flex items-center gap-2.5">
                                <div className="flex items-center justify-center h-7 w-7 rounded-full bg-indigo-100 text-indigo-700 text-xs font-semibold shrink-0">
                                    {member.user?.full_name
                                        ? member.user.full_name.substring(0, 2).toUpperCase()
                                        : member.user?.email?.substring(0, 2).toUpperCase()}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium truncate">
                                        {member.user?.full_name || member.user?.email}
                                    </p>
                                </div>
                                <Badge variant="outline" className="text-2xs shrink-0">
                                    {t(`admin.project.roles.${member.role}`, member.role as string)}
                                </Badge>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="text-sm text-muted-foreground">
                        {t('admin.dashboard.team_loading', 'Loading...')}
                    </p>
                )}
            </CardContent>
        </Card>
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
                className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
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
