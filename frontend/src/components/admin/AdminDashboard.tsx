import { useState } from 'react';
import {
    Plus,
    Layout,
    TrendingUp,
    Upload,
    ArrowRight,
    Users,
    Calendar,
    FileText,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { enUS, fr, fi } from 'date-fns/locale';
import { cn } from '@/lib/utils';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthStore } from '@/store/useAuthStore';
import { useListStudiesApiAdminStudiesGet } from '@/api/generated';
import { CreateStudyDialog } from '@/components/admin/CreateStudyDialog';
import { ImportStudyDialog } from '@/components/admin/ImportStudyDialog';
import { useAdminStore } from '@/store/useAdminStore';
import { useTranslation } from 'react-i18next';

const STUDY_GRADIENTS = [
    'from-indigo-500 to-purple-600',
    'from-emerald-500 to-teal-600',
    'from-amber-500 to-orange-600',
    'from-rose-500 to-pink-600',
    'from-sky-500 to-blue-600',
    'from-violet-500 to-fuchsia-600',
];

function getStudyGradient(index: number): string {
    return STUDY_GRADIENTS[index % STUDY_GRADIENTS.length];
}

function getStateStyles(state: string | undefined): string {
    switch (state) {
        case 'active':
            return 'bg-emerald-50 text-emerald-700 border-emerald-200';
        case 'draft':
            return 'bg-slate-50 text-slate-600 border-slate-200';
        case 'paused':
            return 'bg-amber-50 text-amber-700 border-amber-200';
        case 'closed':
            return 'bg-red-50 text-red-700 border-red-200';
        case 'archived':
            return 'bg-gray-50 text-gray-500 border-gray-200';
        default:
            return 'bg-slate-50 text-slate-600 border-slate-200';
    }
}

export function AdminDashboard() {
    const { user, currentWorkspace } = useAuthStore();
    const navigate = useNavigate();
    const { setActiveStudy } = useAdminStore();
    const [showCreateDialog, setShowCreateDialog] = useState(false);
    const [showImportDialog, setShowImportDialog] = useState(false);
    const { data: allStudies, isLoading } = useListStudiesApiAdminStudiesGet({
        query: {
            enabled: !!currentWorkspace?.id,
        },
    });
    const { t, i18n } = useTranslation();

    // biome-ignore lint/suspicious/noExplicitAny: date locales from date-fns
    const dateLocales: Record<string, any> = {
        en: enUS,
        fr: fr,
        fi: fi,
    };
    const currentLocale = dateLocales[i18n.language] || enUS;

    const studies = allStudies?.filter((s) => s.workspace_id === currentWorkspace?.id);

    const totalStudies = studies?.length ?? 0;
    const activeStudiesCount = studies?.filter((s) => s.state === 'active').length ?? 0;
    const totalParticipants = studies?.reduce((sum, s) => sum + (s.participant_count ?? 0), 0) ?? 0;

    const handleOpenStudy = (studySlug: string) => {
        if (currentWorkspace?.slug) {
            setActiveStudy(studySlug);
            navigate(`/app/${currentWorkspace.slug}/studies/${studySlug}`);
        } else {
            setActiveStudy(studySlug);
            navigate(`/admin/studies/${studySlug}`);
        }
    };

    const getStudyTitle = (study: NonNullable<typeof studies>[number]): string => {
        const translation = study.translations?.find((tr) => tr.language_code === i18n.language);
        if (translation?.title) return translation.title;
        const fallback = study.translations?.find((tr) => tr.language_code === 'en');
        if (fallback?.title) return fallback.title;
        return study.slug;
    };

    if (isLoading) {
        return (
            <div className="flex flex-1 flex-col gap-6 p-4 md:p-8 max-w-[1400px] mx-auto w-full">
                <div className="space-y-2">
                    <Skeleton className="h-10 w-64" />
                    <Skeleton className="h-5 w-96" />
                </div>
                <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
                    {[1, 2, 3].map((i) => (
                        <Skeleton key={i} className="h-24 rounded-xl" />
                    ))}
                </div>
                <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                    {[1, 2, 3, 4, 5, 6].map((i) => (
                        <Skeleton key={i} className="h-52 rounded-xl" />
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-1 flex-col gap-6 md:gap-8 p-4 md:p-8 max-w-[1400px] mx-auto w-full animate-in fade-in-50 duration-500">
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div className="space-y-1 min-w-0">
                    <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-foreground">
                        {t('admin.dashboard.welcome', 'Welcome back,')}{' '}
                        <span className="text-indigo-600">{user?.email.split('@')[0]}</span>
                    </h1>
                    <p className="text-sm md:text-base text-muted-foreground">
                        {t(
                            'admin.dashboard.snapshot',
                            "Here's a snapshot of your research activity."
                        )}
                    </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <Button
                        onClick={() => setShowImportDialog(true)}
                        variant="outline"
                        className="border-slate-200 hover:border-indigo-300 hover:text-indigo-600 font-medium rounded-lg"
                    >
                        <Upload className="mr-2 h-4 w-4" />
                        {t('admin.dashboard.import_study', 'Import')}
                    </Button>
                    <Button
                        onClick={() => setShowCreateDialog(true)}
                        className="bg-indigo-600 hover:bg-indigo-700 font-medium rounded-lg"
                    >
                        <Plus className="mr-2 h-4 w-4" />
                        {t('admin.dashboard.create_study', 'Create study')}
                    </Button>
                </div>
            </div>

            {/* Stats Overview */}
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
                <Card className="border shadow-none rounded-xl">
                    <CardContent className="flex items-center gap-4 p-5">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                            <FileText className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                            <p className="text-2xl font-bold text-foreground">{totalStudies}</p>
                            <p className="text-xs text-muted-foreground truncate">
                                {t('admin.dashboard.total_studies', 'Total studies')}
                            </p>
                        </div>
                    </CardContent>
                </Card>
                <Card className="border shadow-none rounded-xl">
                    <CardContent className="flex items-center gap-4 p-5">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                            <TrendingUp className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                            <p className="text-2xl font-bold text-foreground">
                                {activeStudiesCount}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                                {t(
                                    'admin.dashboard.active_data_collection',
                                    'Active data collection'
                                )}
                            </p>
                        </div>
                    </CardContent>
                </Card>
                <Card className="border shadow-none rounded-xl">
                    <CardContent className="flex items-center gap-4 p-5">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-purple-50 text-purple-600">
                            <Users className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                            <p className="text-2xl font-bold text-foreground">
                                {totalParticipants}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                                {t('admin.dashboard.total_participants', 'Total participants')}
                            </p>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Section header */}
            <div>
                <h2 className="text-lg font-semibold text-foreground">
                    {t('admin.dashboard.all_studies', 'All studies')}
                </h2>
                <p className="text-sm text-muted-foreground">
                    {t('admin.dashboard.all_studies_description', 'All studies in this workspace.')}
                </p>
            </div>

            {/* Study Cards Grid */}
            {studies && studies.length > 0 ? (
                <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                    {studies.map((study, index) => {
                        const title = getStudyTitle(study);
                        const languageCount = study.translations?.length ?? 0;

                        return (
                            <Card
                                key={study.id}
                                className="group border shadow-none hover:shadow-md rounded-xl overflow-hidden transition-all duration-200 cursor-pointer hover:border-indigo-200"
                                onClick={() => handleOpenStudy(study.slug)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        handleOpenStudy(study.slug);
                                    }
                                }}
                                tabIndex={0}
                                role="button"
                            >
                                {/* Color accent bar */}
                                <div
                                    className={cn(
                                        'h-1.5 bg-gradient-to-r',
                                        getStudyGradient(index)
                                    )}
                                />

                                <CardContent className="p-5 flex flex-col gap-4">
                                    {/* Title and status */}
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0 flex-1">
                                            <h3 className="font-semibold text-foreground truncate group-hover:text-indigo-600 transition-colors">
                                                {title}
                                            </h3>
                                            <p className="text-xs text-muted-foreground mt-0.5 font-mono">
                                                {study.slug}
                                            </p>
                                        </div>
                                        <Badge
                                            variant="outline"
                                            className={cn(
                                                'shrink-0 text-[10px] font-semibold uppercase tracking-wide border',
                                                getStateStyles(study.state)
                                            )}
                                        >
                                            {t(
                                                `admin.hub.study_states.${study.state}`,
                                                study.state ?? 'draft'
                                            )}
                                        </Badge>
                                    </div>

                                    {/* Metadata row */}
                                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                        <span className="inline-flex items-center gap-1.5">
                                            <Calendar className="h-3.5 w-3.5" />
                                            {formatDistanceToNow(new Date(study.created_at), {
                                                addSuffix: true,
                                                locale: currentLocale,
                                            })}
                                        </span>
                                        {languageCount > 0 && (
                                            <span className="inline-flex items-center gap-1.5">
                                                {t('admin.dashboard.languages_count', {
                                                    count: languageCount,
                                                    defaultValue: '{{count}} languages',
                                                })}
                                            </span>
                                        )}
                                    </div>

                                    {/* Participants + action */}
                                    <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                                        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                                            <Users className="h-3.5 w-3.5" />
                                            {t('admin.dashboard.n_participants', {
                                                count: study.participant_count ?? 0,
                                                defaultValue: '{{count}} participants',
                                            })}
                                        </span>
                                        <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200" />
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            ) : (
                <div className="text-center py-20 bg-muted/30 rounded-xl border border-dashed border-muted">
                    <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-4">
                        <Layout className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <p className="text-sm font-medium text-muted-foreground mb-4">
                        {t(
                            'admin.dashboard.no_studies',
                            'No studies found. Create your first study to get started!'
                        )}
                    </p>
                    <Button
                        onClick={() => setShowCreateDialog(true)}
                        className="bg-indigo-600 hover:bg-indigo-700 font-medium rounded-lg"
                    >
                        <Plus className="mr-2 h-4 w-4" />
                        {t('admin.dashboard.create_study', 'Create study')}
                    </Button>
                </div>
            )}

            <CreateStudyDialog
                open={showCreateDialog}
                onOpenChange={setShowCreateDialog}
                workspaceSlug={currentWorkspace?.slug || ''}
            />
            <ImportStudyDialog
                open={showImportDialog}
                onOpenChange={setShowImportDialog}
                workspaceSlug={currentWorkspace?.slug || ''}
            />
        </div>
    );
}
