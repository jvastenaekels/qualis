import type { ParticipantRead } from '@/api/model';
import { type ReactNode, useState, useMemo, useCallback } from 'react';
import {
    useReactTable,
    getCoreRowModel,
    getSortedRowModel,
    getPaginationRowModel,
    flexRender,
    createColumnHelper,
    type SortingState,
} from '@tanstack/react-table';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
    ArrowUpDown,
    ArrowUp,
    ArrowDown,
    Clock,
    Globe,
    ChevronLeft,
    ChevronRight,
    AlertTriangle,
    Monitor,
    Smartphone,
    Tablet,
    MessageSquare,
    Search,
    Mail,
    FileText,
    Users,
    Trash2,
    Calendar,
    Download,
    X,
    Mic,
    UserCheck,
    ArrowRight,
    FileSpreadsheet,
    Package,
    Database,
    FileCode,
    Sparkles,
    FilterX,
    Filter,
    Tag,
    MessagesSquare,
    Loader2,
    MoreVertical,
    Inbox,
    CheckCircle2,
    Footprints,
    ChevronDown,
    BarChart3,
} from 'lucide-react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { AdminService } from '@/api/admin';
import { useNavigate, useParams } from 'react-router-dom';
import {
    useGetStudyDumpApiAdminStudiesSlugDumpGet,
    getGetStudyDumpApiAdminStudiesSlugDumpGetQueryKey,
} from '@/api/generated';
import { customInstance } from '@/api/mutator';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { parseUA } from '@/utils/uaParser';
import {
    FaWindows,
    FaApple,
    FaLinux,
    FaAndroid,
    FaChrome,
    FaFirefoxBrowser,
    FaSafari,
    FaEdge,
    FaOpera,
    FaInternetExplorer,
} from 'react-icons/fa6';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
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
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { format } from 'date-fns';
import { enUS, fr, fi } from 'date-fns/locale';

import * as Collapsible from '@radix-ui/react-collapsible';
import type { DumpParticipant, DumpResponse } from './types';
import { QuestionDistributionCharts } from './charts/QuestionDistributionCharts';
import { SubmissionsTimelineChart } from './charts/SubmissionsTimelineChart';
import { DeviceBreakdownChart } from './charts/DeviceBreakdownChart';

interface InteractiveDataViewProps {
    slug: string;
    participants?: ParticipantRead[];
}

type ConsentType = 'email' | 'newsletter' | 'interview';
type StatusFilter = 'all' | 'completed' | 'in_progress' | 'abandoned';
type StepFilter = 'all' | 'completed' | 1 | 2 | 3 | 4 | 5;
type QualityFilter = 'all' | 'flagged' | 'has_comments' | 'has_audio' | 'has_recruitment';

const DEVICE_ICONS = { mobile: Smartphone, tablet: Tablet, desktop: Monitor } as const;
const OS_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
    Windows: FaWindows,
    macOS: FaApple,
    iOS: FaApple,
    Linux: FaLinux,
    Android: FaAndroid,
};
const BROWSER_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
    Chrome: FaChrome,
    Firefox: FaFirefoxBrowser,
    Safari: FaSafari,
    Edge: FaEdge,
    Opera: FaOpera,
    'Internet Explorer': FaInternetExplorer,
};

const SUSPECT_DURATION_THRESHOLD = 120;
const ABANDONED_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24h

function getDisplayStatus(p: DumpParticipant): 'completed' | 'in_progress' | 'abandoned' {
    if (p.status === 'completed') return 'completed';
    // Use last_step_reached_at if available, fallback to created_at
    const lastActive = p.last_step_reached_at || p.created_at;
    if (lastActive) {
        const age = Date.now() - new Date(lastActive).getTime();
        if (age > ABANDONED_THRESHOLD_MS) return 'abandoned';
    }
    return 'in_progress';
}

const STEP_LABEL_KEYS: Record<number, [string, string]> = {
    2: ['admin.data.step.presort', 'Pre-sort survey'],
    3: ['admin.data.step.rough', 'Preliminary sort'],
    4: ['admin.data.step.fine', 'Q-sort'],
    5: ['admin.data.step.post', 'Post-sort survey'],
};
const PAGE_SIZE = 25;
const columnHelper = createColumnHelper<DumpParticipant>();

function CollapsibleSection({
    title,
    icon,
    children,
    defaultOpen = true,
}: {
    title: string;
    icon: ReactNode;
    children: ReactNode;
    defaultOpen?: boolean;
}) {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <Collapsible.Root open={open} onOpenChange={setOpen}>
            <Collapsible.Trigger asChild>
                <button
                    type="button"
                    className="flex items-center gap-2 w-full text-left py-2 cursor-pointer"
                >
                    {icon}
                    <h2 className="text-sm font-bold text-slate-700 flex-1">{title}</h2>
                    <ChevronDown
                        className={cn(
                            'h-4 w-4 text-slate-400 transition-transform duration-200',
                            open && 'rotate-180'
                        )}
                    />
                </button>
            </Collapsible.Trigger>
            <Collapsible.Content className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
                <div className="pt-2 pb-1">{children}</div>
            </Collapsible.Content>
        </Collapsible.Root>
    );
}

export default function InteractiveDataView({
    slug,
    participants: initialParticipants,
}: InteractiveDataViewProps) {
    const { t, i18n } = useTranslation();
    const navigate = useNavigate();
    const { workspaceSlug } = useParams<{ workspaceSlug: string }>();
    const queryClient = useQueryClient();

    // biome-ignore lint/suspicious/noExplicitAny: complex locale types
    const dateLocales: Record<string, any> = { en: enUS, fr, fi };
    const currentLocale = dateLocales[i18n.language] || enUS;

    const { data: rawData, isLoading, error } = useGetStudyDumpApiAdminStudiesSlugDumpGet(slug);

    const [sorting, setSorting] = useState<SortingState>([{ id: 'submitted_at', desc: true }]);
    const [globalFilter, setGlobalFilter] = useState('');
    const [qualityFilter, setQualityFilter] = useState<QualityFilter>('all');
    const [consentFilters, setConsentFilters] = useState<Set<ConsentType>>(new Set());
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
    const [stepFilter, setStepFilter] = useState<StepFilter>('all');
    const [isExportLoading, setIsExportLoading] = useState(false);
    const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: PAGE_SIZE });
    const [clearAllDialogOpen, setClearAllDialogOpen] = useState(false);

    const toggleConsent = useCallback((type: ConsentType) => {
        setConsentFilters((prev) => {
            const next = new Set(prev);
            if (next.has(type)) next.delete(type);
            else next.add(type);
            return next;
        });
    }, []);

    const clearAllFilters = useCallback(() => {
        setConsentFilters(new Set());
        setQualityFilter('all');
        setStatusFilter('all');
        setStepFilter('all');
        setGlobalFilter('');
    }, []);

    const effectiveParticipants = useMemo(() => {
        const dumpData = rawData as unknown as DumpResponse | null;
        if (dumpData?.participants) return dumpData.participants;
        if (initialParticipants) {
            return initialParticipants.map((p) => ({
                id: String(p.id).substring(0, 8),
                db_id: p.id,
                duration_seconds: (p as { duration_seconds?: number }).duration_seconds ?? null,
                scores: [],
                placements: {},
                presort: {},
                postsort: {},
                language: p.language_used || 'en',
                is_discarded: p.is_discarded,
                is_test_run: p.is_test_run,
                discard_reason: p.discard_reason,
                created_at: p.created_at,
                submitted_at: p.submitted_at || p.created_at,
                recruitment_token: p.recruitment_token,
                status: p.status,
            })) as DumpParticipant[];
        }
        return [];
    }, [rawData, initialParticipants]);

    const data = useMemo(() => {
        if (rawData) return rawData as unknown as DumpResponse;
        return {
            study: {
                slug,
                statements: [],
                translations: [],
                presort_config: {},
                postsort_config: {},
                state: 'draft',
            },
            participants: effectiveParticipants,
            statement_id_to_index: {},
        } as DumpResponse;
    }, [rawData, effectiveParticipants, slug]);

    const handleClearAllParticipants = useCallback(async () => {
        try {
            await customInstance({
                url: `/api/admin/studies/${slug}/participants`,
                method: 'DELETE',
            });
            toast.success(
                t('admin.data.actions.clear_all_success', 'All participants successfully cleared!')
            );
            queryClient.invalidateQueries({
                queryKey: getGetStudyDumpApiAdminStudiesSlugDumpGetQueryKey(slug),
            });
        } catch (error) {
            toast.error(t('admin.data.actions.clear_all_error', 'Failed to clear participants'));
            console.error(error);
        }
    }, [slug, queryClient, t]);

    const liveParticipants = useMemo(
        () => effectiveParticipants.filter((p) => !p.is_test_run),
        [effectiveParticipants]
    );

    const liveCount = liveParticipants.length;
    const newsletterCount = liveParticipants.filter(
        (p) => p.postsort.newsletter_consent && p.postsort.email
    ).length;
    const interviewCount = liveParticipants.filter((p) => p.postsort.interview_consent).length;
    const completedCount = liveParticipants.filter(
        (p) => getDisplayStatus(p) === 'completed'
    ).length;
    const inProgressCount = liveParticipants.filter(
        (p) => getDisplayStatus(p) === 'in_progress'
    ).length;
    const submittedParticipants = useMemo(
        () => liveParticipants.filter((p) => p.status === 'completed'),
        [liveParticipants]
    );
    // Map duplicate IP hashes to a group number so participants sharing the same IP can be linked visually
    const duplicateIpGroups = useMemo(() => {
        const ipCounts = new Map<string, number>();
        for (const p of liveParticipants) {
            if (p.ip_address) {
                ipCounts.set(p.ip_address, (ipCounts.get(p.ip_address) || 0) + 1);
            }
        }
        const groups = new Map<string, number>();
        let groupNum = 1;
        for (const [ip, count] of ipCounts) {
            if (count > 1) {
                groups.set(ip, groupNum);
                groupNum++;
            }
        }
        return groups;
    }, [liveParticipants]);

    const deviceBreakdown = useMemo(() => {
        const counts: Record<string, number> = {};
        for (const p of liveParticipants) {
            const { device } = parseUA(p.user_agent);
            counts[device] = (counts[device] || 0) + 1;
        }
        return counts;
    }, [liveParticipants]);

    const hasActiveFilters =
        consentFilters.size > 0 ||
        qualityFilter !== 'all' ||
        statusFilter !== 'all' ||
        stepFilter !== 'all' ||
        globalFilter !== '';

    const filteredParticipants = useMemo(() => {
        return liveParticipants.filter((p) => {
            const matchesQuality = (() => {
                if (qualityFilter === 'all') return true;
                if (qualityFilter === 'flagged')
                    return (
                        (p.duration_seconds !== null &&
                            p.duration_seconds < SUSPECT_DURATION_THRESHOLD) ||
                        p.is_discarded
                    );
                if (qualityFilter === 'has_comments')
                    return Object.keys(p.postsort.card_comments || {}).length > 0;
                if (qualityFilter === 'has_audio')
                    return p.audio_recordings && Object.keys(p.audio_recordings).length > 0;
                if (qualityFilter === 'has_recruitment') return !!p.recruitment_token;
                return true;
            })();

            const matchesConsent =
                consentFilters.size === 0 ||
                [...consentFilters].every((f) => {
                    if (f === 'email') return !!p.postsort.email;
                    if (f === 'newsletter') return !!p.postsort.newsletter_consent;
                    if (f === 'interview') return !!p.postsort.interview_consent;
                    return true;
                });

            const matchesStatus = statusFilter === 'all' || getDisplayStatus(p) === statusFilter;

            const matchesStep = (() => {
                if (stepFilter === 'all') return true;
                if (stepFilter === 'completed') return p.status === 'completed';
                return p.last_step_reached === stepFilter && p.status !== 'completed';
            })();

            const matchesSearch =
                !globalFilter ||
                (() => {
                    const q = globalFilter.toLowerCase();
                    return (
                        p.id.toLowerCase().includes(q) ||
                        (p.language || '').toLowerCase().includes(q) ||
                        (p.status || '').toLowerCase().includes(q) ||
                        (p.postsort?.email || '').toLowerCase().includes(q) ||
                        (p.recruitment_token || '').toLowerCase().includes(q) ||
                        (p.ip_address || '').toLowerCase().includes(q)
                    );
                })();

            return (
                matchesQuality && matchesConsent && matchesStatus && matchesStep && matchesSearch
            );
        });
    }, [liveParticipants, qualityFilter, consentFilters, statusFilter, stepFilter, globalFilter]);

    const handleViewParticipant = useCallback(
        (participant: DumpParticipant) => {
            const baseUrl = workspaceSlug
                ? `/app/${workspaceSlug}/studies/${slug}`
                : `/admin/studies/${slug}`;
            navigate(`${baseUrl}/participants/${participant.db_id || participant.id}`);
        },
        [navigate, slug, workspaceSlug]
    );

    const runExport = useCallback(
        async (exportFn: () => Promise<void>) => {
            setIsExportLoading(true);
            try {
                await exportFn();
                toast.success(t('admin.export.success', 'Export successful'));
            } catch (_e) {
                toast.error(t('admin.export.error', 'Export failed'));
            } finally {
                setIsExportLoading(false);
            }
        },
        [t]
    );

    const downloadBlob = useCallback((blob: Blob, filename: string) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    }, []);

    const exportNewsletterList = useCallback(() => {
        runExport(async () => {
            const escapeCsv = (v: string) => `"${v.replace(/"/g, '""')}"`;
            const rows = liveParticipants.filter(
                (p) => p.postsort.newsletter_consent && p.postsort.email
            );
            const csv = ['email', ...rows.map((p) => escapeCsv(p.postsort.email ?? ''))].join('\n');
            const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' });
            downloadBlob(blob, `${slug}_newsletter_emails.csv`);
        });
    }, [liveParticipants, slug, downloadBlob, runExport]);

    const showLanguageColumn = data.study.translations.length > 1;

    const columns = useMemo(
        () => [
            columnHelper.accessor('id', {
                header: () => (
                    <div className="flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-slate-400" />
                        <span>{t('admin.data.table.participant')}</span>
                    </div>
                ),
                cell: (info) => {
                    const p = info.row.original;
                    const ua = p.user_agent ? parseUA(p.user_agent) : null;
                    const DeviceIcon = ua ? DEVICE_ICONS[ua.device] : null;
                    const OsIcon = ua ? OS_ICONS[ua.os] : null;
                    const BrowserIcon = ua ? BROWSER_ICONS[ua.browser] : null;
                    return (
                        <div className="flex flex-col gap-1.5">
                            <div className="flex items-center gap-2">
                                <span className="font-mono text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
                                    {info.getValue()}
                                </span>
                                {ua && DeviceIcon && (
                                    <TooltipProvider>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <div className="flex items-center gap-1">
                                                    <span className="inline-flex items-center text-slate-400">
                                                        {OsIcon ? (
                                                            <OsIcon className="w-3 h-3" />
                                                        ) : (
                                                            <DeviceIcon className="w-3 h-3" />
                                                        )}
                                                    </span>
                                                    {ua.browser !== 'Unknown' && (
                                                        <span className="inline-flex items-center text-slate-400">
                                                            {BrowserIcon ? (
                                                                <BrowserIcon className="w-3 h-3" />
                                                            ) : (
                                                                <Globe className="w-3 h-3" />
                                                            )}
                                                        </span>
                                                    )}
                                                </div>
                                            </TooltipTrigger>
                                            <TooltipContent
                                                side="bottom"
                                                className="max-w-xs break-all font-mono text-[10px]"
                                            >
                                                {p.user_agent}
                                            </TooltipContent>
                                        </Tooltip>
                                    </TooltipProvider>
                                )}
                                {p.is_discarded && (
                                    <Badge
                                        variant="destructive"
                                        className="h-4 text-[10px] px-1.5 font-semibold"
                                    >
                                        {t('admin.data.detail.discarded_badge')}
                                    </Badge>
                                )}
                            </div>
                            {p.ip_address && duplicateIpGroups.has(p.ip_address) && (
                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger>
                                            <Badge
                                                variant="outline"
                                                className="h-4 text-[10px] px-1.5 font-semibold bg-amber-50 text-amber-600 border-amber-200"
                                            >
                                                {t('admin.data.table.duplicate_ip', 'Duplicate IP')}{' '}
                                                #{duplicateIpGroups.get(p.ip_address)}
                                            </Badge>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            {t(
                                                'admin.data.table.duplicate_ip_hint',
                                                'Shares IP hash with other participants'
                                            )}{' '}
                                            ({p.ip_address.substring(0, 8)}...)
                                        </TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                            )}
                        </div>
                    );
                },
            }),
            ...(showLanguageColumn
                ? [
                      columnHelper.accessor('language', {
                          header: ({ column }) => (
                              <Button
                                  variant="ghost"
                                  onClick={() =>
                                      column.toggleSorting(column.getIsSorted() === 'asc')
                                  }
                                  className="h-8 text-xs font-semibold p-0 hover:bg-transparent flex items-center gap-1.5"
                              >
                                  <Globe className="w-3.5 h-3.5 text-slate-400" />
                                  {t('admin.data.table.lang')}
                                  {column.getIsSorted() === 'asc' ? (
                                      <ArrowUp className="ml-2 h-3 w-3 text-indigo-500" />
                                  ) : column.getIsSorted() === 'desc' ? (
                                      <ArrowDown className="ml-2 h-3 w-3 text-indigo-500" />
                                  ) : (
                                      <ArrowUpDown className="ml-2 h-3 w-3 text-slate-300" />
                                  )}
                              </Button>
                          ),
                          cell: (info) => (
                              <div className="flex items-center gap-2 text-slate-600 font-medium">
                                  <Globe className="h-3.5 w-3.5 text-slate-300" />
                                  <span className="text-xs font-medium">
                                      {info.getValue() === 'US' ? 'EN' : info.getValue()}
                                  </span>
                              </div>
                          ),
                      }),
                  ]
                : []),
            columnHelper.accessor('status', {
                header: ({ column }) => (
                    <div className="flex items-center gap-1">
                        <Button
                            variant="ghost"
                            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
                            className="h-8 text-xs font-semibold p-0 hover:bg-transparent flex items-center gap-1.5"
                        >
                            <Sparkles className="w-3.5 h-3.5 text-slate-400" />
                            {t('admin.data.table.status', 'Status')}
                            {column.getIsSorted() === 'asc' ? (
                                <ArrowUp className="ml-1 h-3 w-3 text-indigo-500" />
                            ) : column.getIsSorted() === 'desc' ? (
                                <ArrowDown className="ml-1 h-3 w-3 text-indigo-500" />
                            ) : (
                                <ArrowUpDown className="ml-1 h-3 w-3 text-slate-300" />
                            )}
                        </Button>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    aria-label={t('admin.data.table.status', 'Status')}
                                    className={cn(
                                        'h-6 w-6 p-0 rounded',
                                        statusFilter !== 'all' || stepFilter !== 'all'
                                            ? 'text-indigo-600 bg-indigo-50'
                                            : 'text-slate-400 hover:text-slate-600'
                                    )}
                                >
                                    <Filter className="h-3 w-3" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                                align="start"
                                className="w-48"
                                collisionPadding={8}
                            >
                                <DropdownMenuItem
                                    onClick={() => {
                                        setStatusFilter('all');
                                        setStepFilter('all');
                                    }}
                                >
                                    {t('admin.data.filters.all_statuses', 'All')}
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-slate-400">
                                    {t('admin.data.table.status', 'Status')}
                                </DropdownMenuLabel>
                                <DropdownMenuItem
                                    onClick={() => {
                                        setStatusFilter('completed');
                                        setStepFilter('all');
                                    }}
                                    className={cn(
                                        'text-emerald-600',
                                        statusFilter === 'completed' && 'bg-emerald-50'
                                    )}
                                >
                                    <CheckCircle2 className="w-3.5 h-3.5 mr-2" />
                                    {t('admin.data.status.completed', 'Completed')}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    onClick={() => {
                                        setStatusFilter('in_progress');
                                        setStepFilter('all');
                                    }}
                                    className={cn(
                                        'text-sky-600',
                                        statusFilter === 'in_progress' && 'bg-sky-50'
                                    )}
                                >
                                    <Clock className="w-3.5 h-3.5 mr-2" />
                                    {t('admin.data.status.in_progress', 'In Progress')}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    onClick={() => {
                                        setStatusFilter('abandoned');
                                        setStepFilter('all');
                                    }}
                                    className={cn(
                                        'text-rose-600',
                                        statusFilter === 'abandoned' && 'bg-rose-50'
                                    )}
                                >
                                    <AlertTriangle className="w-3.5 h-3.5 mr-2" />
                                    {t('admin.data.status.abandoned', 'Abandoned')}
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-slate-400">
                                    {t('admin.data.table.current_step', 'Current step')}
                                </DropdownMenuLabel>
                                {Object.entries(STEP_LABEL_KEYS).map(([step, [key, fallback]]) => (
                                    <DropdownMenuItem
                                        key={step}
                                        onClick={() => {
                                            setStepFilter(Number(step) as 1 | 2 | 3 | 4 | 5);
                                            setStatusFilter('all');
                                        }}
                                        className={cn(
                                            stepFilter === Number(step) &&
                                                'bg-indigo-50 text-indigo-700'
                                        )}
                                    >
                                        {t(key, fallback)}
                                    </DropdownMenuItem>
                                ))}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                ),
                cell: ({ row }) => {
                    const p = row.original;
                    const displayStatus = getDisplayStatus(p);
                    const currentStep =
                        displayStatus !== 'completed' && p.last_step_reached != null
                            ? p.last_step_reached
                            : null;
                    return (
                        <div className="flex items-center gap-1.5">
                            <Badge
                                variant="outline"
                                className={cn(
                                    'h-5 text-[10px] px-2 font-semibold border-none',
                                    displayStatus === 'completed'
                                        ? 'bg-emerald-50 text-emerald-600'
                                        : displayStatus === 'abandoned'
                                          ? 'bg-rose-50 text-rose-500'
                                          : 'bg-sky-50 text-sky-600'
                                )}
                            >
                                {t(`admin.data.status.${displayStatus}`, displayStatus)}
                            </Badge>
                            {currentStep != null && STEP_LABEL_KEYS[currentStep] && (
                                <Badge
                                    variant="outline"
                                    className="h-5 text-[10px] px-2 font-semibold border-slate-200 text-slate-500"
                                >
                                    {t(...STEP_LABEL_KEYS[currentStep])}
                                </Badge>
                            )}
                        </div>
                    );
                },
            }),
            columnHelper.display({
                id: 'consent_indicators',
                header: () => (
                    <div className="flex items-center gap-1">
                        <div className="flex items-center gap-1.5">
                            <UserCheck className="w-3.5 h-3.5" />
                            <span>{t('admin.data.table.consent', 'Consent')}</span>
                        </div>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    aria-label={t('admin.data.table.consent', 'Consent')}
                                    className={cn(
                                        'h-6 w-6 p-0 rounded',
                                        consentFilters.size > 0
                                            ? 'text-indigo-600 bg-indigo-50'
                                            : 'text-slate-400 hover:text-slate-600'
                                    )}
                                >
                                    <Filter className="h-3 w-3" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                                align="start"
                                className="w-48"
                                collisionPadding={8}
                            >
                                <DropdownMenuItem onClick={() => setConsentFilters(new Set())}>
                                    {t('admin.data.filters.all_consents', 'All')}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    onClick={() => toggleConsent('email')}
                                    className={cn(
                                        consentFilters.has('email') &&
                                            'bg-indigo-50 text-indigo-700'
                                    )}
                                >
                                    <Mail className="w-3.5 h-3.5 mr-2" />
                                    {t('admin.data.filters.has_email', 'Email provided')}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    onClick={() => toggleConsent('newsletter')}
                                    className={cn(
                                        consentFilters.has('newsletter') &&
                                            'bg-emerald-50 text-emerald-700'
                                    )}
                                >
                                    <FileText className="w-3.5 h-3.5 mr-2" />
                                    {t('admin.data.filters.newsletter', 'Wants results')}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    onClick={() => toggleConsent('interview')}
                                    className={cn(
                                        consentFilters.has('interview') &&
                                            'bg-amber-50 text-amber-700'
                                    )}
                                >
                                    <MessagesSquare className="w-3.5 h-3.5 mr-2" />
                                    {t('admin.data.filters.interview', 'Follow-up')}
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                ),
                cell: ({ row }) => {
                    const p = row.original;
                    return (
                        <TooltipProvider>
                            <div className="flex items-center gap-1.5">
                                {p.postsort.email && (
                                    <Tooltip>
                                        <TooltipTrigger>
                                            <div className="p-1 bg-indigo-50 rounded text-indigo-600 border border-indigo-100">
                                                <Mail className="h-3 w-3" />
                                            </div>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            {t(
                                                'admin.data.tooltips.email_provided',
                                                'Email provided'
                                            )}
                                        </TooltipContent>
                                    </Tooltip>
                                )}
                                {p.postsort.newsletter_consent && (
                                    <Tooltip>
                                        <TooltipTrigger>
                                            <div className="p-1 bg-emerald-50 rounded text-emerald-600 border border-emerald-100">
                                                <FileText className="h-3 w-3" />
                                            </div>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            {t(
                                                'admin.data.tooltips.newsletter_consent',
                                                'Wants results'
                                            )}
                                        </TooltipContent>
                                    </Tooltip>
                                )}
                                {p.postsort.interview_consent && (
                                    <Tooltip>
                                        <TooltipTrigger>
                                            <div className="p-1 bg-amber-50 rounded text-amber-600 border border-amber-100">
                                                <MessagesSquare className="h-3 w-3" />
                                            </div>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            {t(
                                                'admin.data.tooltips.interview_consent',
                                                'Accepts follow-up'
                                            )}
                                        </TooltipContent>
                                    </Tooltip>
                                )}
                                {!p.postsort.email &&
                                    !p.postsort.newsletter_consent &&
                                    !p.postsort.interview_consent && (
                                        <span className="text-[10px] text-slate-300 font-medium">
                                            —
                                        </span>
                                    )}
                            </div>
                        </TooltipProvider>
                    );
                },
            }),
            columnHelper.display({
                id: 'quality',
                header: () => (
                    <div className="flex items-center gap-1">
                        <div className="flex items-center gap-1.5">
                            <AlertTriangle className="w-3.5 h-3.5 text-slate-400" />
                            <span>{t('admin.data.table.flags')}</span>
                        </div>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    aria-label={t('admin.data.table.flags')}
                                    className={cn(
                                        'h-6 w-6 p-0 rounded',
                                        qualityFilter !== 'all'
                                            ? 'text-indigo-600 bg-indigo-50'
                                            : 'text-slate-400 hover:text-slate-600'
                                    )}
                                >
                                    <Filter className="h-3 w-3" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                                align="start"
                                className="w-52"
                                collisionPadding={8}
                            >
                                <DropdownMenuItem onClick={() => setQualityFilter('all')}>
                                    {t('admin.data.filters.all_indicators', 'All')}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    onClick={() => setQualityFilter('flagged')}
                                    className={cn(
                                        qualityFilter === 'flagged' && 'bg-amber-50 text-amber-700'
                                    )}
                                >
                                    <AlertTriangle className="w-3.5 h-3.5 mr-2" />
                                    {t('admin.data.filters.flagged', 'Flagged')}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    onClick={() => setQualityFilter('has_comments')}
                                    className={cn(
                                        qualityFilter === 'has_comments' &&
                                            'bg-blue-50 text-blue-700'
                                    )}
                                >
                                    <MessageSquare className="w-3.5 h-3.5 mr-2" />
                                    {t('admin.data.filters.has_comments', 'Has comments')}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    onClick={() => setQualityFilter('has_audio')}
                                    className={cn(
                                        qualityFilter === 'has_audio' &&
                                            'bg-purple-50 text-purple-700'
                                    )}
                                >
                                    <Mic className="w-3.5 h-3.5 mr-2" />
                                    {t('admin.data.filters.has_audio', 'Has audio')}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    onClick={() => setQualityFilter('has_recruitment')}
                                    className={cn(
                                        qualityFilter === 'has_recruitment' &&
                                            'bg-slate-100 text-slate-700'
                                    )}
                                >
                                    <Tag className="w-3.5 h-3.5 mr-2" />
                                    {t(
                                        'admin.data.filters.has_recruitment',
                                        'Has recruitment link'
                                    )}
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                ),
                cell: ({ row }) => {
                    const p = row.original;
                    const isSuspect =
                        p.duration_seconds !== null &&
                        p.duration_seconds < SUSPECT_DURATION_THRESHOLD;
                    const hasComments = Object.keys(p.postsort.card_comments || {}).length > 0;
                    const hasAudio =
                        p.audio_recordings && Object.keys(p.audio_recordings).length > 0;
                    const hasRecruitmentLink = !!p.recruitment_token;

                    return (
                        <div className="flex items-center gap-1.5">
                            <TooltipProvider>
                                {hasRecruitmentLink && (
                                    <Tooltip>
                                        <TooltipTrigger>
                                            <div className="p-1 bg-slate-50 rounded text-slate-500 border border-slate-200">
                                                <Tag className="h-3 w-3" />
                                            </div>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            {t(
                                                'admin.data.tooltips.recruitment_link',
                                                'Recruitment link'
                                            )}
                                            : {p.recruitment_token}
                                        </TooltipContent>
                                    </Tooltip>
                                )}
                                {isSuspect && (
                                    <Tooltip>
                                        <TooltipTrigger>
                                            <div className="p-1 bg-amber-50 rounded text-amber-500 border border-amber-100">
                                                <AlertTriangle className="h-3 w-3" />
                                            </div>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            {t('admin.data.tooltips.suspect')}
                                        </TooltipContent>
                                    </Tooltip>
                                )}
                                {hasComments && (
                                    <Tooltip>
                                        <TooltipTrigger>
                                            <div className="p-1 bg-blue-50 rounded text-blue-500 border border-blue-100">
                                                <MessageSquare className="h-3 w-3" />
                                            </div>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            {t('admin.data.tooltips.has_comments')}
                                        </TooltipContent>
                                    </Tooltip>
                                )}
                                {hasAudio && (
                                    <Tooltip>
                                        <TooltipTrigger>
                                            <div className="p-1 bg-purple-50 rounded text-purple-500 border border-purple-100">
                                                <Mic className="h-3 w-3" />
                                            </div>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            {t(
                                                'admin.data.tooltips.has_audio',
                                                'Has audio responses'
                                            )}
                                        </TooltipContent>
                                    </Tooltip>
                                )}
                                {!isSuspect && !hasComments && !hasAudio && !hasRecruitmentLink && (
                                    <span className="text-[10px] text-slate-300 font-medium">
                                        —
                                    </span>
                                )}
                            </TooltipProvider>
                        </div>
                    );
                },
            }),
            columnHelper.accessor('duration_seconds', {
                header: ({ column }) => (
                    <Button
                        variant="ghost"
                        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
                        className="h-8 text-xs font-semibold p-0 hover:bg-transparent flex items-center justify-end gap-1.5 w-full text-right"
                    >
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        {t('admin.data.table.duration')}
                        {column.getIsSorted() === 'asc' ? (
                            <ArrowUp className="ml-2 h-3 w-3 text-indigo-500" />
                        ) : column.getIsSorted() === 'desc' ? (
                            <ArrowDown className="ml-2 h-3 w-3 text-indigo-500" />
                        ) : (
                            <ArrowUpDown className="ml-2 h-3 w-3 text-slate-300" />
                        )}
                    </Button>
                ),
                cell: (info) => {
                    const seconds = info.getValue();
                    if (seconds === null)
                        return <span className="text-slate-300 text-right block">—</span>;
                    return (
                        <div className="flex items-center justify-end gap-1.5 font-mono text-xs text-slate-600">
                            {seconds >= 3600
                                ? t('common.duration_long', '{{h}}h {{m}}m {{s}}s', {
                                      h: Math.floor(seconds / 3600),
                                      m: Math.floor((seconds % 3600) / 60),
                                      s: Math.floor(seconds % 60),
                                  })
                                : t('common.duration_short', '{{m}}m {{s}}s', {
                                      m: Math.floor(seconds / 60),
                                      s: Math.floor(seconds % 60),
                                  })}
                        </div>
                    );
                },
            }),
            columnHelper.accessor('submitted_at', {
                id: 'submitted_at',
                header: ({ column }) => (
                    <Button
                        variant="ghost"
                        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
                        className="h-8 text-xs font-semibold p-0 hover:bg-transparent flex items-center gap-1.5"
                    >
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        {t('admin.data.table.submitted')}
                        {column.getIsSorted() === 'asc' ? (
                            <ArrowUp className="ml-2 h-3 w-3 text-indigo-500" />
                        ) : column.getIsSorted() === 'desc' ? (
                            <ArrowDown className="ml-2 h-3 w-3 text-indigo-500" />
                        ) : (
                            <ArrowUpDown className="ml-2 h-3 w-3 text-slate-300" />
                        )}
                    </Button>
                ),
                cell: (info) => {
                    const val = info.getValue();
                    if (!val) return <span className="text-slate-300">—</span>;
                    const date = new Date(val);
                    return (
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger>
                                    <div className="flex flex-col text-xs text-slate-500 font-medium">
                                        <span>
                                            {format(date, 'MMM d, HH:mm', {
                                                locale: currentLocale,
                                            })}
                                        </span>
                                    </div>
                                </TooltipTrigger>
                                <TooltipContent>
                                    {format(date, 'PPpp', { locale: currentLocale })}
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    );
                },
            }),
        ],
        [
            t,
            currentLocale,
            duplicateIpGroups,
            showLanguageColumn,
            statusFilter,
            consentFilters,
            qualityFilter,
            stepFilter,
            toggleConsent,
        ]
    );

    const table = useReactTable({
        data: filteredParticipants,
        columns,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        onSortingChange: setSorting,
        onPaginationChange: setPagination,
        state: { sorting, pagination },
    });

    if (isLoading && !data) {
        return (
            <div className="space-y-6">
                <div className="grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-4">
                    {[1, 2, 3, 4].map((i) => (
                        <Skeleton key={i} className="h-24 sm:h-32 rounded-2xl" />
                    ))}
                </div>
                <div className="space-y-3">
                    <Skeleton className="h-10 w-full rounded-lg" />
                    <Skeleton className="h-[400px] w-full rounded-xl" />
                </div>
            </div>
        );
    }

    if ((error && !data) || (!data && !isLoading)) {
        return (
            <div className="rounded-2xl border-2 border-dashed border-red-100 bg-red-50/50 p-12 text-center">
                <div className="inline-flex p-4 bg-red-100 text-red-600 rounded-full mb-4">
                    <AlertTriangle className="w-8 h-8" />
                </div>
                <h3 className="text-lg font-black text-red-900 mb-2">{t('common.error')}</h3>
                <p className="text-red-600 font-medium max-w-xs mx-auto">
                    {t('admin.data.errors.load_failed')}
                </p>
                <Button
                    variant="outline"
                    className="mt-6 border-red-200 text-red-700 hover:bg-red-100"
                    onClick={() => window.location.reload()}
                >
                    {t('common.errors.retry')}
                </Button>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Section 1: Key indicators */}
            <CollapsibleSection
                title={t('admin.data.sections.key_indicators', 'Key indicators')}
                icon={<BarChart3 className="h-4 w-4 text-slate-400" />}
            >
                <div className="grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-4">
                    {/* Primary Metrics: Completed & In Progress */}

                    {/* Completed Card */}
                    <button
                        type="button"
                        onClick={() =>
                            setStatusFilter((prev) => (prev === 'completed' ? 'all' : 'completed'))
                        }
                        className={cn(
                            'group relative overflow-hidden bg-white p-3 sm:p-5 rounded-2xl border-2 shadow-sm hover:shadow-md transition-all text-left flex flex-col justify-between min-h-[100px] sm:min-h-[140px]',
                            statusFilter === 'completed'
                                ? 'border-emerald-500 ring-4 ring-emerald-50/50'
                                : 'border-slate-100 hover:border-emerald-200'
                        )}
                    >
                        <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity hidden sm:block">
                            <CheckCircle2 className="w-24 h-24 text-emerald-500 -mr-6 -mt-6" />
                        </div>

                        <div>
                            <div className="flex items-center gap-2 mb-3">
                                <div
                                    className={cn(
                                        'p-2 rounded-lg transition-colors',
                                        statusFilter === 'completed'
                                            ? 'bg-emerald-100 text-emerald-700'
                                            : 'bg-emerald-50 text-emerald-600'
                                    )}
                                >
                                    <CheckCircle2 className="w-5 h-5" />
                                </div>
                                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                                    {t('admin.data.stats.completed', 'Completed')}
                                </span>
                            </div>

                            <div className="flex items-baseline gap-2">
                                <span className="text-xl sm:text-4xl font-black text-slate-900 tracking-tight">
                                    {completedCount}
                                </span>
                            </div>
                        </div>

                        <div className="mt-2 sm:mt-4 hidden sm:flex items-center text-[11px] font-semibold text-emerald-600 gap-1 opacity-0 group-hover:opacity-100 transition-opacity translate-y-1 group-hover:translate-y-0 duration-300">
                            {t('admin.data.stats.click_to_filter', 'Filter table')}
                            <ArrowRight className="w-3 h-3" />
                        </div>
                    </button>

                    {/* In Progress Card */}
                    <button
                        type="button"
                        onClick={() =>
                            setStatusFilter((prev) =>
                                prev === 'in_progress' ? 'all' : 'in_progress'
                            )
                        }
                        className={cn(
                            'group relative overflow-hidden bg-white p-3 sm:p-5 rounded-2xl border-2 shadow-sm hover:shadow-md transition-all text-left flex flex-col justify-between min-h-[100px] sm:min-h-[140px]',
                            statusFilter === 'in_progress'
                                ? 'border-sky-500 ring-4 ring-sky-50/50'
                                : 'border-slate-100 hover:border-sky-200'
                        )}
                    >
                        <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity hidden sm:block">
                            <Clock className="w-24 h-24 text-sky-500 -mr-6 -mt-6" />
                        </div>

                        <div>
                            <div className="flex items-center gap-2 mb-3">
                                <div
                                    className={cn(
                                        'p-2 rounded-lg transition-colors',
                                        statusFilter === 'in_progress'
                                            ? 'bg-sky-100 text-sky-700'
                                            : 'bg-sky-50 text-sky-600'
                                    )}
                                >
                                    <Clock className="w-5 h-5" />
                                </div>
                                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                                    {t('admin.data.stats.in_progress', 'In Progress')}
                                </span>
                            </div>

                            <div className="flex items-baseline gap-2">
                                <span className="text-xl sm:text-4xl font-black text-slate-900 tracking-tight">
                                    {inProgressCount}
                                </span>
                            </div>
                        </div>

                        <div className="mt-2 sm:mt-4 hidden sm:flex items-center text-[11px] font-semibold text-sky-600 gap-1 opacity-0 group-hover:opacity-100 transition-opacity translate-y-1 group-hover:translate-y-0 duration-300">
                            {t('admin.data.stats.click_to_filter', 'Filter table')}
                            <ArrowRight className="w-3 h-3" />
                        </div>
                    </button>

                    {/* Interview Consent Card */}
                    <button
                        type="button"
                        onClick={() => toggleConsent('interview')}
                        className={cn(
                            'group relative overflow-hidden bg-white p-3 sm:p-5 rounded-2xl border-2 shadow-sm hover:shadow-md transition-all text-left flex flex-col justify-between min-h-[100px] sm:min-h-[140px]',
                            consentFilters.has('interview')
                                ? 'border-amber-500 ring-4 ring-amber-50/50'
                                : 'border-slate-100 hover:border-amber-200'
                        )}
                    >
                        <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity hidden sm:block">
                            <MessagesSquare className="w-24 h-24 text-amber-500 -mr-6 -mt-6" />
                        </div>

                        <div>
                            <div className="flex items-center gap-2 mb-3">
                                <div
                                    className={cn(
                                        'p-2 rounded-lg transition-colors',
                                        consentFilters.has('interview')
                                            ? 'bg-amber-100 text-amber-700'
                                            : 'bg-amber-50 text-amber-600'
                                    )}
                                >
                                    <MessagesSquare className="w-5 h-5" />
                                </div>
                                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                                    {t(
                                        'admin.data.stats.interview_interested',
                                        'Accepts follow-up'
                                    )}
                                </span>
                            </div>

                            <div className="flex items-baseline gap-2">
                                <span className="text-xl sm:text-4xl font-black text-slate-900 tracking-tight">
                                    {interviewCount}
                                </span>
                            </div>
                        </div>

                        <div className="mt-2 sm:mt-4 hidden sm:flex items-center text-[11px] font-semibold text-amber-600 gap-1 opacity-0 group-hover:opacity-100 transition-opacity translate-y-1 group-hover:translate-y-0 duration-300">
                            {t('admin.data.stats.click_to_filter', 'Filter table')}
                            <ArrowRight className="w-3 h-3" />
                        </div>
                    </button>

                    {/* Newsletter Consent Card — exports email list */}
                    <button
                        type="button"
                        onClick={exportNewsletterList}
                        disabled={newsletterCount === 0}
                        aria-label={t('admin.data.stats.click_to_export', 'Click to export list')}
                        className="group relative overflow-hidden bg-white p-3 sm:p-5 rounded-2xl border-2 border-slate-100 hover:border-indigo-200 shadow-sm hover:shadow-md transition-all text-left flex flex-col justify-between min-h-[100px] sm:min-h-[140px] disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity hidden sm:block">
                            <FileText className="w-24 h-24 text-indigo-500 -mr-6 -mt-6" />
                        </div>

                        <div>
                            <div className="flex items-center gap-2 mb-3">
                                <div className="p-2 rounded-lg transition-colors bg-indigo-50 text-indigo-600">
                                    <FileText className="w-5 h-5" />
                                </div>
                                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                                    {t('admin.data.stats.newsletter', 'Wants results')}
                                </span>
                                <Download className="w-3.5 h-3.5 text-indigo-400 ml-auto sm:hidden" />
                            </div>

                            <div className="flex items-baseline gap-2">
                                <span className="text-xl sm:text-4xl font-black text-slate-900 tracking-tight">
                                    {newsletterCount}
                                </span>
                            </div>
                        </div>

                        <div className="mt-2 sm:mt-4 hidden sm:flex items-center text-[11px] font-semibold text-indigo-600 gap-1 opacity-0 group-hover:opacity-100 transition-opacity translate-y-1 group-hover:translate-y-0 duration-300">
                            {t('admin.data.stats.click_to_export', 'Click to export list')}
                            <Download className="w-3 h-3" />
                        </div>
                    </button>
                </div>
            </CollapsibleSection>

            {/* Section 2: Responses */}
            <CollapsibleSection
                title={t('admin.data.sections.responses', 'Responses')}
                icon={<Users className="h-4 w-4 text-slate-400" />}
            >
                {hasActiveFilters && (
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-slate-600">
                            {t('admin.data.filters.active', 'Active filters')}:
                        </span>
                        {consentFilters.has('email') && (
                            <Badge
                                variant="secondary"
                                className="h-7 px-3 gap-2 bg-indigo-100 text-indigo-700 border-indigo-200 font-semibold"
                            >
                                <Mail className="w-3 h-3" />
                                {t('admin.data.filters.has_email', 'Email provided')}
                                <button
                                    type="button"
                                    onClick={() => toggleConsent('email')}
                                    aria-label={t(
                                        'admin.data.filters.remove_filter',
                                        'Remove filter'
                                    )}
                                    className="hover:bg-indigo-200 rounded-full p-1.5 -m-1 transition-colors"
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            </Badge>
                        )}
                        {consentFilters.has('newsletter') && (
                            <Badge
                                variant="secondary"
                                className="h-7 px-3 gap-2 bg-emerald-100 text-emerald-700 border-emerald-200 font-semibold"
                            >
                                <FileText className="w-3 h-3" />
                                {t('admin.data.filters.newsletter', 'Wants results')}
                                <button
                                    type="button"
                                    onClick={() => toggleConsent('newsletter')}
                                    aria-label={t(
                                        'admin.data.filters.remove_filter',
                                        'Remove filter'
                                    )}
                                    className="hover:bg-emerald-200 rounded-full p-1.5 -m-1 transition-colors"
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            </Badge>
                        )}
                        {consentFilters.has('interview') && (
                            <Badge
                                variant="secondary"
                                className="h-7 px-3 gap-2 bg-amber-100 text-amber-700 border-amber-200 font-semibold"
                            >
                                <MessagesSquare className="w-3 h-3" />
                                {t('admin.data.filters.interview', 'Accepts follow-up')}
                                <button
                                    type="button"
                                    onClick={() => toggleConsent('interview')}
                                    aria-label={t(
                                        'admin.data.filters.remove_filter',
                                        'Remove filter'
                                    )}
                                    className="hover:bg-amber-200 rounded-full p-1.5 -m-1 transition-colors"
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            </Badge>
                        )}
                        {qualityFilter !== 'all' && (
                            <Badge
                                variant="secondary"
                                className="h-7 px-3 gap-2 bg-amber-100 text-amber-700 border-amber-200 font-semibold"
                            >
                                <AlertTriangle className="w-3 h-3" />
                                {qualityFilter === 'flagged'
                                    ? t('admin.data.filters.flagged', 'Flagged')
                                    : qualityFilter === 'has_comments'
                                      ? t('admin.data.filters.has_comments', 'Has comments')
                                      : qualityFilter === 'has_audio'
                                        ? t('admin.data.filters.has_audio', 'Has audio')
                                        : t(
                                              'admin.data.filters.has_recruitment',
                                              'Has recruitment link'
                                          )}
                                <button
                                    type="button"
                                    onClick={() => setQualityFilter('all')}
                                    aria-label={t(
                                        'admin.data.filters.remove_filter',
                                        'Remove filter'
                                    )}
                                    className="hover:bg-amber-200 rounded-full p-1.5 -m-1 transition-colors"
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            </Badge>
                        )}
                        {stepFilter !== 'all' && (
                            <Badge
                                variant="secondary"
                                className="h-7 px-3 gap-2 bg-indigo-100 text-indigo-700 border-indigo-200 font-semibold"
                            >
                                <Footprints className="w-3 h-3" />
                                {stepFilter === 'completed'
                                    ? t('admin.data.status.completed', 'Completed')
                                    : STEP_LABEL_KEYS[stepFilter]
                                      ? t(...STEP_LABEL_KEYS[stepFilter])
                                      : stepFilter}
                                <button
                                    type="button"
                                    onClick={() => setStepFilter('all')}
                                    aria-label={t(
                                        'admin.data.filters.remove_filter',
                                        'Remove filter'
                                    )}
                                    className="hover:bg-indigo-200 rounded-full p-1.5 -m-1 transition-colors"
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            </Badge>
                        )}
                        {statusFilter !== 'all' && (
                            <Badge
                                variant="secondary"
                                className={cn(
                                    'h-7 px-3 gap-2 font-semibold',
                                    statusFilter === 'completed'
                                        ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                                        : statusFilter === 'in_progress'
                                          ? 'bg-sky-100 text-sky-700 border-sky-200'
                                          : 'bg-rose-100 text-rose-700 border-rose-200'
                                )}
                            >
                                <Sparkles className="w-3 h-3" />
                                {t(`admin.data.status.${statusFilter}`, statusFilter)}
                                <button
                                    type="button"
                                    onClick={() => setStatusFilter('all')}
                                    aria-label={t(
                                        'admin.data.filters.remove_filter',
                                        'Remove filter'
                                    )}
                                    className={cn(
                                        'rounded-full p-1.5 -m-1 transition-colors',
                                        statusFilter === 'completed'
                                            ? 'hover:bg-emerald-200'
                                            : statusFilter === 'in_progress'
                                              ? 'hover:bg-sky-200'
                                              : 'hover:bg-rose-200'
                                    )}
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            </Badge>
                        )}
                        {globalFilter && (
                            <Badge
                                variant="secondary"
                                className="h-7 px-3 gap-2 bg-slate-100 text-slate-700 border-slate-200 font-semibold"
                            >
                                <Search className="w-3 h-3" />
                                &ldquo;{globalFilter}&rdquo;
                                <button
                                    type="button"
                                    onClick={() => setGlobalFilter('')}
                                    aria-label={t(
                                        'admin.data.filters.remove_filter',
                                        'Remove filter'
                                    )}
                                    className="hover:bg-slate-200 rounded-full p-1.5 -m-1 transition-colors"
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            </Badge>
                        )}
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={clearAllFilters}
                            className="h-7 text-xs font-semibold text-slate-600 gap-1.5"
                        >
                            <FilterX className="w-3.5 h-3.5" />
                            {t('admin.data.filters.clear_all', 'Clear all')}
                        </Button>
                    </div>
                )}

                <div className="flex flex-row items-center justify-between gap-2 sm:gap-3 w-full bg-white p-2 rounded-2xl border border-slate-200 shadow-sm">
                    {/* Left Group: Search */}
                    <div className="flex items-center gap-3 flex-1 min-w-0 sm:max-w-sm lg:max-w-2xl">
                        <div className="relative group w-full">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-indigo-500 transition-colors pointer-events-none" />
                            <Input
                                placeholder={t(
                                    'admin.data.search.placeholder',
                                    'Search by ID, email...'
                                )}
                                aria-label={t(
                                    'admin.data.search.placeholder',
                                    'Search by ID, email...'
                                )}
                                value={globalFilter ?? ''}
                                onChange={(e) => setGlobalFilter(e.target.value)}
                                className="pl-10 h-10 bg-slate-50 border-slate-200 focus-visible:ring-indigo-500 rounded-lg shadow-none focus:bg-white transition-all font-medium text-sm w-full"
                            />
                        </div>
                    </div>
                    {/* Right Group: Actions */}
                    <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                        {/* Export Dropdown */}
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    className="h-10 w-10 sm:w-auto sm:h-9 bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-sm gap-2 text-xs"
                                    disabled={isExportLoading}
                                    aria-label={t('admin.export.label', 'Export')}
                                >
                                    {isExportLoading ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                        <Download className="h-3.5 w-3.5" />
                                    )}
                                    <span className="hidden sm:inline">
                                        {t('admin.export.label', 'Export')}
                                    </span>
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                                align="end"
                                className="w-56 rounded-xl"
                                collisionPadding={8}
                            >
                                <DropdownMenuItem
                                    disabled={isExportLoading}
                                    onClick={() =>
                                        runExport(async () => {
                                            const blob =
                                                await AdminService.exportResearchPackage(slug);
                                            downloadBlob(blob, `${slug}_research_package.zip`);
                                        })
                                    }
                                    className="font-bold cursor-pointer text-indigo-600 bg-indigo-50/50 gap-2"
                                >
                                    <Package className="h-4 w-4" />
                                    {t('admin.export.formats.package', 'Research Package (ZIP)')}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    disabled={isExportLoading}
                                    onClick={() =>
                                        runExport(async () => {
                                            const blob = await AdminService.exportCSV(slug);
                                            downloadBlob(blob, `${slug}_data.csv`);
                                        })
                                    }
                                    className="font-medium cursor-pointer gap-2"
                                >
                                    <FileSpreadsheet className="h-4 w-4" />
                                    {t('admin.export.formats.csv', 'CSV')}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    disabled={isExportLoading}
                                    onClick={() =>
                                        runExport(async () => {
                                            const blob = await AdminService.exportPQMethod(slug);
                                            downloadBlob(blob, `${slug}_pqmethod.zip`);
                                        })
                                    }
                                    className="font-medium cursor-pointer gap-2"
                                >
                                    <Database className="h-4 w-4" />
                                    {t('admin.export.formats.pqmethod', 'PQMethod (ZIP)')}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    disabled={isExportLoading}
                                    onClick={() =>
                                        runExport(async () => {
                                            const blob = await AdminService.exportRKit(slug);
                                            downloadBlob(blob, `${slug}_r_kit.zip`);
                                        })
                                    }
                                    className="font-medium cursor-pointer gap-2"
                                >
                                    <FileCode className="h-4 w-4" />
                                    {t('admin.export.formats.rkit', 'R-Kit (ZIP)')}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    disabled={isExportLoading}
                                    onClick={() =>
                                        runExport(async () => {
                                            const blob = new Blob(
                                                [JSON.stringify(rawData, null, 2)],
                                                {
                                                    type: 'application/json',
                                                }
                                            );
                                            downloadBlob(blob, `${slug}_dump.json`);
                                        })
                                    }
                                    className="font-medium cursor-pointer gap-2"
                                >
                                    <FileCode className="h-4 w-4" />
                                    {t('admin.export.formats.json', 'JSON Dump')}
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>

                        {liveCount > 0 && data.study.state === 'draft' && (
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-9 w-9 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                                    >
                                        <MoreVertical className="h-4 w-4" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent
                                    align="end"
                                    className="w-52 rounded-xl"
                                    collisionPadding={8}
                                >
                                    <DropdownMenuItem
                                        onClick={() => setClearAllDialogOpen(true)}
                                        className="font-semibold cursor-pointer gap-2 text-rose-600 focus:text-rose-600 focus:bg-rose-50"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                        {t('admin.data.actions.clear_all')}
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        )}
                    </div>
                </div>

                <AlertDialog open={clearAllDialogOpen} onOpenChange={setClearAllDialogOpen}>
                    <AlertDialogContent className="rounded-3xl border-none shadow-2xl">
                        <AlertDialogHeader>
                            <AlertDialogTitle className="text-2xl font-black text-slate-900 flex items-center gap-3">
                                <div className="p-2 bg-rose-100 text-rose-600 rounded-xl">
                                    <Trash2 className="w-5 h-5" />
                                </div>
                                {t('admin.data.actions.clear_all')}
                            </AlertDialogTitle>
                            <AlertDialogDescription className="text-slate-500 font-semibold text-base py-4">
                                {t('admin.data.actions.clear_all_confirm')}
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter className="gap-2">
                            <AlertDialogCancel className="rounded-2xl font-bold h-12">
                                {t('common.cancel')}
                            </AlertDialogCancel>
                            <AlertDialogAction
                                onClick={handleClearAllParticipants}
                                className="rounded-2xl font-bold h-12 bg-rose-600 hover:bg-rose-700"
                            >
                                {t('common.confirm_delete')}
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>

                {/* Table View */}
                <div className="bg-white border border-slate-200 shadow-xl shadow-slate-200/50 overflow-x-auto ring-1 ring-slate-100 rounded-xl sm:rounded-2xl">
                    <Table className="min-w-[800px]">
                        <TableHeader className="bg-slate-50/80">
                            {table.getHeaderGroups().map((headerGroup) => (
                                <TableRow
                                    key={headerGroup.id}
                                    className="hover:bg-transparent border-slate-100"
                                >
                                    {headerGroup.headers.map((header) => (
                                        <TableHead
                                            key={header.id}
                                            className="h-14 text-xs font-semibold text-slate-600 px-2 sm:px-6 whitespace-nowrap"
                                        >
                                            {header.isPlaceholder
                                                ? null
                                                : flexRender(
                                                      header.column.columnDef.header,
                                                      header.getContext()
                                                  )}
                                        </TableHead>
                                    ))}
                                </TableRow>
                            ))}
                        </TableHeader>
                        <TableBody>
                            {table.getRowModel().rows.length ? (
                                table.getRowModel().rows.map((row) => (
                                    <TableRow
                                        key={row.id}
                                        className={cn(
                                            'cursor-pointer hover:bg-indigo-50/40 transition-all border-slate-50 group border-b last:border-0',
                                            !!row.original.is_discarded &&
                                                'opacity-60 grayscale-[0.5]'
                                        )}
                                        onClick={() => handleViewParticipant(row.original)}
                                    >
                                        {row.getVisibleCells().map((cell) => (
                                            <TableCell
                                                key={cell.id}
                                                className="px-2 sm:px-6 py-4 sm:py-5 whitespace-nowrap"
                                            >
                                                {flexRender(
                                                    cell.column.columnDef.cell,
                                                    cell.getContext()
                                                )}
                                            </TableCell>
                                        ))}
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell
                                        colSpan={columns.length}
                                        className="h-64 text-center"
                                    >
                                        {liveCount === 0 ? (
                                            <div className="flex flex-col items-center justify-center gap-4 text-slate-400">
                                                <div className="p-4 bg-slate-50 rounded-full">
                                                    <Inbox className="w-8 h-8 opacity-30" />
                                                </div>
                                                <div className="space-y-1">
                                                    <p className="font-bold text-slate-600">
                                                        {t(
                                                            'admin.data.empty.no_participants_title',
                                                            'No participants yet'
                                                        )}
                                                    </p>
                                                    <p className="text-sm text-slate-400 max-w-xs mx-auto">
                                                        {t(
                                                            'admin.data.empty.no_participants_desc',
                                                            'Share your study link to start collecting responses.'
                                                        )}
                                                    </p>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="flex flex-col items-center justify-center gap-4 text-slate-400">
                                                <div className="p-4 bg-slate-50 rounded-full">
                                                    <Search className="w-8 h-8 opacity-20" />
                                                </div>
                                                <p className="font-bold">
                                                    {t('admin.data.search.no_results')}
                                                </p>
                                                {hasActiveFilters && (
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={clearAllFilters}
                                                        className="mt-2"
                                                    >
                                                        {t(
                                                            'admin.data.filters.clear_all',
                                                            'Clear filters'
                                                        )}
                                                    </Button>
                                                )}
                                            </div>
                                        )}
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>

                    {/* Pagination */}
                    {table.getPageCount() > 1 && (
                        <div className="flex items-center justify-between px-6 py-3 border-t border-slate-100">
                            <p className="text-xs text-slate-500 font-medium">
                                {t(
                                    'admin.data.pagination.showing',
                                    'Showing {{from}}\u2013{{to}} of {{total}}',
                                    {
                                        from: pagination.pageIndex * pagination.pageSize + 1,
                                        to: Math.min(
                                            (pagination.pageIndex + 1) * pagination.pageSize,
                                            table.getRowCount()
                                        ),
                                        total: table.getRowCount(),
                                    }
                                )}
                            </p>
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => table.previousPage()}
                                    disabled={!table.getCanPreviousPage()}
                                    className="h-8 w-8 p-0 rounded-lg"
                                >
                                    <ChevronLeft className="h-4 w-4" />
                                </Button>
                                <span className="text-xs font-bold text-slate-600 min-w-[4rem] text-center">
                                    {pagination.pageIndex + 1} / {table.getPageCount()}
                                </span>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => table.nextPage()}
                                    disabled={!table.getCanNextPage()}
                                    className="h-8 w-8 p-0 rounded-lg"
                                >
                                    <ChevronRight className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            </CollapsibleSection>

            {/* Section 3: Key statistics */}
            <CollapsibleSection
                title={t('admin.data.sections.key_statistics', 'Key statistics')}
                icon={<BarChart3 className="h-4 w-4 text-slate-400" />}
            >
                {liveParticipants.length > 0 && (
                    <div className="grid gap-4 md:grid-cols-12 mb-4">
                        <div className="col-span-12 md:col-span-8">
                            <SubmissionsTimelineChart
                                participants={liveParticipants}
                                className="border-none shadow-sm bg-white rounded-2xl h-full"
                            />
                        </div>
                        <div className="col-span-12 md:col-span-4">
                            <DeviceBreakdownChart
                                deviceBreakdown={deviceBreakdown}
                                className="border-none shadow-sm bg-white rounded-2xl h-full"
                            />
                        </div>
                    </div>
                )}
                <QuestionDistributionCharts
                    presortConfig={data.study.presort_config}
                    postsortConfig={data.study.postsort_config}
                    filteredParticipants={submittedParticipants}
                    language={i18n.language}
                />
            </CollapsibleSection>
        </div>
    );
}
