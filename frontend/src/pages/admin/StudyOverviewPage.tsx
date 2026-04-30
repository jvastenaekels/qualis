import { useLoaderData, useRevalidator } from 'react-router-dom';

import type { StudyRead, ParticipantRead, StudyStatsRead } from '@/api/model';
import RecruitmentModule from '@/components/admin/dashboard/RecruitmentModule';
import RecentActivityCard from '@/components/admin/dashboard/RecentActivityCard';

import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Users, CheckCircle2, Clock, AlertTriangle, LayoutDashboard } from 'lucide-react';
import { StudyPageHeader } from '@/components/admin/layout/StudyPageHeader';
import StudyStatusControl from '@/components/admin/dashboard/StudyStatusControl';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { useAdminContext } from '@/hooks/useAdminContext';

interface LoaderData {
    stats: StudyStatsRead;
    participants: ParticipantRead[];
    study: StudyRead;
    slug: string;
}

const StudyOverviewPage = () => {
    const { stats, participants, study, slug } = useLoaderData() as LoaderData;
    const { project } = useAdminContext();

    if (!project) {
        // This should not happen if RequireAdmin and ProjectLayout are doing their jobs,
        // but it's better to fail gracefully than crash.
        console.error('No project context found in StudyOverviewPage');
    }

    const revalidator = useRevalidator();
    const { t } = useTranslation();

    const validParticipants = participants?.filter((p) => !p.is_discarded) || [];

    const getStatusLabel = (state: string) => {
        return t(`admin.status.${state}`, state.charAt(0).toUpperCase() + state.slice(1));
    };

    return (
        <div className="flex flex-1 flex-col gap-4 p-4 sm:p-6 pt-2">
            <StudyPageHeader
                title={
                    study?.translations?.[0]?.title || t('admin.study_overview.title', 'Overview')
                }
                icon={LayoutDashboard}
                statusBadge={
                    <Badge
                        variant="outline"
                        role="status"
                        data-testid="study-status"
                        className={cn(
                            'font-semibold text-2xs px-2 py-0.5 rounded-full',
                            study?.state === 'active'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                                : study?.state === 'paused'
                                  ? 'bg-orange-50 text-orange-700 border-orange-100'
                                  : study?.state === 'closed'
                                    ? 'bg-slate-50 text-slate-700 border-slate-100'
                                    : 'bg-amber-50 text-amber-700 border-amber-100'
                        )}
                    >
                        {getStatusLabel(study?.state || 'draft')}
                    </Badge>
                }
                actions={null}
            />

            {/* Key Metrics Dashboard + Study Status */}
            {stats && (
                <>
                    {/* Status Control - Full Width at Top */}
                    <StudyStatusControl
                        slug={slug}
                        currentState={study?.state || 'draft'}
                        onStateChange={() => {
                            revalidator.revalidate();
                        }}
                    />

                    <div className="grid gap-3 sm:gap-4 md:grid-cols-3">
                        {/* Sample Size */}
                        <div className="group relative overflow-hidden bg-white p-3 sm:p-5 rounded-2xl border border-slate-100 shadow-sm">
                            <div
                                className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity"
                                aria-hidden="true"
                            >
                                <Users className="w-24 h-24 text-indigo-500 -mr-6 -mt-6" />
                            </div>
                            <div className="flex items-center gap-2 mb-3">
                                <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600">
                                    <Users className="w-5 h-5" aria-hidden="true" />
                                </div>
                                <span className="text-xs font-bold text-slate-500">
                                    {t('admin.study_overview.sample_size', 'Sample size (N)')}
                                </span>
                            </div>
                            <div className="text-xl sm:text-4xl font-black text-slate-900 tracking-tight">
                                {stats.completed_count}
                            </div>
                        </div>

                        {/* Completion Rate */}
                        <div className="group relative overflow-hidden bg-white p-3 sm:p-5 rounded-2xl border border-slate-100 shadow-sm">
                            <div
                                className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity"
                                aria-hidden="true"
                            >
                                <CheckCircle2 className="w-24 h-24 text-emerald-500 -mr-6 -mt-6" />
                            </div>
                            <div className="flex items-center gap-2 mb-3">
                                <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600">
                                    <CheckCircle2 className="w-5 h-5" aria-hidden="true" />
                                </div>
                                <span className="text-xs font-bold text-slate-500">
                                    {t('admin.study_overview.completion_rate', 'Completion rate')}
                                </span>
                            </div>
                            <div className="text-xl sm:text-4xl font-black text-emerald-600 tracking-tight mb-2">
                                {Math.round((stats.completed_count / stats.started_count) * 100) ||
                                    0}
                                %
                            </div>
                            <Progress
                                value={
                                    Math.round(
                                        (stats.completed_count / stats.started_count) * 100
                                    ) || 0
                                }
                                className="h-1.5 bg-emerald-50"
                            />
                        </div>

                        {/* Median Duration */}
                        <div className="group relative overflow-hidden bg-white p-3 sm:p-5 rounded-2xl border border-slate-100 shadow-sm">
                            <div
                                className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity"
                                aria-hidden="true"
                            >
                                <Clock className="w-24 h-24 text-amber-500 -mr-6 -mt-6" />
                            </div>
                            <div className="flex items-center gap-2 mb-3">
                                <div className="p-2 rounded-lg bg-amber-50 text-amber-600">
                                    <Clock className="w-5 h-5" aria-hidden="true" />
                                </div>
                                <span className="text-xs font-bold text-slate-500">
                                    {t('admin.study_overview.median_duration', 'Median duration')}
                                </span>
                            </div>
                            <div className="flex items-baseline gap-2 mb-1">
                                <div className="text-xl sm:text-4xl font-black text-slate-900 tracking-tight">
                                    {stats.median_duration_seconds
                                        ? `${Math.floor(stats.median_duration_seconds / 60)}m`
                                        : '--'}
                                </div>
                                {stats.median_duration_seconds &&
                                    stats.median_duration_seconds < 120 && (
                                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 text-2xs font-semibold ring-1 ring-amber-200">
                                            <AlertTriangle size={9} />{' '}
                                            {t('admin.study_overview.suspect', 'Suspect')}
                                        </span>
                                    )}
                            </div>
                        </div>
                    </div>

                    <div className="grid gap-6 md:grid-cols-12 pb-12">
                        <RecentActivityCard
                            participants={validParticipants}
                            totalParticipantCount={(participants || []).length}
                            isMultiLang={(study?.translations?.length ?? 0) > 1}
                            projectSlug={project?.slug || ''}
                            studySlug={slug}
                            roughSortEnabled={study?.rough_sort_enabled !== false}
                        />

                        <div className="col-span-12 md:col-span-4 space-y-6">
                            <RecruitmentModule slug={slug || ''} />
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default StudyOverviewPage;
