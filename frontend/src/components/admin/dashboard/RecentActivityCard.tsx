import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Locale } from 'date-fns';
import { formatDistanceToNow, format } from 'date-fns';
import { enUS, fr, fi } from 'date-fns/locale';
import { useTranslation } from 'react-i18next';

import type { ParticipantRead } from '@/api/model';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
    TrendingUp,
    Eye,
    Link as LinkIcon,
    Monitor,
    Smartphone,
    Tablet,
    Table as TableIcon,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { parseUA } from '@/utils/uaParser';
import { getStepInfo } from '@/utils/studySteps';

const dateLocales: Record<string, Locale> = {
    en: enUS,
    fr: fr,
    fi: fi,
};

const DEVICE_ICONS = {
    mobile: Smartphone,
    tablet: Tablet,
    desktop: Monitor,
} as const;

function getParticipantColor(id: string) {
    const hue = (id.charCodeAt(0) + id.charCodeAt(1)) % 360;
    return {
        bg: `hsl(${hue}, 70%, 92%)`,
        border: `hsl(${hue}, 60%, 75%)`,
        text: `hsl(${hue}, 70%, 35%)`,
    };
}

function getActivityTime(p: ParticipantRead): string {
    if (p.status === 'completed' && p.submitted_at) {
        return p.submitted_at as string;
    }
    return (p.last_step_reached_at as string) ?? p.created_at;
}

function computeDurationSeconds(p: ParticipantRead): number | null {
    if (p.status !== 'completed' || !p.submitted_at) return null;
    const start = new Date(p.created_at).getTime();
    const end = new Date(p.submitted_at as string).getTime();
    const seconds = Math.round((end - start) / 1000);
    return seconds > 0 ? seconds : null;
}

interface ParticipantRowProps {
    participant: ParticipantRead;
    locale: Locale;
    showLanguage: boolean;
    roughSortEnabled: boolean;
    onView: () => void;
}

function ParticipantRow({
    participant,
    locale,
    showLanguage,
    roughSortEnabled,
    onView,
}: ParticipantRowProps) {
    const { t } = useTranslation();
    const colors = getParticipantColor(participant.session_token);
    const isCompleted = participant.status === 'completed';
    const activityTime = getActivityTime(participant);
    const ua = parseUA(participant.user_agent as string | undefined);
    const DeviceIcon = DEVICE_ICONS[ua.device];
    const lang = participant.language_used?.toUpperCase() || '??';

    const durationSeconds = computeDurationSeconds(participant);
    const stepNum = (participant.last_step_reached as number) ?? 1;
    const stepInfo = getStepInfo({ rough_sort_enabled: roughSortEnabled }, stepNum);

    return (
        <div
            className={`flex items-center gap-2.5 p-2.5 rounded-lg border group transition-colors ${
                isCompleted
                    ? 'border-l-emerald-400 border-l-[3px] border-emerald-100 bg-emerald-50/20 hover:bg-emerald-50/40'
                    : 'border-l-sky-400 border-l-[3px] border-slate-100 bg-white hover:bg-slate-50/50'
            }`}
        >
            <div
                className="h-8 w-8 rounded-full border-2 flex items-center justify-center text-2xs font-black shadow-sm shrink-0"
                style={{
                    backgroundColor: colors.bg,
                    borderColor: colors.border,
                    color: colors.text,
                }}
            >
                {participant.session_token.substring(0, 2).toUpperCase()}
            </div>

            <div className="flex-1 min-w-0 space-y-0.5">
                {/* Line 1: token + recruitment badge */}
                <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-xs font-mono font-bold text-slate-800 shrink-0">
                        {participant.session_token.substring(0, 8)}
                    </span>
                    {participant.recruitment_token && (
                        <Badge
                            variant="outline"
                            className="h-4 bg-white text-slate-500 border-slate-200 gap-0.5 pl-1 pr-1.5 truncate max-w-[100px]"
                        >
                            <LinkIcon className="w-2.5 h-2.5 shrink-0" />
                            <span className="font-mono text-[9px] truncate">
                                {participant.recruitment_token}
                            </span>
                        </Badge>
                    )}
                </div>

                {/* Line 2: status-specific info */}
                {isCompleted ? (
                    <div className="flex items-center gap-1.5">
                        <Badge className="h-4 text-[9px] font-semibold bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-0 px-1.5">
                            {t('admin.study_overview.recently_completed', 'Completed')}
                        </Badge>
                        {durationSeconds !== null && (
                            <span className="text-2xs text-slate-500">
                                {durationSeconds >= 3600
                                    ? t('common.duration_long', '{{h}}h {{m}}m {{s}}s', {
                                          h: Math.floor(durationSeconds / 3600),
                                          m: Math.floor((durationSeconds % 3600) / 60),
                                          s: durationSeconds % 60,
                                      })
                                    : t('common.duration_short', '{{m}}m {{s}}s', {
                                          m: Math.floor(durationSeconds / 60),
                                          s: durationSeconds % 60,
                                      })}
                            </span>
                        )}
                    </div>
                ) : stepInfo ? (
                    <div className="flex items-center gap-1.5">
                        <span className="text-2xs font-medium text-sky-700 shrink-0">
                            {t(stepInfo.labelKey, stepInfo.labelDefault)}
                        </span>
                        <Progress
                            value={stepInfo.progress}
                            className="h-1 w-12 bg-sky-100 [&>div]:bg-sky-500"
                        />
                    </div>
                ) : (
                    <span className="text-2xs text-slate-400">—</span>
                )}

                {/* Line 3: time · device · language */}
                <div className="flex items-center gap-1 text-2xs text-slate-400 truncate">
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <span className="cursor-help truncate">
                                    {t(
                                        isCompleted
                                            ? 'admin.study_overview.submitted'
                                            : 'admin.study_overview.started',
                                        isCompleted ? 'Submitted' : 'Started'
                                    )}{' '}
                                    {formatDistanceToNow(new Date(activityTime), {
                                        addSuffix: true,
                                        locale,
                                    })}
                                </span>
                            </TooltipTrigger>
                            <TooltipContent className="text-xs">
                                {format(new Date(activityTime), 'PPpp', { locale })}
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                    <span aria-hidden="true">·</span>
                    <DeviceIcon className="h-2.5 w-2.5 shrink-0" />
                    {showLanguage && (
                        <>
                            <span aria-hidden="true">·</span>
                            <span className="font-medium">{lang}</span>
                        </>
                    )}
                </div>
            </div>

            <Button
                variant="default"
                size="icon"
                className="h-7 w-7 bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm shrink-0 rounded-lg"
                onClick={onView}
                aria-label={t('admin.study_overview.view_data', 'View')}
            >
                <Eye className="h-3.5 w-3.5" />
            </Button>
        </div>
    );
}

interface RecentActivityCardProps {
    participants: ParticipantRead[];
    totalParticipantCount: number;
    isMultiLang: boolean;
    projectSlug: string;
    studySlug: string;
    /**
     * Whether the study has the rough-sort step enabled. Defaults to true
     * for backwards-compatibility with callers that haven't passed it yet.
     */
    roughSortEnabled?: boolean;
}

export default function RecentActivityCard({
    participants,
    totalParticipantCount,
    isMultiLang,
    projectSlug,
    studySlug,
    roughSortEnabled = true,
}: RecentActivityCardProps) {
    const { t, i18n } = useTranslation();
    const navigate = useNavigate();
    const currentLocale = dateLocales[i18n.language] || enUS;

    const recentParticipants = useMemo(() => {
        const active = participants.filter(
            (p) => p.status === 'completed' || p.status === 'started'
        );
        const sorted = [...active].sort((a, b) => {
            const timeA = new Date(getActivityTime(a)).getTime();
            const timeB = new Date(getActivityTime(b)).getTime();
            return timeB - timeA;
        });
        return sorted.slice(0, 5);
    }, [participants]);

    return (
        <Card className="col-span-12 md:col-span-8 border-none shadow-sm bg-white rounded-2xl overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between border-b border-slate-50 px-4 py-3">
                <div className="space-y-0.5">
                    <CardTitle className="text-sm font-black flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-indigo-500" />
                        {t('admin.study_overview.recent_activity', 'Recent activity')}
                    </CardTitle>
                    <CardDescription className="text-xs">
                        {t('admin.study_overview.latest_participants', {
                            count: recentParticipants.length,
                            total: totalParticipantCount,
                            defaultValue: `Latest participants (${recentParticipants.length} of ${totalParticipantCount})`,
                        })}
                    </CardDescription>
                </div>
            </CardHeader>
            <CardContent className="p-0">
                {recentParticipants.length === 0 ? (
                    <div className="p-6 text-center text-slate-400 text-xs">
                        {t('admin.study_overview.no_participants', 'No participants yet.')}
                    </div>
                ) : (
                    <div className="p-2 space-y-1.5">
                        {recentParticipants.map((p) => (
                            <ParticipantRow
                                key={p.id}
                                participant={p}
                                locale={currentLocale}
                                showLanguage={isMultiLang}
                                roughSortEnabled={roughSortEnabled}
                                onView={() =>
                                    navigate(
                                        `/app/${projectSlug}/studies/${studySlug}/participants/${p.id}`
                                    )
                                }
                            />
                        ))}
                    </div>
                )}
                <div className="p-2.5 bg-slate-50/50 border-t border-slate-100 text-center">
                    <Link
                        to={`/app/${projectSlug}/studies/${studySlug}/data`}
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
    );
}
