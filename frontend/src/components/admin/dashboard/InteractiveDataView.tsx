import type { ParticipantRead } from '@/api/model';
import { useState, useMemo } from 'react';
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
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import {
    ArrowUpDown,
    Search,
    Eye,
    Clock,
    Globe,
    ChevronRight,
    AlertTriangle,
    MessageSquare,
    Trash2,
} from 'lucide-react';
import {
    useGetStudyDumpApiAdminStudiesSlugDumpGet,
    useDiscardParticipantApiAdminStudiesParticipantsParticipantIdDiscardPatch,
} from '@/api/generated';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
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
    presort: Record<string, string>;
    postsort: Record<string, string>;
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
    };
    participants: DumpParticipant[];
    statement_id_to_index: Record<string, number>;
}

interface InteractiveDataViewProps {
    slug: string;
    participants?: ParticipantRead[]; // Optional: can be provided from loader
}

export default function InteractiveDataView({
    slug,
    participants: _providedParticipants,
}: InteractiveDataViewProps) {
    const { t } = useTranslation();
    // Determine type usage for useGetStudyDumpApiAdminStudiesSlugDumpGet
    // Casting broadly as we validated the structure manually
    const { data: rawData, isLoading, error } = useGetStudyDumpApiAdminStudiesSlugDumpGet(slug);
    const data = rawData as unknown as DumpResponse;

    const [sorting, setSorting] = useState<SortingState>([]);
    const [globalFilter, setGlobalFilter] = useState('');
    const [selectedParticipant, setSelectedParticipant] = useState<DumpParticipant | null>(null);
    const { refetch } = useGetStudyDumpApiAdminStudiesSlugDumpGet(slug);
    const discardMutation =
        useDiscardParticipantApiAdminStudiesParticipantsParticipantIdDiscardPatch();

    const handleToggleDiscard = async (participantId: number, isDiscarded: boolean) => {
        try {
            await discardMutation.mutateAsync({
                participantId,
                data: { isDiscarded },
            });
            await refetch();
            // Update local state if needed
            if (selectedParticipant && Number(selectedParticipant.id) === participantId) {
                setSelectedParticipant({
                    ...selectedParticipant,
                    is_discarded: isDiscarded,
                    // biome-ignore lint/suspicious/noExplicitAny: complex participant object update
                } as any);
            }
        } catch (err) {
            console.error('Failed to toggle discard status:', err);
        }
    };

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
            }),
            columnHelper.display({
                id: 'actions',
                cell: ({ row }) => (
                    <div className="flex justify-end">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedParticipant(row.original)}
                            className="h-8 w-8 p-0 rounded-full hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
                        >
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>
                ),
            }),
        ],
        [columnHelper, t]
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

    // --- Detail View Logic ---
    const getReconstructedQSort = (participant: DumpParticipant) => {
        if (!data?.study?.statements) return [];

        // Group statements by score
        const piles: Record<number, DumpStatement[]> = {};

        participant.scores.forEach((score, index) => {
            if (score !== null) {
                if (!piles[score]) piles[score] = [];
                // data.study.statements is sorted by ID, matching scores array index
                piles[score].push(data.study.statements[index]);
            }
        });

        // Sort piles by score from high to low (Agree -> Disagree)
        return Object.entries(piles)
            .sort(([a], [b]) => Number(b) - Number(a)) // Descending score
            .map(([score, statements]) => ({
                score: Number(score),
                statements,
            }));
    };

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
                                        className="h-10 text-xs font-bold uppercase tracking-wider text-slate-500"
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
                                    onClick={() => setSelectedParticipant(row.original)}
                                >
                                    {row.getVisibleCells().map((cell) => (
                                        <TableCell key={cell.id} className="py-2.5">
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

            {/* Participant Detail Sheet */}
            <Sheet
                open={!!selectedParticipant}
                onOpenChange={(open) => !open && setSelectedParticipant(null)}
            >
                <SheetContent className="w-[400px] sm:w-[540px] overflow-y-auto bg-slate-50/50 p-0 border-l border-white/20 glass">
                    <div className="h-full flex flex-col">
                        <SheetHeader className="p-8 pb-4 space-y-4 bg-white/40 border-b border-white/20">
                            <div className="flex items-start justify-between">
                                <div className="space-y-1">
                                    <div className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.2em] mb-1">
                                        {t('admin.data.detail.title')}
                                    </div>
                                    <SheetTitle className="text-2xl font-black flex items-center gap-2 text-slate-900">
                                        {t('admin.data.detail.session')}
                                        <span className="font-mono bg-indigo-600 text-white px-2.5 py-0.5 rounded-lg text-lg shadow-lg shadow-indigo-200">
                                            {selectedParticipant?.id.substring(0, 8)}
                                        </span>
                                        {selectedParticipant?.is_discarded && (
                                            <Badge
                                                variant="destructive"
                                                className="ml-2 text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ring-2 ring-red-100 shadow-sm animate-in fade-in zoom-in duration-300"
                                            >
                                                {t('admin.data.detail.discarded_badge')}
                                            </Badge>
                                        )}
                                    </SheetTitle>
                                    <SheetDescription className="text-slate-500 font-medium">
                                        {t('admin.data.detail.description')}
                                    </SheetDescription>
                                </div>
                            </div>
                        </SheetHeader>

                        <div className="flex-1 p-8 pt-6 space-y-8 text-slate-900">
                            {selectedParticipant && (
                                <>
                                    {/* Stats */}
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="bg-white/60 backdrop-blur-md p-5 rounded-2xl border border-white/60 shadow-sm space-y-1 group hover:border-indigo-200 transition-all">
                                            <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5 group-hover:text-indigo-500 transition-colors">
                                                <Clock className="w-3.5 h-3.5" />{' '}
                                                {t('admin.data.detail.stats.duration')}
                                            </div>
                                            <div className="text-2xl font-black text-slate-900 font-mono">
                                                {selectedParticipant.duration_seconds
                                                    ? `${Math.floor(Math.abs(selectedParticipant.duration_seconds) / 60)}m`
                                                    : '-'}
                                                <span className="text-sm text-slate-400 font-bold ml-1">
                                                    {selectedParticipant.duration_seconds
                                                        ? `${Math.round(Math.abs(selectedParticipant.duration_seconds) % 60)}s`
                                                        : ''}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="bg-white/60 backdrop-blur-md p-5 rounded-2xl border border-white/60 shadow-sm space-y-1 group hover:border-indigo-200 transition-all">
                                            <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5 group-hover:text-indigo-500 transition-colors">
                                                <Globe className="w-3.5 h-3.5" />{' '}
                                                {t('admin.data.detail.stats.language')}
                                            </div>
                                            <div className="text-2xl font-black text-slate-900 uppercase">
                                                {selectedParticipant.language === 'US'
                                                    ? 'EN'
                                                    : selectedParticipant.language}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    <div className="flex items-center gap-3">
                                        <Button
                                            variant="outline"
                                            className={cn(
                                                'w-full h-11 rounded-xl font-bold transition-all border-slate-200',
                                                selectedParticipant.is_discarded
                                                    ? 'text-emerald-600 hover:bg-emerald-50 hover:border-emerald-200'
                                                    : 'text-red-500 hover:bg-red-50 hover:border-red-200'
                                            )}
                                            onClick={() => {
                                                if (selectedParticipant) {
                                                    handleToggleDiscard(
                                                        Number(selectedParticipant.id),
                                                        !selectedParticipant.is_discarded
                                                    );
                                                }
                                            }}
                                            disabled={discardMutation.isPending}
                                        >
                                            <Trash2 className="w-4 h-4 mr-2" />
                                            {selectedParticipant.is_discarded
                                                ? t('admin.data.detail.actions.restore')
                                                : t('admin.data.detail.actions.discard')}
                                        </Button>
                                    </div>

                                    {/* Q-Sort Reconstruction */}
                                    <div className="space-y-4">
                                        <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide flex items-center gap-2">
                                            <Eye className="w-4 h-4 text-indigo-500" />
                                            {t('admin.data.detail.sort_config')}
                                        </h3>
                                        <div className="space-y-6 relative before:absolute before:left-3.5 before:top-4 before:bottom-4 before:w-0.5 before:bg-slate-200 before:-z-10">
                                            {getReconstructedQSort(selectedParticipant).map(
                                                (pile) => (
                                                    <div
                                                        key={pile.score}
                                                        className="relative pl-10 group"
                                                    >
                                                        {/* Score Indicator */}
                                                        <div
                                                            className={`
                                                absolute left-0 top-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shadow-sm border-2 z-10
                                                ${
                                                    pile.score > 0
                                                        ? 'bg-green-100 text-green-700 border-green-200'
                                                        : pile.score < 0
                                                          ? 'bg-red-100 text-red-700 border-red-200'
                                                          : 'bg-slate-100 text-slate-700 border-slate-200'
                                                }
                                              `}
                                                        >
                                                            {pile.score > 0
                                                                ? `+${pile.score}`
                                                                : pile.score}
                                                        </div>

                                                        {/* Cards in this pile */}
                                                        <div className="space-y-2">
                                                            {pile.statements.map((stmt) => (
                                                                <div
                                                                    key={stmt.id}
                                                                    className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm text-sm text-slate-700 leading-relaxed hover:border-indigo-200 transition-colors"
                                                                >
                                                                    {stmt.translations.find(
                                                                        (t) =>
                                                                            t.lang ===
                                                                            selectedParticipant.language
                                                                    )?.text ||
                                                                        stmt.translations.find(
                                                                            (t) => t.lang === 'en'
                                                                        )?.text ||
                                                                        stmt.translations[0]?.text}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )
                                            )}
                                        </div>
                                    </div>

                                    {/* Survey Answers (Future / Basic implementation) */}
                                    {(Object.keys(selectedParticipant.presort).length > 0 ||
                                        Object.keys(selectedParticipant.postsort).length > 0) && (
                                        <div className="space-y-3 pt-6 border-t border-slate-200">
                                            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
                                                {t('admin.data.detail.survey.title')}
                                            </h3>
                                            <div className="bg-slate-100/50 rounded-lg p-4 text-xs text-slate-500 italic">
                                                {t('admin.data.detail.survey.csv_note')}
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                </SheetContent>
            </Sheet>
        </div>
    );
}
