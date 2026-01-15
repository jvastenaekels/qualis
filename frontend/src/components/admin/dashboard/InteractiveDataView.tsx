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
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useGetStudyDumpApiAdminStudiesSlugDumpGet } from '@/api/generated';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

// Types representing the backend dump response structure
export interface DumpStatement {
    id: number;
    code?: string;
    translations: { lang: string; text: string }[];
}

export interface DumpParticipant {
    id: string;
    duration_seconds: number | null;
    scores: (number | null)[]; // Array index matches study.statements index
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
    language: string;
    is_discarded: boolean;
    discard_reason: string | null;
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
            // biome-ignore lint/suspicious/noExplicitAny: dynamic structure
        } & Record<string, any>;
    };
    participants: DumpParticipant[];
    statement_id_to_index: Record<string, number>;
}

interface InteractiveDataViewProps {
    slug: string;
    participants?: ParticipantRead[]; // Optional: can be provided from loader
}

export default function InteractiveDataView({ slug }: InteractiveDataViewProps) {
    const { t } = useTranslation();
    // Determine type usage for useGetStudyDumpApiAdminStudiesSlugDumpGet
    // Casting broadly as we validated the structure manually
    const { data: rawData, isLoading, error } = useGetStudyDumpApiAdminStudiesSlugDumpGet(slug);
    const data = rawData as unknown as DumpResponse;

    const [sorting, setSorting] = useState<SortingState>([]);
    const [globalFilter, setGlobalFilter] = useState('');

    const navigate = useNavigate();

    const handleViewParticipant = useCallback(
        (participant: DumpParticipant) => {
            navigate(`/admin/studies/${slug}/participants/${participant.id}`);
        },
        [navigate, slug]
    );

    // --- Table Configuration ---
    const columnHelper = createColumnHelper<DumpParticipant>();

    const columns = useMemo(
        () => [
            columnHelper.accessor('id', {
                header: ({ column }) => {
                    return (
                        <Button
                            variant="ghost"
                            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
                            className="-ml-4 hover:bg-transparent hover:text-indigo-600"
                        >
                            {t('admin.data.table.id_token')}
                            <ArrowUpDown className="ml-2 h-4 w-4" />
                        </Button>
                    );
                },
                cell: (info) => (
                    <div className="font-mono text-xs font-semibold text-slate-700 bg-slate-100 px-2 py-1 rounded w-fit">
                        {info.getValue()}
                    </div>
                ),
            }),
            columnHelper.accessor('language', {
                header: t('admin.data.table.lang'),
                cell: (info) => (
                    <div className="flex items-center gap-2">
                        <Globe className="h-3 w-3 text-slate-400" />
                        <span className="uppercase text-xs font-bold text-slate-600">
                            {info.getValue() === 'US' ? 'EN' : info.getValue()}
                        </span>
                    </div>
                ),
                meta: { className: 'hidden md:table-cell' },
            }),
            columnHelper.display({
                id: 'flags',
                header: t('admin.data.table.flags'),
                cell: ({ row }) => {
                    const p = row.original;
                    const isSuspect = p.duration_seconds !== null && p.duration_seconds < 120;
                    const hasComments = Object.keys(p.postsort).length > 0;

                    return (
                        <div className="flex items-center gap-1.5">
                            {isSuspect && (
                                <div
                                    title={t('admin.data.tooltips.suspect')}
                                    className="text-amber-500"
                                >
                                    <AlertTriangle className="h-3.5 w-3.5" />
                                </div>
                            )}
                            {hasComments && (
                                <div
                                    title={t('admin.data.tooltips.has_comments')}
                                    className="text-indigo-500"
                                >
                                    <MessageSquare className="h-3.5 w-3.5" />
                                </div>
                            )}
                        </div>
                    );
                },
                meta: { className: 'hidden md:table-cell' },
            }),
            columnHelper.accessor('duration_seconds', {
                header: ({ column }) => (
                    <div className="flex justify-end">
                        <Button
                            variant="ghost"
                            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
                            className="hover:bg-transparent hover:text-indigo-600 pr-0"
                        >
                            {t('admin.data.table.duration')}
                            <Clock className="ml-2 h-3 w-3" />
                        </Button>
                    </div>
                ),
                cell: (info) => {
                    const seconds = info.getValue();
                    if (seconds === null) return <span className="text-slate-300">-</span>;
                    const absoluteSeconds = Math.abs(seconds);
                    const mins = Math.floor(absoluteSeconds / 60);
                    const secs = Math.round(absoluteSeconds % 60);
                    return (
                        <div className="text-right font-mono text-xs text-slate-600">
                            {seconds < 0 ? '-' : ''}
                            {mins}m {secs.toString().padStart(2, '0')}s
                        </div>
                    );
                },
                meta: { className: 'hidden md:table-cell' },
            }),
            columnHelper.display({
                id: 'actions',
                cell: ({ row }) => (
                    <div className="flex justify-end">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                                e.stopPropagation();
                                handleViewParticipant(row.original);
                            }}
                            className="h-8 w-8 p-0 rounded-full hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
                        >
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>
                ),
            }),
        ],
        [columnHelper, t, handleViewParticipant]
    );

    const table = useReactTable({
        data: data?.participants || [],
        columns,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        onSortingChange: setSorting,
        onGlobalFilterChange: setGlobalFilter,
        state: {
            sorting,
            globalFilter,
        },
    });

    if (isLoading) {
        return (
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <Skeleton className="h-9 w-64" />
                    <Skeleton className="h-9 w-24" />
                </div>
                <div className="rounded-md border border-slate-100">
                    <div className="p-4 space-y-4">
                        {Array.from({ length: 5 }).map((_, i) => (
                            <div key={i} className="flex gap-4">
                                <Skeleton className="h-10 w-full" />
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    if (error || !data) {
        return (
            <div className="rounded-xl border border-red-100 bg-red-50 p-6 text-center text-sm text-red-600">
                {t('admin.data.errors.load_failed')}
            </div>
        );
    }

    return (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Toolbar */}
            <div className="flex flex-col gap-6">
                {data.study.postsort_config?.email_collection_enabled && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="bg-gradient-to-br from-indigo-50 to-white border border-indigo-100 p-4 rounded-xl shadow-sm">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg">
                                    <Mail className="w-4 h-4" />
                                </div>
                                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                                    {t('admin.data.stats.email_collection', 'Email Collection')}
                                </span>
                            </div>
                            <div className="flex items-baseline gap-2">
                                <span className="text-2xl font-black text-indigo-900">
                                    {data.participants.filter((p) => p.postsort.email).length}
                                </span>
                                <span className="text-xs text-slate-400 font-medium">
                                    / {data.participants.length}{' '}
                                    {t('admin.data.stats.participants', 'participants')}
                                </span>
                            </div>
                        </div>

                        {data.study.postsort_config?.newsletter_consent_enabled !== false && (
                            <div className="bg-gradient-to-br from-emerald-50 to-white border border-emerald-100 p-4 rounded-xl shadow-sm">
                                <div className="flex items-center gap-3 mb-2">
                                    <div className="p-2 bg-emerald-100 text-emerald-600 rounded-lg">
                                        <Bell className="w-4 h-4" />
                                    </div>
                                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                                        {t('admin.data.stats.newsletter', 'Newsletter Consent')}
                                    </span>
                                </div>
                                <div className="flex items-baseline gap-2">
                                    <span className="text-2xl font-black text-emerald-900">
                                        {
                                            data.participants.filter(
                                                (p) => p.postsort.newsletter_consent
                                            ).length
                                        }
                                    </span>
                                    <span className="text-xs text-slate-400 font-medium">
                                        {Math.round(
                                            (data.participants.filter(
                                                (p) => p.postsort.newsletter_consent
                                            ).length /
                                                Math.max(1, data.participants.length)) *
                                                100
                                        )}
                                        % {t('admin.data.stats.opt_in', 'opt-in')}
                                    </span>
                                </div>
                            </div>
                        )}

                        {data.study.postsort_config?.interview_consent_enabled !== false && (
                            <div className="bg-gradient-to-br from-amber-50 to-white border border-amber-100 p-4 rounded-xl shadow-sm">
                                <div className="flex items-center gap-3 mb-2">
                                    <div className="p-2 bg-amber-100 text-amber-600 rounded-lg">
                                        <Users className="w-4 h-4" />
                                    </div>
                                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                                        {t('admin.data.stats.follow_up', 'Follow-up Interview')}
                                    </span>
                                </div>
                                <div className="flex items-baseline gap-2">
                                    <span className="text-2xl font-black text-amber-900">
                                        {
                                            data.participants.filter(
                                                (p) => p.postsort.interview_consent
                                            ).length
                                        }
                                    </span>
                                    <span className="text-xs text-slate-400 font-medium">
                                        {Math.round(
                                            (data.participants.filter(
                                                (p) => p.postsort.interview_consent
                                            ).length /
                                                Math.max(1, data.participants.length)) *
                                                100
                                        )}
                                        % {t('admin.data.stats.interested', 'interested')}
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="relative w-full sm:w-72">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400 pointer-events-none" />
                        <Input
                            placeholder={t('admin.data.search.placeholder')}
                            value={globalFilter ?? ''}
                            onChange={(e) => setGlobalFilter(e.target.value)}
                            className="pl-9 bg-white border-slate-200 focus-visible:ring-indigo-500 rounded-lg shadow-sm font-mono text-sm"
                        />
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 px-3 py-1.5 rounded-full border border-slate-100 shadow-sm">
                        <span className="font-semibold text-slate-700">
                            {table.getFilteredRowModel().rows.length}
                        </span>
                        <span>{t('admin.data.search.records_found')}</span>
                    </div>
                </div>
            </div>

            {/* Table */}
            <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
                <Table>
                    <TableHeader className="bg-slate-50/50">
                        {table.getHeaderGroups().map((headerGroup) => (
                            <TableRow
                                key={headerGroup.id}
                                className="hover:bg-transparent border-slate-100"
                            >
                                {headerGroup.headers.map((header) => (
                                    <TableHead
                                        key={header.id}
                                        className={cn(
                                            'h-10 text-xs font-bold uppercase tracking-wider text-slate-500',
                                            // @ts-expect-error
                                            header.column.columnDef.meta?.className
                                        )}
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
                                        'cursor-pointer hover:bg-indigo-50/30 transition-colors border-slate-50 group',
                                        row.original.is_discarded &&
                                            'opacity-50 bg-slate-50/50 italic grayscale-[0.5]'
                                    )}
                                    onClick={() => handleViewParticipant(row.original)}
                                >
                                    {row.getVisibleCells().map((cell) => (
                                        <TableCell
                                            key={cell.id}
                                            className={cn(
                                                'py-2.5',
                                                // @ts-expect-error
                                                cell.column.columnDef.meta?.className
                                            )}
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
                                    className="h-32 text-center text-slate-400 text-sm"
                                >
                                    {t('admin.data.search.no_results')}
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
