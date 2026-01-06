import { useParams } from 'react-router-dom';
import {
    useGetStudyStatsApiAdminStudiesSlugStatsGet,
    useListStudyParticipantsApiAdminStudiesSlugParticipantsGet,
    useGetStudyApiAdminStudiesSlugGet,
} from '@/api/generated';
import RecruitmentModule from '@/components/admin/dashboard/RecruitmentModule';
import { DashboardSkeleton } from '@/components/admin/DashboardSkeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
    Activity,
    Users,
    PencilRuler,
    CheckCircle2,
    Clock,
    AlertTriangle,
    ArrowRight,
    Table as TableIcon,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import StudyStatusControl from '@/components/admin/dashboard/StudyStatusControl';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

const StudyOverviewPage = () => {
    const { slug } = useParams();
    const { data: stats, isLoading: statsLoading } = useGetStudyStatsApiAdminStudiesSlugStatsGet(
        slug || ''
    );
    const { data: study, refetch: refetchStudy } = useGetStudyApiAdminStudiesSlugGet(slug || '');
    const {
        data: participants,
        isLoading: participantsLoading,
        refetch: refetchParticipants,
    } = useListStudyParticipantsApiAdminStudiesSlugParticipantsGet(slug || '');
    const { refetch: refetchStats } = useGetStudyStatsApiAdminStudiesSlugStatsGet(slug || '');

    if (statsLoading || participantsLoading) {
        return <DashboardSkeleton />;
    }

    const recentParticipants = (participants || []).slice(0, 5);

    return (
        <div className="flex flex-1 flex-col gap-6 p-6 pt-2">
            <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-4 border-b border-slate-100">
                <div className="space-y-1">
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
                        {slug}
                        {stats && (
                            <Badge
                                variant="outline"
                                role="status"
                                className={cn(
                                    'ml-2 font-bold uppercase tracking-widest text-[10px]',
                                    study?.state === 'active'
                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                                        : study?.state === 'paused'
                                          ? 'bg-orange-50 text-orange-700 border-orange-100'
                                          : study?.state === 'closed'
                                            ? 'bg-slate-50 text-slate-700 border-slate-100'
                                            : 'bg-amber-50 text-amber-700 border-amber-100'
                                )}
                            >
                                {study?.state === 'active'
                                    ? 'Active'
                                    : study?.state === 'paused'
                                      ? 'Paused'
                                      : study?.state === 'closed'
                                        ? 'Closed'
                                        : 'Draft'}
                            </Badge>
                        )}
                        {study?.state === 'draft' && (
                            <Button
                                asChild
                                size="sm"
                                variant="outline"
                                className="ml-4 gap-2 border-primary/20 hover:bg-primary/5 hover:text-primary transition-all"
                            >
                                <Link to={`/admin/studies/${slug}/design`}>
                                    <PencilRuler className="h-4 w-4" />
                                    Edit study design
                                </Link>
                            </Button>
                        )}
                    </h1>
                    <p className="text-slate-500 text-sm">
                        Real-time analytics and participant overview for this study.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {study?.translations?.map((t) => (
                        <Badge key={t.language_code} variant="secondary" className="text-xs">
                            {t.language_code.toUpperCase()}
                        </Badge>
                    ))}
                    {study?.state === 'active' && (
                        <div className="bg-white shadow-sm border rounded-lg px-4 py-2 flex items-center gap-3">
                            <div className="relative">
                                <Activity className="h-4 w-4 text-emerald-500" />
                                <span className="absolute -top-1 -right-1 flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                </span>
                            </div>
                            <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                                Receiving data
                            </span>
                        </div>
                    )}
                </div>
            </header>

            {/* Key Metrics Dashboard + Study Status */}
            {stats && (
                <>
                    {/* Status Control - Full Width at Top */}
                    <StudyStatusControl
                        slug={slug || ''}
                        currentState={study?.state || 'draft'}
                        onStateChange={() => {
                            refetchStudy();
                            refetchParticipants();
                            refetchStats();
                        }}
                    />

                    <div className="bg-gradient-to-br from-slate-50 to-white px-4 py-4 rounded-xl border border-slate-100 shadow-sm mb-6">
                        <div className="grid gap-3 md:grid-cols-3">
                            {/* Sample Size */}
                            <Card className="overflow-hidden border border-slate-200 shadow-sm bg-white">
                                <CardContent className="pt-4 pb-4">
                                    <div className="flex items-center gap-2 mb-2">
                                        <Users className="h-4 w-4 text-indigo-600" />
                                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                                            Sample size (N)
                                        </div>
                                    </div>
                                    <div className="text-4xl font-bold text-slate-900 mb-1">
                                        {stats.started_count}
                                    </div>
                                    <p className="text-xs text-slate-400 font-medium">
                                        {stats.completed_count} completed
                                    </p>
                                </CardContent>
                            </Card>

                            {/* Completion Rate */}
                            <Card className="overflow-hidden border border-slate-200 shadow-sm bg-white">
                                <CardContent className="pt-4 pb-4">
                                    <div className="flex items-center gap-2 mb-2">
                                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                                            Completion rate
                                        </div>
                                    </div>
                                    <div className="text-4xl font-bold text-emerald-600 mb-2">
                                        {Math.round(
                                            (stats.completed_count / stats.started_count) * 100
                                        ) || 0}
                                        %
                                    </div>
                                    <Progress
                                        value={
                                            Math.round(
                                                (stats.completed_count / stats.started_count) * 100
                                            ) || 0
                                        }
                                        className="h-1.5 bg-emerald-50 mb-1.5"
                                    />
                                    <div className="flex justify-between text-[10px] text-slate-400">
                                        <span>
                                            {stats.started_count - stats.completed_count} active
                                        </span>
                                        <span>
                                            {Math.round(
                                                ((stats.device_breakdown?.mobile || 0) /
                                                    ((stats.device_breakdown?.mobile || 0) +
                                                        (stats.device_breakdown?.desktop || 0))) *
                                                    100
                                            ) || 0}
                                            % mobile
                                        </span>
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Median Duration */}
                            <Card className="overflow-hidden border border-slate-200 shadow-sm bg-white">
                                <CardContent className="pt-4 pb-4">
                                    <div className="flex items-center gap-2 mb-2">
                                        <Clock className="h-4 w-4 text-amber-500" />
                                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                                            Median duration
                                        </div>
                                    </div>
                                    <div className="flex items-baseline gap-2 mb-1">
                                        <div className="text-4xl font-bold text-slate-900">
                                            {stats.median_duration_seconds
                                                ? `${Math.floor(stats.median_duration_seconds / 60)}m ${stats.median_duration_seconds % 60}s`
                                                : '--'}
                                        </div>
                                        {stats.median_duration_seconds &&
                                            stats.median_duration_seconds < 120 && (
                                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 text-[9px] font-bold uppercase ring-1 ring-amber-200">
                                                    <AlertTriangle size={9} /> Suspect
                                                </span>
                                            )}
                                    </div>
                                    <p className="text-[10px] text-slate-400">Time to complete</p>
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                </>
            )}

            <div className="grid gap-6 md:grid-cols-12 pb-12">
                {/* Recent Activity / Analytics Promo */}
                <Card className="col-span-12 md:col-span-8 shadow-sm border-slate-200 bg-white">
                    <CardHeader className="flex flex-row items-center justify-between border-b border-slate-50 pb-4">
                        <div className="space-y-1">
                            <CardTitle className="text-lg flex items-center gap-2">
                                <Activity className="h-5 w-5 text-indigo-500" />
                                Recent activity
                            </CardTitle>
                            <CardDescription>
                                Latest submissions (last 5 of {(participants || []).length})
                            </CardDescription>
                        </div>
                        <Button
                            asChild
                            variant="default"
                            size="sm"
                            className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
                        >
                            <Link to={`/admin/studies/${slug}/exports`}>
                                Explore analytics
                                <ArrowRight className="ml-2 h-4 w-4" />
                            </Link>
                        </Button>
                    </CardHeader>
                    <CardContent className="p-0">
                        {/* Simple List */}
                        <div className="divide-y divide-slate-50">
                            {recentParticipants.length === 0 ? (
                                <div className="p-8 text-center text-slate-400 text-sm">
                                    No participants yet.
                                </div>
                            ) : (
                                recentParticipants.map((p) => (
                                    <div
                                        key={p.id}
                                        className="flex items-center justify-between p-4 hover:bg-slate-50/50 transition-colors"
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center text-xs font-mono font-bold text-slate-500">
                                                {p.language_used.substring(0, 2).toUpperCase()}
                                            </div>
                                            <div>
                                                <div className="text-sm font-medium text-slate-900 font-mono">
                                                    {p.session_token.substring(0, 8)}...
                                                </div>
                                                <div className="text-xs text-slate-500 flex items-center gap-1">
                                                    {p.submitted_at ? (
                                                        <>
                                                            Submitted{' '}
                                                            {formatDistanceToNow(
                                                                new Date(
                                                                    p.submitted_at as unknown as string
                                                                ),
                                                                { addSuffix: true }
                                                            )}
                                                        </>
                                                    ) : (
                                                        'In Progress'
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <Badge
                                                variant="outline"
                                                className={cn(
                                                    'capitalize',
                                                    p.is_discarded
                                                        ? 'bg-red-50 text-red-700 border-red-100'
                                                        : p.status === 'completed'
                                                          ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                                                          : 'bg-slate-50 text-slate-600 border-slate-100'
                                                )}
                                            >
                                                {p.is_discarded ? 'Discarded' : p.status}
                                            </Badge>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                        <div className="p-3 bg-slate-50/50 border-t border-slate-100 text-center">
                            <Link
                                to={`/admin/studies/${slug}/exports`}
                                className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 flex items-center justify-center gap-1"
                            >
                                <TableIcon className="w-3 h-3" />
                                View all participants and data details
                            </Link>
                        </div>
                    </CardContent>
                </Card>

                <div className="col-span-12 md:col-span-4 space-y-6">
                    <RecruitmentModule slug={slug || ''} />
                </div>
            </div>
        </div>
    );
};

export default StudyOverviewPage;
