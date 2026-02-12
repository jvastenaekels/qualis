import { useLoaderData, useRevalidator, useNavigate } from 'react-router-dom';

import type { StudyRead, ParticipantRead, StudyStatsRead } from '@/api/model';
import { ParticipantStatus } from '@/api/model/participantStatus';
import RecruitmentModule from '@/components/admin/dashboard/RecruitmentModule';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
    TrendingUp,
    Users,
    CheckCircle2,
    Clock,
    AlertTriangle,
    Table as TableIcon,
    LayoutDashboard,
    Copy,
    Eye,
    Link as LinkIcon,
} from 'lucide-react';
import { StudyPageHeader } from '@/components/admin/layout/StudyPageHeader';
import { Link } from 'react-router-dom';
import StudyStatusControl from '@/components/admin/dashboard/StudyStatusControl';
import { SubmissionsTimelineChart } from '@/components/admin/dashboard/charts/SubmissionsTimelineChart';

import { DeviceBreakdownChart } from '@/components/admin/dashboard/charts/DeviceBreakdownChart';
import { cn } from '@/lib/utils';
import { formatDistanceToNow, format } from 'date-fns';
import { enUS, fr, fi } from 'date-fns/locale';
import { toast } from 'sonner';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useTranslation } from 'react-i18next';
import { useAdminContext } from '@/hooks/useAdminContext';

interface LoaderData {
    stats: StudyStatsRead;
    participants: ParticipantRead[];
    study: StudyRead;
    slug: string;
}

const StudyOverviewPage = () => {
    const { stats, participants, study, slug } = useLoaderData() as LoaderData;
    const { workspace } = useAdminContext();

    if (!workspace) {
        // This should not happen if RequireAdmin and WorkspaceLayout are doing their jobs,
        // but it's better to fail gracefully than crash.
        console.error('No workspace context found in StudyOverviewPage');
    }

    const revalidator = useRevalidator();
    const navigate = useNavigate();
    const { t, i18n } = useTranslation();

    // biome-ignore lint/suspicious/noExplicitAny: library locale types are complex
    const dateLocales: Record<string, any> = {
        en: enUS,
        fr: fr,
        fi: fi,
    };
    const currentLocale = dateLocales[i18n.language] || enUS;

    const validParticipants = participants?.filter((p) => !p.is_discarded && !p.is_test_run) || [];
    const recentParticipants = validParticipants.slice(0, 5);

    // Helper: Generate consistent color from participant ID
    const getParticipantColor = (id: string) => {
        const hue = (id.charCodeAt(0) + id.charCodeAt(1)) % 360;
        return {
            hue,
            bg: `hsl(${hue}, 70%, 92%)`,
            border: `hsl(${hue}, 60%, 75%)`,
            text: `hsl(${hue}, 70%, 35%)`,
        };
    };

    // Helper: Determine current step from progress percentage
    const _getCurrentStep = (progress: number) => {
        if (progress < 20) return t('admin.study_overview.steps.welcome', 'Welcome');
        if (progress < 40) return t('admin.study_overview.steps.consent', 'Consent');
        if (progress < 60) return t('admin.study_overview.steps.rough_sort', 'Rough Sort');
        if (progress < 90) return t('admin.study_overview.steps.fine_sort', 'Fine Sort');
        return t('admin.study_overview.steps.final', 'Final Steps');
    };

    const getStatusLabel = (state: string) => {
        return t(`admin.status.${state}`, state.charAt(0).toUpperCase() + state.slice(1));
    };

    return (
        <div className="flex flex-1 flex-col gap-4 p-4 sm:p-6 pt-2">
            <StudyPageHeader
                title={t('admin.study_overview.title', 'Overview')}
                description={t(
                    'admin.study_overview.subtitle',
                    'Real-time analytics and participant overview for this study.'
                )}
                icon={LayoutDashboard}
                statusBadge={
                    <Badge
                        variant="outline"
                        role="status"
                        className={cn(
                            'font-semibold text-[10px] px-2 py-0.5 rounded-full',
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
                            <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                                <Users className="w-24 h-24 text-indigo-500 -mr-6 -mt-6" />
                            </div>
                            <div className="flex items-center gap-2 mb-3">
                                <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600">
                                    <Users className="w-5 h-5" />
                                </div>
                                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                                    {t('admin.study_overview.sample_size', 'Sample size (N)')}
                                </span>
                            </div>
                            <div className="text-2xl sm:text-4xl font-black text-slate-900 tracking-tight">
                                {stats.completed_count}
                            </div>
                        </div>

                        {/* Completion Rate */}
                        <div className="group relative overflow-hidden bg-white p-3 sm:p-5 rounded-2xl border border-slate-100 shadow-sm">
                            <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                                <CheckCircle2 className="w-24 h-24 text-emerald-500 -mr-6 -mt-6" />
                            </div>
                            <div className="flex items-center gap-2 mb-3">
                                <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600">
                                    <CheckCircle2 className="w-5 h-5" />
                                </div>
                                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                                    {t('admin.study_overview.completion_rate', 'Completion rate')}
                                </span>
                            </div>
                            <div className="text-2xl sm:text-4xl font-black text-emerald-600 tracking-tight mb-2">
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
                            <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                                <Clock className="w-24 h-24 text-amber-500 -mr-6 -mt-6" />
                            </div>
                            <div className="flex items-center gap-2 mb-3">
                                <div className="p-2 rounded-lg bg-amber-50 text-amber-600">
                                    <Clock className="w-5 h-5" />
                                </div>
                                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                                    {t('admin.study_overview.median_duration', 'Median duration')}
                                </span>
                            </div>
                            <div className="flex items-baseline gap-2 mb-1">
                                <div className="text-2xl sm:text-4xl font-black text-slate-900 tracking-tight">
                                    {stats.median_duration_seconds
                                        ? `${Math.floor(stats.median_duration_seconds / 60)}m`
                                        : '--'}
                                </div>
                                {stats.median_duration_seconds &&
                                    stats.median_duration_seconds < 120 && (
                                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 text-[10px] font-semibold ring-1 ring-amber-200">
                                            <AlertTriangle size={9} />{' '}
                                            {t('admin.study_overview.suspect', 'Suspect')}
                                        </span>
                                    )}
                            </div>
                            <p className="text-[10px] text-slate-400 font-medium">
                                {t('admin.study_overview.time_to_complete', 'Time to complete')}
                            </p>
                        </div>
                    </div>

                    <div className="grid gap-6 md:grid-cols-12 pb-12">
                        {/* Recent Activity / Analytics Promo */}
                        <Card className="col-span-12 md:col-span-8 border-none shadow-sm bg-white rounded-2xl overflow-hidden">
                            <CardHeader className="flex flex-row items-center justify-between border-b border-slate-50 pb-4">
                                <div className="space-y-1">
                                    <CardTitle className="text-lg flex items-center gap-2">
                                        <TrendingUp className="h-5 w-5 text-indigo-500" />
                                        {t(
                                            'admin.study_overview.recent_activity',
                                            'Recent activity'
                                        )}
                                    </CardTitle>
                                    <CardDescription>
                                        {t('admin.study_overview.latest_submissions', {
                                            count: recentParticipants.length,
                                            total: (participants || []).length,
                                            defaultValue: `Latest submissions (${recentParticipants.length} of ${(participants || []).length})`,
                                        })}
                                    </CardDescription>
                                </div>
                            </CardHeader>
                            <CardContent className="p-0">
                                {recentParticipants.length === 0 ? (
                                    <div className="p-8 text-center text-slate-400 text-sm">
                                        {t(
                                            'admin.study_overview.no_participants',
                                            'No participants yet.'
                                        )}
                                    </div>
                                ) : (
                                    <div className="divide-y divide-slate-100">
                                        {/* Recently Completed Section */}
                                        {recentParticipants.filter(
                                            (p) => p.status === 'completed' && !p.is_discarded
                                        ).length > 0 && (
                                            <div className="p-3">
                                                <div className="flex items-center text-xs font-semibold text-slate-500 mb-3 px-1">
                                                    <CheckCircle2 className="w-3 h-3 mr-1.5" />
                                                    {t(
                                                        'admin.study_overview.recently_completed',
                                                        'Recently Completed'
                                                    )}{' '}
                                                    (
                                                    {
                                                        recentParticipants.filter(
                                                            (p) =>
                                                                p.status === 'completed' &&
                                                                !p.is_discarded
                                                        ).length
                                                    }
                                                    )
                                                </div>
                                                <div className="space-y-2">
                                                    {recentParticipants
                                                        .filter(
                                                            (p) =>
                                                                p.status === 'completed' &&
                                                                !p.is_discarded
                                                        )
                                                        .map((p) => (
                                                            <div
                                                                key={p.id}
                                                                className="flex items-center justify-between p-3 hover:bg-emerald-50/30 transition-colors rounded-lg border border-emerald-100 bg-emerald-50/20 group"
                                                            >
                                                                <div className="flex items-center gap-3 flex-1">
                                                                    {(() => {
                                                                        const colors =
                                                                            getParticipantColor(
                                                                                p.session_token
                                                                            );
                                                                        return (
                                                                            <div
                                                                                className="h-9 w-9 rounded-full border-2 flex items-center justify-center text-xs font-black shadow-sm"
                                                                                style={{
                                                                                    backgroundColor:
                                                                                        colors.bg,
                                                                                    borderColor:
                                                                                        colors.border,
                                                                                    color: colors.text,
                                                                                }}
                                                                            >
                                                                                {p.session_token
                                                                                    .substring(0, 2)
                                                                                    .toUpperCase()}
                                                                            </div>
                                                                        );
                                                                    })()}
                                                                    <div className="flex-1 min-w-0">
                                                                        <div className="flex items-center gap-2">
                                                                            <span className="text-sm font-mono font-bold text-slate-800">
                                                                                {p.session_token.substring(
                                                                                    0,
                                                                                    8
                                                                                )}
                                                                            </span>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => {
                                                                                    navigator.clipboard.writeText(
                                                                                        p.session_token
                                                                                    );
                                                                                    toast.success(
                                                                                        t(
                                                                                            'common.copied',
                                                                                            'ID copied'
                                                                                        )
                                                                                    );
                                                                                }}
                                                                                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-slate-100 rounded"
                                                                            >
                                                                                <Copy className="h-3 w-3 text-slate-400" />
                                                                            </button>
                                                                            {p.recruitment_token && (
                                                                                <Badge
                                                                                    variant="outline"
                                                                                    className="ml-1 h-5 bg-white text-slate-500 border-slate-200 gap-1 pl-1.5 pr-2"
                                                                                >
                                                                                    <LinkIcon className="w-3 h-3" />
                                                                                    <span className="font-mono text-[10px]">
                                                                                        {
                                                                                            p.recruitment_token
                                                                                        }
                                                                                    </span>
                                                                                </Badge>
                                                                            )}
                                                                        </div>
                                                                        <TooltipProvider>
                                                                            <Tooltip>
                                                                                <TooltipTrigger
                                                                                    asChild
                                                                                >
                                                                                    <div className="text-xs text-emerald-600 font-medium mt-0.5 cursor-help">
                                                                                        {t(
                                                                                            'admin.study_overview.submitted',
                                                                                            'Submitted'
                                                                                        )}{' '}
                                                                                        {formatDistanceToNow(
                                                                                            new Date(
                                                                                                p.submitted_at as unknown as string
                                                                                            ),
                                                                                            {
                                                                                                addSuffix: true,
                                                                                                locale: currentLocale,
                                                                                            }
                                                                                        )}
                                                                                    </div>
                                                                                </TooltipTrigger>
                                                                                <TooltipContent className="text-xs">
                                                                                    {format(
                                                                                        new Date(
                                                                                            p.submitted_at as unknown as string
                                                                                        ),
                                                                                        'PPpp',
                                                                                        {
                                                                                            locale: currentLocale,
                                                                                        }
                                                                                    )}
                                                                                </TooltipContent>
                                                                            </Tooltip>
                                                                        </TooltipProvider>
                                                                    </div>
                                                                </div>
                                                                <Button
                                                                    variant="default"
                                                                    size="sm"
                                                                    className="h-8 text-xs font-bold px-4 bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
                                                                    onClick={() =>
                                                                        navigate(
                                                                            `/app/${workspace?.slug}/studies/${slug}/participants/${p.id}`
                                                                        )
                                                                    }
                                                                >
                                                                    <Eye className="h-3.5 w-3.5 mr-1.5" />
                                                                    {t(
                                                                        'admin.study_overview.view_data',
                                                                        'View'
                                                                    )}
                                                                </Button>
                                                            </div>
                                                        ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* In Progress Section */}
                                        {recentParticipants.filter(
                                            // biome-ignore lint/suspicious/noExplicitAny: API type inference issue
                                            (p: any) =>
                                                p.status === ParticipantStatus.started &&
                                                !p.is_discarded
                                        ).length > 0 && (
                                            <div className="p-3">
                                                <div className="flex items-center text-xs font-semibold text-slate-500 mb-3 px-1">
                                                    <Clock className="w-3 h-3 mr-1.5" />
                                                    {t(
                                                        'admin.study_overview.in_progress',
                                                        'In Progress'
                                                    )}{' '}
                                                    (
                                                    {
                                                        recentParticipants.filter(
                                                            // biome-ignore lint/suspicious/noExplicitAny: API type inference issue
                                                            (p: any) =>
                                                                p.status ===
                                                                    ParticipantStatus.started &&
                                                                !p.is_discarded
                                                        ).length
                                                    }
                                                    )
                                                </div>
                                                <div className="space-y-2">
                                                    {recentParticipants
                                                        .filter(
                                                            // biome-ignore lint/suspicious/noExplicitAny: API type inference issue
                                                            (p: any) =>
                                                                p.status ===
                                                                    ParticipantStatus.started &&
                                                                !p.is_discarded
                                                        )
                                                        .map((p) => (
                                                            <div
                                                                key={p.id}
                                                                className="flex items-center justify-between p-3 hover:bg-slate-50/50 transition-colors rounded-lg border border-slate-100 bg-white group"
                                                            >
                                                                <div className="flex items-center gap-3 flex-1">
                                                                    {(() => {
                                                                        const colors =
                                                                            getParticipantColor(
                                                                                p.session_token
                                                                            );
                                                                        return (
                                                                            <div
                                                                                className="h-9 w-9 rounded-full border-2 flex items-center justify-center text-xs font-black shadow-sm"
                                                                                style={{
                                                                                    backgroundColor:
                                                                                        colors.bg,
                                                                                    borderColor:
                                                                                        colors.border,
                                                                                    color: colors.text,
                                                                                }}
                                                                            >
                                                                                {p.session_token
                                                                                    .substring(0, 2)
                                                                                    .toUpperCase()}
                                                                            </div>
                                                                        );
                                                                    })()}
                                                                    <div className="flex-1 min-w-0">
                                                                        <div className="flex items-center gap-2">
                                                                            <span className="text-sm font-mono font-bold text-slate-800">
                                                                                {p.session_token.substring(
                                                                                    0,
                                                                                    8
                                                                                )}
                                                                            </span>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => {
                                                                                    navigator.clipboard.writeText(
                                                                                        p.session_token
                                                                                    );
                                                                                    toast.success(
                                                                                        t(
                                                                                            'common.copied',
                                                                                            'ID copied'
                                                                                        )
                                                                                    );
                                                                                }}
                                                                                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-slate-100 rounded"
                                                                            >
                                                                                <Copy className="h-3 w-3 text-slate-400" />
                                                                            </button>
                                                                            {p.recruitment_token && (
                                                                                <Badge
                                                                                    variant="outline"
                                                                                    className="ml-1 h-5 bg-white text-slate-500 border-slate-200 gap-1 pl-1.5 pr-2"
                                                                                >
                                                                                    <LinkIcon className="w-3 h-3" />
                                                                                    <span className="font-mono text-[10px]">
                                                                                        {
                                                                                            p.recruitment_token
                                                                                        }
                                                                                    </span>
                                                                                </Badge>
                                                                            )}
                                                                        </div>

                                                                        <TooltipProvider>
                                                                            <Tooltip>
                                                                                <TooltipTrigger
                                                                                    asChild
                                                                                >
                                                                                    <div className="text-xs text-slate-500 mt-0.5 cursor-help">
                                                                                        {t(
                                                                                            'admin.study_overview.started'
                                                                                        )}{' '}
                                                                                        {formatDistanceToNow(
                                                                                            new Date(
                                                                                                p.created_at as unknown as string
                                                                                            ),
                                                                                            {
                                                                                                addSuffix: true,
                                                                                                locale: currentLocale,
                                                                                            }
                                                                                        )}
                                                                                    </div>
                                                                                </TooltipTrigger>
                                                                                <TooltipContent className="text-xs">
                                                                                    {format(
                                                                                        new Date(
                                                                                            p.created_at as unknown as string
                                                                                        ),
                                                                                        'PPpp',
                                                                                        {
                                                                                            locale: currentLocale,
                                                                                        }
                                                                                    )}
                                                                                </TooltipContent>
                                                                            </Tooltip>
                                                                        </TooltipProvider>
                                                                    </div>
                                                                </div>

                                                                <Button
                                                                    variant="default"
                                                                    size="sm"
                                                                    className="h-8 text-xs font-bold px-4 bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
                                                                    onClick={() =>
                                                                        navigate(
                                                                            `/app/${workspace?.slug}/studies/${slug}/participants/${p.id}`
                                                                        )
                                                                    }
                                                                >
                                                                    <Eye className="h-3.5 w-3.5 mr-1.5" />
                                                                    {t(
                                                                        'admin.study_overview.view_data',
                                                                        'View'
                                                                    )}
                                                                </Button>
                                                            </div>
                                                        ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Discarded Section (if any) */}
                                        {recentParticipants.filter((p) => p.is_discarded).length >
                                            0 && (
                                            <div className="p-3 bg-red-50/20">
                                                <div className="text-xs font-semibold text-red-500 mb-3 px-1">
                                                    {t(
                                                        'admin.study_overview.discarded',
                                                        'Discarded'
                                                    )}{' '}
                                                    (
                                                    {
                                                        recentParticipants.filter(
                                                            (p) => p.is_discarded
                                                        ).length
                                                    }
                                                    )
                                                </div>
                                                <div className="space-y-2">
                                                    {recentParticipants
                                                        .filter((p) => p.is_discarded)
                                                        .map((p) => (
                                                            <div
                                                                key={p.id}
                                                                className="flex items-center justify-between p-3 transition-colors rounded-lg border border-red-100 bg-red-50/50 opacity-60"
                                                            >
                                                                <div className="flex items-center gap-3">
                                                                    <div className="h-9 w-9 rounded-full bg-gradient-to-br from-red-100 to-red-50 border border-red-200 flex items-center justify-center text-xs font-bold text-red-600 shadow-sm">
                                                                        {p.language_used
                                                                            .substring(0, 2)
                                                                            .toUpperCase()}
                                                                    </div>
                                                                    <div>
                                                                        <div className="text-sm font-mono font-bold text-slate-700">
                                                                            {p.session_token.substring(
                                                                                0,
                                                                                8
                                                                            )}
                                                                        </div>
                                                                        <div className="text-xs text-red-600 font-medium mt-0.5">
                                                                            {t(
                                                                                'admin.study_overview.discarded',
                                                                                'Discarded'
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                                <div className="p-3 bg-slate-50/50 border-t border-slate-100 text-center">
                                    <Link
                                        to={`/app/${workspace?.slug}/studies/${slug}/data`}
                                        className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 flex items-center justify-center gap-1"
                                    >
                                        <TableIcon className="w-3 h-3" />
                                        {t(
                                            'admin.study_overview.view_all',
                                            'View all participants and data details'
                                        )}
                                    </Link>
                                </div>
                            </CardContent>
                        </Card>

                        <div className="col-span-12 md:col-span-4 space-y-6">
                            <RecruitmentModule slug={slug || ''} />
                        </div>
                    </div>

                    {/* Analytics Overview - Phase 1 */}
                    {participants.length > 0 && (
                        <div className="grid gap-6 md:grid-cols-12">
                            <div className="col-span-12 md:col-span-8">
                                <SubmissionsTimelineChart
                                    participants={validParticipants}
                                    className="border-none shadow-sm bg-white rounded-2xl h-full"
                                />
                            </div>
                            <div className="col-span-12 md:col-span-4">
                                <DeviceBreakdownChart
                                    deviceBreakdown={stats.device_breakdown}
                                    className="border-none shadow-sm bg-white rounded-2xl h-full"
                                />
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default StudyOverviewPage;
