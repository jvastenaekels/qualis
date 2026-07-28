import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import type { ParticipantRead } from '@/api/model';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { TrendingUp, Eye, Link as LinkIcon, Table as TableIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getStepInfo } from '@/utils/studySteps';
import { useDateFormat } from '@/hooks/useDateFormat';

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
    showLanguage: boolean;
    roughSortEnabled: boolean;
    onView: () => void;
}

function ParticipantRow({
    participant,
    showLanguage,
    roughSortEnabled,
    onView,
}: ParticipantRowProps) {
    const { t } = useTranslation();
    const { formatRelative, formatDateTime } = useDateFormat();
    const colors = getParticipantColor(participant.code);
    const isCompleted = participant.status === 'completed';
    const activityTime = getActivityTime(participant);
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
                {participant.code.substring(0, 2)}
            </div>

            <div className="flex-1 min-w-0 space-y-0.5">
                {/* Line 1: token + recruitment badge */}
                <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-xs font-mono font-bold text-slate-800 shrink-0">
                        {participant.code}
                    </span>
                    {participant.recruitment_token && (
                        <Badge
                            variant="outline"
                            className="min-h-4 bg-white text-slate-500 border-slate-200 gap-0.5 pl-1 pr-1.5 truncate max-w-[100px]"
                        >
                            <LinkIcon className="w-2.5 h-2.5 shrink-0" />
                            <span className="font-mono text-2xs leading-none truncate">
                                {participant.recruitment_token}
                            </span>
                        </Badge>
                    )}
                </div>

                {/* Line 2: status-specific info */}
                {isCompleted ? (
                    // `items-start`, not `items-center` (task 6.9). Once the pill wraps
                    // to two lines — which it does at 320px in every locale, and up to
                    // 375px in es/pt — centring floated the duration in the middle of a
                    // 26.16px pill with 4.8px of air above and below, so the pair read as
                    // misaligned. Top-aligning sets the duration on the pill's first text
                    // line. Measured at 320/360/375/414/768/1440 × en/es/nl/pt.
                    <div className="flex items-start gap-1.5">
                        {/* `min-h-4`, not `h-4`: at 320px this badge is a shrinking flex
                            item that gets ~109px for a label needing ~126px, so the two
                            words wrap. A hard `h-4` clamped the pill to 16px and the
                            second line painted OUTSIDE it. A floor lets the pill grow
                            instead. Not fixable by shortening the label — `Completed` in
                            English is short, but es/pt/nl render "Completados
                            recientemente" and are longer still. Measured at 320/360/375/
                            414/768/1440.

                            `[overflow-wrap:anywhere]` is the other half of the
                            duration's `shrink-0 whitespace-nowrap` below, and the
                            two only work as a pair. A flex item's automatic
                            minimum size is its min-content width, which for this
                            pill is its longest word ("recientemente", 73px + 12px
                            of padding = 85px). With the duration incompressible,
                            85 + 6 + 60 = 151px was being asked of a 144px line at
                            320px, and the surplus was pushed off the end of the
                            line box: measured 7px (es), 8px (de), 4px (pt) for
                            `12h 34m 56s`, rising to 13/14/10px for `123h 45m 56s`,
                            at which point the duration paints under the View
                            button (+3px es, +4px de).

                            `overflow-wrap: anywhere` — NOT `break-words`, and NOT
                            `min-w-0` — is what fixes it. `break-words`
                            (`overflow-wrap: break-word`) does not reduce the
                            automatic minimum size, so it changes nothing here.
                            Bare `min-w-0` lets the pill shrink but leaves the word
                            unbreakable, so the label then paints up to 14px
                            OUTSIDE the pill — the same escape, moved from the
                            duration to the label. `break-all` contains it but
                            breaks mid-word even when a space break is available
                            ("Recently complete" / "d" at 320px in English, where
                            the shipped build breaks cleanly at the space).
                            `anywhere` reduces the minimum size AND only breaks a
                            word when the word cannot fit on a line of its own.

                            Measured across 4 locales × 4 durations × 6 viewports
                            (96 cells): text painted outside its box in 0 of them,
                            for both the duration and the label, and geometry
                            identical to the shipped build in the 90 cells that
                            were already correct. The 6 that were not now cost row
                            height instead of legibility: the completed row grows
                            from 86.81px to 97.89px (de/pt) or 108.97px (es) at
                            320px for a sort of 12 hours or more, because the pill
                            takes a third line rather than the duration leaving the
                            row. */}
                        <Badge className="min-h-4 [overflow-wrap:anywhere] text-2xs leading-none font-semibold bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-0 px-1.5">
                            {t('admin.study_overview.recently_completed', 'Completed')}
                        </Badge>
                        {durationSeconds !== null && (
                            // `shrink-0 whitespace-nowrap` (task 6.9). Without it the
                            // duration is a shrinking flex item competing with the pill,
                            // and at 320px it broke mid-value: "5m 0s" rendered as "5m"
                            // over "0s", 33.22px tall. That second line — not the pill —
                            // was what made the completed row 16.61px taller than the
                            // in-progress one (93.88 vs 77.27). A duration is one token;
                            // it must never wrap between its parts.
                            //
                            // On its own this made the duration incompressible against a
                            // pill that could not shrink below its longest word, and the
                            // duration was pushed off the end of the line box. It holds
                            // only together with `[overflow-wrap:anywhere]` on the pill
                            // above — do not remove either one alone. `whitespace-nowrap`
                            // is doing the work here; `shrink-0` is redundant with it
                            // (a nowrap box's min-content size is its full width) and is
                            // kept only to state the intent.
                            <span className="text-2xs text-slate-500 shrink-0 whitespace-nowrap">
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
                    // Second instance of the same shrinking-flex mechanism (task 6.9).
                    // The label used to carry `shrink-0` and the bar nothing, so the bar
                    // absorbed the whole overflow: at 320px in Spanish
                    // ("Clasificación preliminar", 131px) the 48px bar rendered as a 7px
                    // dot. The priority is inverted here — the bar is the only thing on
                    // this line that cannot degrade gracefully, so it keeps its width and
                    // the label truncates. Measured: bar = 48px in en/es/nl/pt at
                    // 320/360/375/414/768/1440.
                    <div className="flex items-center gap-1.5 min-w-0">
                        <span className="min-w-0 truncate text-2xs font-medium text-sky-700">
                            {t(stepInfo.labelKey, stepInfo.labelDefault)}
                        </span>
                        <Progress
                            value={stepInfo.progress}
                            className="h-1 w-12 shrink-0 bg-sky-100 [&>div]:bg-sky-500"
                        />
                    </div>
                ) : (
                    <span className="text-2xs text-slate-500">—</span>
                )}

                {/* Line 3: time · language.
                    The device glyph that used to sit between these two separators is gone
                    (task 6.5). It was a 10px lucide `Monitor`/`Smartphone`/`Tablet` with no
                    accessible name and no text equivalent: screen-reader users got nothing,
                    and at 10px no sighted user can tell a tablet from a phone. Removed
                    rather than labelled — this row already truncates at 320px and a visible
                    "Desktop"/"Escritorio" would push the timestamp out. The device is still
                    reported, with text, on the participant detail card
                    (ParticipantMetadataCard) and, with an aria-label, in the Data table. */}
                <div className="flex items-center gap-1 text-2xs text-slate-500 truncate">
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
                                    {formatRelative(activityTime)}
                                </span>
                            </TooltipTrigger>
                            <TooltipContent className="text-xs">
                                {formatDateTime(activityTime)}
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
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
                className="h-7 w-7 shadow-sm shrink-0 rounded-lg"
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
    const { t } = useTranslation();
    const navigate = useNavigate();

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
        <Card
            data-testid="recent-activity-card"
            className="col-span-12 lg:col-span-8 border-none shadow-sm bg-white rounded-2xl overflow-hidden"
        >
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
                    <div className="p-6 text-center text-slate-500 text-xs">
                        {t('admin.study_overview.no_participants', 'No participants yet.')}
                    </div>
                ) : (
                    <div className="p-2 space-y-1.5">
                        {recentParticipants.map((p) => (
                            <ParticipantRow
                                key={p.id}
                                participant={p}
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
