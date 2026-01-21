import type { ParticipantRead } from '@/api/model';
import { useState, useMemo, useCallback } from 'react';
import {
    useReactTable,
    getCoreRowModel,
    getSortedRowModel,
    getFilteredRowModel,
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
    Clock,
    Globe,
    ChevronRight,
    AlertTriangle,
    MessageSquare,
    Search,
    Mail,
    Bell,
    Users,
    Trash2,
    Beaker,
    Filter,
    Calendar,
    MousePointer2,
} from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import {
    useGetStudyDumpApiAdminStudiesSlugDumpGet,
    useClearTestRunsApiAdminStudiesSlugTestRunsDelete,
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
    AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { format } from 'date-fns';

// Types representing the backend dump response structure
export interface DumpStatement {
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
    } & Record<string, any>;
    language: string;
    is_discarded: boolean;
    discard_reason: string | null;
    is_test_run: boolean;
    submitted_at?: string;
    recruitment_token?: string;
    status: string;
}

export interface DumpResponse {
    study: {
        slug: string;
        statements: DumpStatement[];
        translations: { lang: string; title: string }[];
        grid_config?: Record<string, number> | { score: number; capacity: number }[];
        postsort_config?: {
            email_collection_enabled?: boolean;
            newsletter_consent_enabled?: boolean;
            interview_consent_enabled?: boolean;
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

export default function InteractiveDataView({
    slug,
    participants: initialParticipants,
}: InteractiveDataViewProps) {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { workspaceSlug } = useParams<{ workspaceSlug: string }>();
    const queryClient = useQueryClient();

    const { data: rawData, isLoading, error } = useGetStudyDumpApiAdminStudiesSlugDumpGet(slug);

    const [sorting, setSorting] = useState<SortingState>([{ id: 'submitted_at', desc: true }]);
    const [globalFilter, setGlobalFilter] = useState('');
    const [activeTab, setActiveTab] = useState<'live' | 'test'>('live');
    const [qualityFilter, setQualityFilter] = useState<'all' | 'flagged'>('all');

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

    const { mutate: clearTestRuns, isPending: isClearing } =
        useClearTestRunsApiAdminStudiesSlugTestRunsDelete();
    const handleClearTestRuns = useCallback(() => {
        clearTestRuns(
            { slug },
            {
                onSuccess: () => {
                    toast.success(t('admin.data.actions.clear_test_runs_success'));
                    queryClient.invalidateQueries({
                        queryKey: getGetStudyDumpApiAdminStudiesSlugDumpGetQueryKey(slug),
                    });
                },
                onError: () => toast.error(t('admin.data.actions.clear_test_runs_error')),
            }
        );
    }, [clearTestRuns, slug, queryClient, t]);

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

    const filteredParticipants = useMemo(() => {
        return effectiveParticipants.filter((p) => {
            const matchesTab = activeTab === 'test' ? p.is_test_run : !p.is_test_run;
            const matchesQuality =
                qualityFilter === 'flagged'
                    ? (p.duration_seconds !== null && p.duration_seconds < 120) || p.is_discarded
                    : true;
            return matchesTab && matchesQuality;
        });
    }, [effectiveParticipants, activeTab, qualityFilter]);

    const handleViewParticipant = useCallback(
        (participant: DumpParticipant) => {
            const baseUrl = workspaceSlug
                ? `/app/${workspaceSlug}/studies/${slug}`
                : `/admin/studies/${slug}`;
            navigate(`${baseUrl}/participants/${participant.db_id || participant.id}`);
        },
        [navigate, slug, workspaceSlug]
    );

    const columnHelper = createColumnHelper<DumpParticipant>();

    const columns = useMemo(
        () => [
            columnHelper.accessor('id', {
                header: t('admin.data.table.participant'),
                cell: (info) => {
                    const p = info.row.original;
                    return (
                        <div className="flex flex-col gap-1">
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
                                    <Users className="w-3 h-3" />
                                    {p.recruitment_token}
                                </span>
                            )}
                        </div>
                    );
                },
            }),
            columnHelper.accessor('language', {
                header: t('admin.data.table.lang'),
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
                header: t('admin.data.table.status', 'Status'),
                cell: (info) => {
                    const status = info.getValue() as string;
                    return (
                        <Badge
                            variant="outline"
                            className={cn(
                                'h-5 text-[10px] px-2 font-semibold border-none',
                                status === 'completed'
                                    ? 'bg-emerald-50 text-emerald-600'
                                    : 'bg-slate-50 text-slate-400'
                            )}
                        >
                            {t(`admin.data.status.${status}`, status)}
                        </Badge>
                    );
                },
            }),
            columnHelper.display({
                id: 'quality',
                header: t('admin.data.table.flags'),
                cell: ({ row }) => {
                    const p = row.original;
                    const isSuspect = p.duration_seconds !== null && p.duration_seconds < 120;
                    const hasComments = Object.keys(p.postsort.card_comments || {}).length > 0;

                    return (
                        <div className="flex items-center gap-2">
                            <TooltipProvider>
                                {isSuspect && (
                                    <Tooltip>
                                        <TooltipTrigger>
                                            <div className="p-1.5 bg-amber-50 rounded-lg text-amber-500 border border-amber-100 shadow-sm transition-transform hover:scale-110">
                                                <AlertTriangle className="h-3.5 w-3.5" />
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
                                            <div className="p-1.5 bg-indigo-50 rounded-lg text-indigo-500 border border-indigo-100 shadow-sm transition-transform hover:scale-110">
                                                <MessageSquare className="h-3.5 w-3.5" />
                                            </div>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            {t('admin.data.tooltips.has_comments')}
                                        </TooltipContent>
                                    </Tooltip>
                                )}
                                {!isSuspect && !hasComments && (
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
                        className="h-8 text-xs font-bold p-0 hover:bg-transparent"
                    >
                        {t('admin.data.table.duration')}
                        <ArrowUpDown className="ml-2 h-3 w-3" />
                    </Button>
                ),
                cell: (info) => {
                    const seconds = info.getValue();
                    if (seconds === null) return <span className="text-slate-300">—</span>;
                    const mins = Math.floor(Math.abs(seconds) / 60);
                    const secs = Math.round(Math.abs(seconds) % 60);
                    return (
                        <div className="flex items-center gap-1.5 font-mono text-xs text-slate-600">
                            <Clock className="w-3 h-3 text-slate-400" />
                            {mins}m {secs.toString().padStart(2, '0')}s
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
                        className="h-8 text-xs font-bold p-0 hover:bg-transparent"
                    >
                        {t('admin.data.table.submitted')}
                        <ArrowUpDown className="ml-2 h-3 w-3" />
                    </Button>
                ),
                cell: (info) => {
                    const val = info.getValue();
                    if (!val) return <span className="text-slate-300">—</span>;
                    return (
                        <div className="flex flex-col text-[10px] text-slate-500 font-medium leading-none gap-1">
                            <div className="flex items-center gap-1 text-slate-700">
                                <Calendar className="w-3 h-3 text-slate-300" />
                                {format(new Date(val), 'MMM dd, yyyy')}
                            </div>
                            <span className="pl-4 opacity-70">
                                {format(new Date(val), 'HH:mm')}
                            </span>
                        </div>
                    );
                },
            }),
            columnHelper.display({
                id: 'actions',
                cell: ({ row }) => (
                    <div className="flex justify-end">
                        <Button
                            variant="default"
                            size="sm"
                            onClick={(e) => {
                                e.stopPropagation();
                                handleViewParticipant(row.original);
                            }}
                            className="h-8 px-3 rounded-lg font-bold shadow-sm transition-all hover:translate-x-0.5"
                        >
                            {t('admin.data.table.actions')}
                            <ChevronRight className="h-4 w-4 ml-1" />
                        </Button>
                    </div>
                ),
            }),
        ],
        [columnHelper, t, handleViewParticipant]
    );

    const table = useReactTable({
        data: filteredParticipants,
        columns,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        onSortingChange: setSorting,
        onGlobalFilterChange: setGlobalFilter,
        state: { sorting, globalFilter },
    });

    if (isLoading && !data) {
        return (
            <div className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {[1, 2, 3].map((i) => (
                        <Skeleton key={i} className="h-24 w-full rounded-2xl" />
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

    const liveCount = effectiveParticipants.filter((p) => !p.is_test_run).length;
    const testCount = effectiveParticipants.filter((p) => p.is_test_run).length;

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Summary Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="group bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:border-indigo-200 hover:shadow-md transition-all">
                    <div className="flex items-center justify-between mb-4">
                        <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                            <Mail className="w-5 h-5" />
                        </div>
                    </div>
                    <p className="text-xs font-semibold text-slate-500 mb-1">
                        {t('admin.data.stats.email_collection')}
                    </p>
                    <div className="flex items-baseline gap-2">
                        <span className="text-3xl font-black text-slate-900 leading-none">
                            {data.participants.filter((p) => p.postsort.email).length}
                        </span>
                        <span className="text-sm text-slate-400 font-bold">
                            / {liveCount} {t('admin.data.stats.participants')}
                        </span>
                    </div>
                </div>

                <div className="group bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:border-emerald-200 hover:shadow-md transition-all">
                    <div className="flex items-center justify-between mb-4">
                        <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                            <Bell className="w-5 h-5" />
                        </div>
                    </div>
                    <p className="text-xs font-semibold text-slate-500 mb-1">
                        {t('admin.data.stats.newsletter')}
                    </p>
                    <div className="flex items-baseline gap-2">
                        <span className="text-3xl font-black text-slate-900 leading-none">
                            {data.participants.filter((p) => p.postsort.newsletter_consent).length}
                        </span>
                    </div>
                </div>

                <div className="group bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:border-amber-200 hover:shadow-md transition-all">
                    <div className="flex items-center justify-between mb-4">
                        <div className="p-2.5 bg-amber-50 text-amber-600 rounded-xl group-hover:bg-amber-600 group-hover:text-white transition-colors">
                            <Users className="w-5 h-5" />
                        </div>
                    </div>
                    <p className="text-xs font-semibold text-slate-500 mb-1">
                        {t('admin.data.stats.follow_up')}
                    </p>
                    <div className="flex items-baseline gap-2">
                        <span className="text-3xl font-black text-slate-900 leading-none">
                            {data.participants.filter((p) => p.postsort.interview_consent).length}
                        </span>
                    </div>
                </div>
            </div>

            <Tabs
                value={activeTab}
                onValueChange={(v) => setActiveTab(v as 'live' | 'test')}
                className="w-full"
            >
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
                    <TabsList className="bg-slate-100/80 p-1 rounded-xl h-11 border border-slate-200/50">
                        <TabsTrigger
                            value="live"
                            className="rounded-lg px-4 font-bold data-[state=active]:bg-white data-[state=active]:shadow-sm"
                        >
                            <div className="flex items-center gap-2">
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                {t('admin.data.tabs.live')}
                                <Badge
                                    variant="secondary"
                                    className="ml-1.5 h-5 px-1.5 bg-slate-200/50 text-slate-600 border-none font-bold"
                                >
                                    {liveCount}
                                </Badge>
                            </div>
                        </TabsTrigger>
                        <TabsTrigger
                            value="test"
                            className="rounded-lg px-4 font-bold data-[state=active]:bg-white data-[state=active]:shadow-sm"
                        >
                            <div className="flex items-center gap-2">
                                <Beaker className="w-3.5 h-3.5" />
                                {t('admin.data.tabs.test')}
                                <span className="ml-1.5 text-slate-400 font-bold">{testCount}</span>
                            </div>
                        </TabsTrigger>
                    </TabsList>

                    <div className="flex items-center gap-3 w-full sm:w-auto">
                        <div className="relative group flex-1 sm:flex-initial">
                            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-indigo-500 transition-colors pointer-events-none" />
                            <Input
                                placeholder={t('admin.data.search.placeholder')}
                                value={globalFilter ?? ''}
                                onChange={(e) => setGlobalFilter(e.target.value)}
                                className="pl-10 h-11 bg-white border-slate-200 focus-visible:ring-indigo-500 rounded-xl shadow-sm font-medium text-sm sm:w-80 group-hover:border-slate-300 transition-all"
                            />
                        </div>

                        <Button
                            variant="outline"
                            size="icon"
                            onClick={() =>
                                setQualityFilter((prev) => (prev === 'all' ? 'flagged' : 'all'))
                            }
                            className={cn(
                                'h-11 w-11 rounded-xl transition-all border-slate-200',
                                qualityFilter === 'flagged'
                                    ? 'bg-amber-50 border-amber-200 text-amber-600 shadow-inner'
                                    : 'bg-white hover:bg-slate-50'
                            )}
                            title={t('admin.data.filter.only_flagged')}
                        >
                            <Filter className="h-4 w-4" />
                        </Button>

                        {activeTab === 'test' && testCount > 0 && (
                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button
                                        variant="outline"
                                        className="h-11 rounded-xl border-red-100 bg-red-50 text-red-600 hover:bg-red-100 hover:border-red-200 font-bold gap-2 shadow-sm"
                                        disabled={isClearing}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                        <span className="hidden sm:inline">
                                            {t('admin.data.actions.clear_test_runs')}
                                        </span>
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent className="rounded-3xl border-none shadow-2xl">
                                    <AlertDialogHeader>
                                        <AlertDialogTitle className="text-2xl font-black text-slate-900 flex items-center gap-3">
                                            <div className="p-2 bg-red-100 text-red-600 rounded-xl">
                                                <Trash2 className="w-5 h-5" />
                                            </div>
                                            {t('admin.data.actions.clear_test_runs')}
                                        </AlertDialogTitle>
                                        <AlertDialogDescription className="text-slate-500 font-semibold text-base py-4">
                                            {t('admin.data.actions.clear_test_runs_confirm')}
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter className="gap-2">
                                        <AlertDialogCancel className="rounded-2xl font-bold h-12">
                                            {t('common.cancel')}
                                        </AlertDialogCancel>
                                        <AlertDialogAction
                                            onClick={handleClearTestRuns}
                                            className="rounded-2xl font-bold h-12 bg-red-600 hover:bg-red-700"
                                        >
                                            {t('common.confirm_delete')}
                                        </AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        )}

                        {activeTab === 'live' && liveCount > 0 && data.study.state === 'draft' && (
                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button
                                        variant="outline"
                                        className="h-11 rounded-xl border-rose-100 bg-rose-50 text-rose-600 hover:bg-rose-100 hover:border-rose-200 font-bold gap-2 shadow-sm"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                        <span className="hidden sm:inline">
                                            {t(
                                                'admin.data.actions.clear_all_data',
                                                'Clear All Data'
                                            )}
                                        </span>
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent className="rounded-3xl border-none shadow-2xl">
                                    <AlertDialogHeader>
                                        <AlertDialogTitle className="text-2xl font-black text-slate-900 flex items-center gap-3">
                                            <div className="p-2 bg-rose-100 text-rose-600 rounded-xl">
                                                <Trash2 className="w-5 h-5" />
                                            </div>
                                            {t(
                                                'admin.data.actions.clear_all_data',
                                                'Clear All Data'
                                            )}
                                        </AlertDialogTitle>
                                        <AlertDialogDescription className="text-slate-500 font-semibold text-base py-4">
                                            {t(
                                                'admin.data.actions.clear_all_confirm',
                                                'Are you sure you want to delete ALL responses for this study? This will unlock the study structure and allow you to modify the grid or statement codes again. This action cannot be undone.'
                                            )}
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
                        )}
                    </div>
                </div>

                <div className="bg-white rounded-[2rem] border border-slate-200 shadow-xl shadow-slate-200/50 overflow-hidden ring-1 ring-slate-100">
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
                                            !!row.original.is_discarded &&
                                                'opacity-60 grayscale-[0.5]'
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
                                    <TableCell
                                        colSpan={columns.length}
                                        className="h-64 text-center"
                                    >
                                        <div className="flex flex-col items-center justify-center gap-4 text-slate-400">
                                            <div className="p-4 bg-slate-50 rounded-full">
                                                <MousePointer2 className="w-8 h-8 opacity-20" />
                                            </div>
                                            <p className="font-bold">
                                                {t('admin.data.search.no_results')}
                                            </p>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
            </Tabs>
        </div>
    );
}
