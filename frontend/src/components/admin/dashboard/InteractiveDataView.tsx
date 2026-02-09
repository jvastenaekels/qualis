import type { ParticipantRead } from '@/api/model';
import { useState, useMemo, useCallback } from 'react';
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
    MessageSquare,
    Search,
    Mail,
    Bell,
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
    Tag,
    Briefcase,
    Loader2,
    MoreVertical,
    Inbox,
    CheckCircle2,
} from 'lucide-react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
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
import { format, formatDistanceToNow } from 'date-fns';
import { enUS, fr, fi } from 'date-fns/locale';

// Types representing the backend dump response structure
interface DumpStatement {
    id: number;
    code?: string;
    translations: { lang: string; text: string }[];
}

export interface DumpParticipant {
    id: string;
    db_id: number;
    duration_seconds: number | null;
    scores: (number | null)[];
    placements: Record<string, number>;
    // biome-ignore lint/suspicious/noExplicitAny: dynamic structure
    presort: Record<string, any>;
    postsort: {
        email?: string;
        newsletter_consent?: boolean;
        interview_consent?: boolean;
        // biome-ignore lint/suspicious/noExplicitAny: dynamic structure
        questions_answers?: Record<string, any>;
        card_comments?: Record<string, string>;
        // biome-ignore lint/suspicious/noExplicitAny: dynamic structure
    } & Record<string, any>;
    // biome-ignore lint/suspicious/noExplicitAny: dynamic structure
    audio_recordings?: Record<string, any>;
    language: string;
    is_discarded: boolean;
    discard_reason: string | null;
    is_test_run: boolean;
    submitted_at?: string;
    recruitment_token?: string;
    status: string;
    user_agent?: string;
    created_at?: string;
    ip_address?: string;
}

export interface DumpResponse {
    study: {
        slug: string;
        statements: DumpStatement[];
        translations: { lang: string; title: string }[];
        grid_config?: Record<string, number> | { score: number; capacity: number }[];
        // biome-ignore lint/suspicious/noExplicitAny: dynamic config
        presort_config?: Record<string, any>;
        postsort_config?: {
            email_collection_enabled?: boolean;
            newsletter_consent_enabled?: boolean;
            interview_consent_enabled?: boolean;
            // biome-ignore lint/suspicious/noExplicitAny: dynamic config
        } & Record<string, any>;
        state: string;
    };
    participants: DumpParticipant[];
    statement_id_to_index: Record<string, number>;
}

interface InteractiveDataViewProps {
    slug: string;
    participants?: ParticipantRead[];
}

type ConsentType = 'email' | 'newsletter' | 'interview';
type StatusFilter = 'all' | 'completed' | 'in_progress' | 'abandoned';

const SUSPECT_DURATION_THRESHOLD = 120;
const ABANDONED_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24h

function getDisplayStatus(p: DumpParticipant): 'completed' | 'in_progress' | 'abandoned' {
    if (p.status === 'completed') return 'completed';
    if (p.created_at) {
        const age = Date.now() - new Date(p.created_at).getTime();
        if (age > ABANDONED_THRESHOLD_MS) return 'abandoned';
    }
    return 'in_progress';
}
const PAGE_SIZE = 25;

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
    const [qualityFilter, setQualityFilter] = useState<'all' | 'flagged'>('all');
    const [consentFilters, setConsentFilters] = useState<Set<ConsentType>>(new Set());
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
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
            study: { slug, statements: [], translations: [], postsort_config: {}, state: 'draft' },
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
    const emailCount = liveParticipants.filter((p) => p.postsort.email).length;
    const newsletterCount = liveParticipants.filter((p) => p.postsort.newsletter_consent).length;
    const interviewCount = liveParticipants.filter((p) => p.postsort.interview_consent).length;
    const completedCount = liveParticipants.filter(
        (p) => getDisplayStatus(p) === 'completed'
    ).length;
    const inProgressCount = liveParticipants.filter(
        (p) => getDisplayStatus(p) === 'in_progress'
    ).length;
    const abandonedCount = liveParticipants.filter(
        (p) => getDisplayStatus(p) === 'abandoned'
    ).length;

    const hasActiveFilters =
        consentFilters.size > 0 ||
        qualityFilter === 'flagged' ||
        statusFilter !== 'all' ||
        globalFilter !== '';

    const filteredParticipants = useMemo(() => {
        return liveParticipants.filter((p) => {
            const matchesQuality =
                qualityFilter === 'flagged'
                    ? (p.duration_seconds !== null &&
                          p.duration_seconds < SUSPECT_DURATION_THRESHOLD) ||
                      p.is_discarded
                    : true;

            const matchesConsent =
                consentFilters.size === 0 ||
                [...consentFilters].every((f) => {
                    if (f === 'email') return !!p.postsort.email;
                    if (f === 'newsletter') return !!p.postsort.newsletter_consent;
                    if (f === 'interview') return !!p.postsort.interview_consent;
                    return true;
                });

            const matchesStatus = statusFilter === 'all' || getDisplayStatus(p) === statusFilter;

            const matchesSearch =
                !globalFilter ||
                (() => {
                    const q = globalFilter.toLowerCase();
                    return (
                        p.id.toLowerCase().includes(q) ||
                        (p.language || '').toLowerCase().includes(q) ||
                        (p.status || '').toLowerCase().includes(q) ||
                        (p.postsort?.email || '').toLowerCase().includes(q) ||
                        (p.recruitment_token || '').toLowerCase().includes(q)
                    );
                })();

            return matchesQuality && matchesConsent && matchesStatus && matchesSearch;
        });
    }, [liveParticipants, qualityFilter, consentFilters, statusFilter, globalFilter]);

    const handleViewParticipant = useCallback(
        (participant: DumpParticipant) => {
            const baseUrl = workspaceSlug
                ? `/app/${workspaceSlug}/studies/${slug}`
                : `/admin/studies/${slug}`;
            navigate(`${baseUrl}/participants/${participant.db_id || participant.id}`);
        },
        [navigate, slug, workspaceSlug]
    );

    const handleExportEmails = useCallback(() => {
        const emails = liveParticipants
            .filter((p) => p.postsort.email)
            .map((p) => p.postsort.email)
            .join('\n');

        const blob = new Blob([emails], { type: 'text/plain' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${slug}_emails.txt`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        toast.success(t('admin.data.export_emails_success', 'Emails exported successfully'));
    }, [liveParticipants, slug, t]);

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

    const columnHelper = createColumnHelper<DumpParticipant>();

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
                    return (
                        <div className="flex flex-col gap-1.5">
                            <div className="flex items-center gap-2">
                                <span className="font-mono text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
                                    {info.getValue()}
                                </span>
                                {p.is_discarded && (
                                    <Badge
                                        variant="destructive"
                                        className="h-4 text-[10px] px-1.5 font-semibold"
                                    >
                                        {t('admin.data.detail.discarded_badge')}
                                    </Badge>
                                )}
                            </div>
                            {p.recruitment_token && (
                                <span className="text-[10px] text-slate-400 font-medium flex items-center gap-1">
                                    <Tag className="w-3 h-3" />
                                    {p.recruitment_token}
                                </span>
                            )}
                        </div>
                    );
                },
            }),
            columnHelper.accessor('language', {
                header: ({ column }) => (
                    <Button
                        variant="ghost"
                        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
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
            columnHelper.accessor('status', {
                header: ({ column }) => (
                    <Button
                        variant="ghost"
                        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
                        className="h-8 text-xs font-semibold p-0 hover:bg-transparent flex items-center gap-1.5"
                    >
                        <Sparkles className="w-3.5 h-3.5 text-slate-400" />
                        {t('admin.data.table.status', 'Status')}
                        {column.getIsSorted() === 'asc' ? (
                            <ArrowUp className="ml-2 h-3 w-3 text-indigo-500" />
                        ) : column.getIsSorted() === 'desc' ? (
                            <ArrowDown className="ml-2 h-3 w-3 text-indigo-500" />
                        ) : (
                            <ArrowUpDown className="ml-2 h-3 w-3 text-slate-300" />
                        )}
                    </Button>
                ),
                cell: ({ row }) => {
                    const displayStatus = getDisplayStatus(row.original);
                    return (
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
                    );
                },
            }),
            columnHelper.display({
                id: 'consent_indicators',
                header: () => (
                    <div className="flex items-center gap-1.5">
                        <UserCheck className="w-3.5 h-3.5" />
                        <span>{t('admin.data.table.consent', 'Consent')}</span>
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
                                                <Bell className="h-3 w-3" />
                                            </div>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            {t(
                                                'admin.data.tooltips.newsletter_consent',
                                                'Newsletter consent'
                                            )}
                                        </TooltipContent>
                                    </Tooltip>
                                )}
                                {p.postsort.interview_consent && (
                                    <Tooltip>
                                        <TooltipTrigger>
                                            <div className="p-1 bg-amber-50 rounded text-amber-600 border border-amber-100">
                                                <Briefcase className="h-3 w-3" />
                                            </div>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            {t(
                                                'admin.data.tooltips.interview_consent',
                                                'Interview consent'
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
                    <div className="flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-slate-400" />
                        <span>{t('admin.data.table.flags')}</span>
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

                    return (
                        <div className="flex items-center gap-1.5">
                            <TooltipProvider>
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
                                {!isSuspect && !hasComments && !hasAudio && (
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
                    return (
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger>
                                    <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                                        <span>
                                            {formatDistanceToNow(new Date(val), {
                                                addSuffix: true,
                                                locale: currentLocale,
                                            })}
                                        </span>
                                    </div>
                                </TooltipTrigger>
                                <TooltipContent>
                                    {format(new Date(val), 'PPpp', { locale: currentLocale })}
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    );
                },
            }),
        ],
        [columnHelper, t, currentLocale]
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
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                    {[1, 2, 3, 4, 5].map((i) => (
                        <Skeleton key={i} className="h-32 w-full rounded-2xl" />
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
            {/* Interactive Summary Grid */}
            {liveCount > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-12 gap-4">
                    {/* Primary Metrics: Completed & In Progress */}

                    {/* Completed Card */}
                    <button
                        type="button"
                        onClick={() =>
                            setStatusFilter((prev) => (prev === 'completed' ? 'all' : 'completed'))
                        }
                        className={cn(
                            'col-span-1 md:col-span-6 lg:col-span-3',
                            'group relative overflow-hidden bg-white p-5 rounded-2xl border-2 shadow-sm hover:shadow-md transition-all text-left flex flex-col justify-between min-h-[140px]',
                            statusFilter === 'completed'
                                ? 'border-emerald-500 ring-4 ring-emerald-50/50'
                                : 'border-slate-100 hover:border-emerald-200'
                        )}
                    >
                        <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
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
                                <span className="text-4xl font-black text-slate-900 tracking-tight">
                                    {completedCount}
                                </span>
                                <span className="text-sm font-semibold text-slate-400">
                                    / {liveCount}
                                </span>
                            </div>
                        </div>

                        {completedCount > 0 && (
                            <div className="mt-4 flex items-center text-[11px] font-semibold text-emerald-600 gap-1 opacity-0 group-hover:opacity-100 transition-opacity translate-y-1 group-hover:translate-y-0 duration-300">
                                {t('admin.data.stats.click_to_filter', 'Filter table')}
                                <ArrowRight className="w-3 h-3" />
                            </div>
                        )}
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
                            'col-span-1 md:col-span-6 lg:col-span-3',
                            'group relative overflow-hidden bg-white p-5 rounded-2xl border-2 shadow-sm hover:shadow-md transition-all text-left flex flex-col justify-between min-h-[140px]',
                            statusFilter === 'in_progress'
                                ? 'border-sky-500 ring-4 ring-sky-50/50'
                                : 'border-slate-100 hover:border-sky-200'
                        )}
                    >
                        <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
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
                                <span className="text-4xl font-black text-slate-900 tracking-tight">
                                    {inProgressCount}
                                </span>
                                <span className="text-sm font-semibold text-slate-400">
                                    / {liveCount}
                                </span>
                            </div>
                        </div>

                        <div className="mt-4 h-5 flex items-center">
                            {abandonedCount > 0 ? (
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setStatusFilter((prev) =>
                                            prev === 'abandoned' ? 'all' : 'abandoned'
                                        );
                                    }}
                                    className="z-10 cursor-pointer flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-rose-50 hover:bg-rose-100 border border-rose-100 transition-colors"
                                >
                                    <AlertTriangle className="w-3 h-3 text-rose-500" />
                                    <span className="text-[10px] font-bold text-rose-600">
                                        {t(
                                            'admin.data.stats.abandoned_count',
                                            '{{count}} abandoned',
                                            {
                                                count: abandonedCount,
                                            }
                                        )}
                                    </span>
                                </button>
                            ) : (
                                <div className="flex items-center text-[11px] font-semibold text-sky-600 gap-1 opacity-0 group-hover:opacity-100 transition-opacity translate-y-1 group-hover:translate-y-0 duration-300">
                                    {t('admin.data.stats.click_to_filter', 'Filter table')}
                                    <ArrowRight className="w-3 h-3" />
                                </div>
                            )}
                        </div>
                    </button>

                    {/* Secondary Metrics: Consent & Quality */}

                    {/* Email Collection Card */}
                    <button
                        type="button"
                        onClick={() => toggleConsent('email')}
                        className={cn(
                            'col-span-2 md:col-span-4 lg:col-span-2',
                            'group bg-white p-4 rounded-xl border-2 shadow-sm hover:shadow-md transition-all text-left flex flex-col justify-between',
                            consentFilters.has('email')
                                ? 'border-indigo-400 ring-4 ring-indigo-50/50'
                                : 'border-slate-100 hover:border-indigo-100'
                        )}
                    >
                        <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center gap-2">
                                <div
                                    className={cn(
                                        'p-1.5 rounded-md transition-colors',
                                        consentFilters.has('email')
                                            ? 'bg-indigo-100 text-indigo-700'
                                            : 'bg-indigo-50 text-indigo-600'
                                    )}
                                >
                                    <Mail className="w-4 h-4" />
                                </div>
                                <span className="text-[10px] font-bold text-slate-500 uppercase">
                                    {t('admin.data.stats.email_short', 'Emails')}
                                </span>
                            </div>
                        </div>

                        <div className="flex items-end justify-between">
                            <div className="flex items-baseline gap-1.5">
                                <span className="text-2xl font-black text-slate-900">
                                    {emailCount}
                                </span>
                                <span className="text-xs font-semibold text-slate-400">
                                    / {liveCount}
                                </span>
                            </div>

                            {emailCount > 0 && (
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleExportEmails();
                                    }}
                                    className="p-1.5 hover:bg-slate-100 rounded text-slate-400 hover:text-indigo-600 transition-colors"
                                    title={t('admin.data.actions.export', 'Export')}
                                >
                                    <Download className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </div>
                    </button>

                    {/* Newsletter Consent Card */}
                    <button
                        type="button"
                        onClick={() => toggleConsent('newsletter')}
                        className={cn(
                            'col-span-2 md:col-span-4 lg:col-span-2',
                            'group bg-white p-4 rounded-xl border-2 shadow-sm hover:shadow-md transition-all text-left flex flex-col justify-between',
                            consentFilters.has('newsletter')
                                ? 'border-emerald-400 ring-4 ring-emerald-50/50'
                                : 'border-slate-100 hover:border-emerald-100'
                        )}
                    >
                        <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center gap-2">
                                <div
                                    className={cn(
                                        'p-1.5 rounded-md transition-colors',
                                        consentFilters.has('newsletter')
                                            ? 'bg-emerald-100 text-emerald-700'
                                            : 'bg-emerald-50 text-emerald-600'
                                    )}
                                >
                                    <Bell className="w-4 h-4" />
                                </div>
                                <span className="text-[10px] font-bold text-slate-500 uppercase">
                                    {t('admin.data.stats.newsletter_short', 'News.')}
                                </span>
                            </div>
                        </div>

                        <div className="flex items-baseline gap-1.5">
                            <span className="text-2xl font-black text-slate-900">
                                {newsletterCount}
                            </span>
                            <span className="text-xs font-semibold text-slate-400">
                                / {liveCount}
                            </span>
                        </div>
                    </button>

                    {/* Interview Consent Card */}
                    <button
                        type="button"
                        onClick={() => toggleConsent('interview')}
                        className={cn(
                            'col-span-2 md:col-span-4 lg:col-span-2',
                            'group bg-white p-4 rounded-xl border-2 shadow-sm hover:shadow-md transition-all text-left flex flex-col justify-between',
                            consentFilters.has('interview')
                                ? 'border-amber-400 ring-4 ring-amber-50/50'
                                : 'border-slate-100 hover:border-amber-100'
                        )}
                    >
                        <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center gap-2">
                                <div
                                    className={cn(
                                        'p-1.5 rounded-md transition-colors',
                                        consentFilters.has('interview')
                                            ? 'bg-amber-100 text-amber-700'
                                            : 'bg-amber-50 text-amber-600'
                                    )}
                                >
                                    <Briefcase className="w-4 h-4" />
                                </div>
                                <span className="text-[10px] font-bold text-slate-500 uppercase">
                                    {t('admin.data.stats.interview_short', 'Interviews')}
                                </span>
                            </div>
                        </div>

                        <div className="flex items-baseline gap-1.5">
                            <span className="text-2xl font-black text-slate-900">
                                {interviewCount}
                            </span>
                            <span className="text-xs font-semibold text-slate-400">
                                / {liveCount}
                            </span>
                        </div>
                    </button>
                </div>
            )}

            {/* Active Filters */}
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
                            {t('admin.data.filters.has_email', 'Has email')}
                            <button
                                type="button"
                                onClick={() => toggleConsent('email')}
                                className="hover:bg-indigo-200 rounded-full p-0.5 transition-colors"
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
                            <Bell className="w-3 h-3" />
                            {t('admin.data.filters.newsletter', 'Newsletter consent')}
                            <button
                                type="button"
                                onClick={() => toggleConsent('newsletter')}
                                className="hover:bg-emerald-200 rounded-full p-0.5 transition-colors"
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
                            <Briefcase className="w-3 h-3" />
                            {t('admin.data.filters.interview', 'Interview consent')}
                            <button
                                type="button"
                                onClick={() => toggleConsent('interview')}
                                className="hover:bg-amber-200 rounded-full p-0.5 transition-colors"
                            >
                                <X className="w-3 h-3" />
                            </button>
                        </Badge>
                    )}
                    {qualityFilter === 'flagged' && (
                        <Badge
                            variant="secondary"
                            className="h-7 px-3 gap-2 bg-amber-100 text-amber-700 border-amber-200 font-semibold"
                        >
                            <AlertTriangle className="w-3 h-3" />
                            {t('admin.data.filters.flagged', 'Flagged only')}
                            <button
                                type="button"
                                onClick={() => setQualityFilter('all')}
                                className="hover:bg-amber-200 rounded-full p-0.5 transition-colors"
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
                                className={cn(
                                    'rounded-full p-0.5 transition-colors',
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
                                className="hover:bg-slate-200 rounded-full p-0.5 transition-colors"
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

            <div className="flex flex-col lg:flex-row items-center justify-between gap-4 w-full bg-white p-2 rounded-2xl border border-slate-200 shadow-sm">
                {/* Left Group: Search & Total */}
                <div className="flex items-center gap-3 w-full lg:w-auto flex-1 lg:max-w-2xl px-2">
                    <div className="relative group w-full">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-indigo-500 transition-colors pointer-events-none" />
                        <Input
                            placeholder={t(
                                'admin.data.search.placeholder',
                                'Search participants by ID, email...'
                            )}
                            value={globalFilter ?? ''}
                            onChange={(e) => setGlobalFilter(e.target.value)}
                            className="pl-10 h-10 bg-slate-50 border-slate-200 focus-visible:ring-indigo-500 rounded-lg shadow-none focus:bg-white transition-all font-medium text-sm w-full"
                        />
                    </div>

                    <div className="hidden sm:flex items-center gap-2 h-8 px-3 rounded-lg bg-slate-100 border border-slate-200 text-slate-600 whitespace-nowrap">
                        <Users className="w-3.5 h-3.5 text-slate-500" />
                        <span className="text-xs font-bold">{liveCount}</span>
                    </div>
                </div>

                {/* Right Group: Filters & Actions */}
                <div className="flex items-center gap-2 w-full lg:w-auto justify-end px-2">
                    {/* Flagged Filter Toggle */}
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                            setQualityFilter((prev) => (prev === 'all' ? 'flagged' : 'all'))
                        }
                        className={cn(
                            'h-9 border border-transparent font-medium text-xs',
                            qualityFilter === 'flagged'
                                ? 'bg-amber-50 text-amber-700 border-amber-200'
                                : 'text-slate-600 hover:bg-slate-100'
                        )}
                        title={t('admin.data.filter.only_flagged')}
                    >
                        <AlertTriangle className="h-3.5 w-3.5 mr-2" />
                        {t('admin.data.filters.flagged', 'Flagged')}
                    </Button>

                    {/* Status Filter Dropdown */}
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button
                                variant="ghost"
                                size="sm"
                                className={cn(
                                    'h-9 border border-transparent font-medium text-xs text-slate-600 hover:bg-slate-100 gap-2',
                                    statusFilter !== 'all' &&
                                        'bg-indigo-50 text-indigo-700 border-indigo-100'
                                )}
                            >
                                <Sparkles className="h-3.5 w-3.5" />
                                {statusFilter === 'all'
                                    ? t('admin.data.table.status', 'Status')
                                    : t(`admin.data.status.${statusFilter}`, statusFilter)}
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem onClick={() => setStatusFilter('all')}>
                                {t('admin.data.filters.all_statuses', 'All Statuses')}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                onClick={() => setStatusFilter('completed')}
                                className="text-emerald-600"
                            >
                                <CheckCircle2 className="w-3.5 h-3.5 mr-2" />
                                {t('admin.data.status.completed', 'Completed')}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                onClick={() => setStatusFilter('in_progress')}
                                className="text-sky-600"
                            >
                                <Clock className="w-3.5 h-3.5 mr-2" />
                                {t('admin.data.status.in_progress', 'In Progress')}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                onClick={() => setStatusFilter('abandoned')}
                                className="text-rose-600"
                            >
                                <AlertTriangle className="w-3.5 h-3.5 mr-2" />
                                {t('admin.data.status.abandoned', 'Abandoned')}
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>

                    <div className="h-6 w-px bg-slate-200 mx-2 hidden sm:block" />

                    {/* Export Dropdown */}
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button
                                className="h-9 bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-sm gap-2 text-xs"
                                disabled={isExportLoading}
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
                        <DropdownMenuContent align="end" className="w-56 rounded-xl">
                            <DropdownMenuItem
                                disabled={isExportLoading}
                                onClick={() =>
                                    runExport(async () => {
                                        const blob = await AdminService.exportResearchPackage(slug);
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
                                        const blob = new Blob([JSON.stringify(rawData, null, 2)], {
                                            type: 'application/json',
                                        });
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
                            <DropdownMenuContent align="end" className="w-52 rounded-xl">
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

            <div className="bg-white rounded-2xl border border-slate-200 shadow-xl shadow-slate-200/50 overflow-hidden ring-1 ring-slate-100">
                <Table>
                    <TableHeader className="bg-slate-50/80">
                        {table.getHeaderGroups().map((headerGroup) => (
                            <TableRow
                                key={headerGroup.id}
                                className="hover:bg-transparent border-slate-100"
                            >
                                {headerGroup.headers.map((header) => (
                                    <TableHead
                                        key={header.id}
                                        className="h-14 text-xs font-semibold text-slate-600 px-6"
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
                                        !!row.original.is_discarded && 'opacity-60 grayscale-[0.5]'
                                    )}
                                    onClick={() => handleViewParticipant(row.original)}
                                >
                                    {row.getVisibleCells().map((cell) => (
                                        <TableCell key={cell.id} className="px-6 py-5">
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
                                <TableCell colSpan={columns.length} className="h-64 text-center">
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
        </div>
    );
}
