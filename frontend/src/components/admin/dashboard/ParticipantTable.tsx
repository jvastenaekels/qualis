import type React from 'react';
import {
    type ColumnDef,
    flexRender,
    getCoreRowModel,
    useReactTable,
    getPaginationRowModel,
    getSortedRowModel,
    type SortingState,
    getFilteredRowModel,
    type ColumnFiltersState,
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
import { Badge } from '@/components/ui/badge';
import {
    Eye,
    Trash2,
    CheckCircle2,
    AlertTriangle,
    ChevronLeft,
    ChevronRight,
    Search,
} from 'lucide-react';
import type { ParticipantRead as Participant } from '@/api/model';
import { useState } from 'react';
import { formatDistanceToNow, differenceInSeconds } from 'date-fns';
import { EmptyState } from '@/components/admin/EmptyState';

interface ParticipantTableProps {
    data: Participant[];
    onViewDetail: (participant: Participant) => void;
    onToggleDiscard: (id: number, isDiscarded: boolean) => void;
}

const ParticipantTable: React.FC<ParticipantTableProps> = ({
    data,
    onViewDetail,
    onToggleDiscard,
}) => {
    const [sorting, setSorting] = useState<SortingState>([]);
    const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

    const columns: ColumnDef<Participant>[] = [
        {
            accessorKey: 'session_token',
            header: 'Participant ID',
            cell: ({ row }) => (
                <div className="font-mono text-xs text-slate-500">
                    {row.original.session_token.substring(0, 8)}...
                </div>
            ),
        },
        {
            accessorKey: 'status',
            header: 'Status',
            cell: ({ row }) => {
                const status = row.original.status;
                const isDiscarded = row.original.is_discarded;

                if (isDiscarded) {
                    return (
                        <Badge
                            variant="secondary"
                            className="bg-slate-100 text-slate-500 border-slate-200"
                        >
                            Discarded
                        </Badge>
                    );
                }

                switch (status) {
                    case 'completed':
                        return (
                            <Badge
                                variant="outline"
                                className="bg-emerald-50 text-emerald-700 border-emerald-200"
                            >
                                Complete
                            </Badge>
                        );
                    case 'started':
                        return (
                            <Badge
                                variant="outline"
                                className="bg-sky-50 text-sky-700 border-sky-200"
                            >
                                Active
                            </Badge>
                        );
                    default:
                        return <Badge variant="outline">{status}</Badge>;
                }
            },
        },
        {
            accessorKey: 'created_at',
            header: 'Started',
            cell: ({ row }) => (
                <div className="text-sm text-slate-600">
                    {formatDistanceToNow(new Date(row.original.created_at), { addSuffix: true })}
                </div>
            ),
        },
        {
            header: 'Duration',
            cell: ({ row }) => {
                if (!row.original.submitted_at) return '--';
                const seconds = differenceInSeconds(
                    new Date(row.original.submitted_at),
                    new Date(row.original.created_at)
                );
                const minutes = Math.floor(seconds / 60);
                const isSuspect = seconds < 120; // 2 minute threshold

                return (
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">
                            {minutes}m {seconds % 60}s
                        </span>
                        {isSuspect && !row.original.is_discarded && (
                            <AlertTriangle
                                className="h-4 w-4 text-amber-500"
                                title="Suspiciously fast completion"
                            />
                        )}
                    </div>
                );
            },
        },
        {
            id: 'actions',
            cell: ({ row }) => {
                const p = row.original;
                return (
                    <div className="flex justify-end gap-2">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => onViewDetail(p)}
                            className="h-8 w-8 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50"
                        >
                            <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => onToggleDiscard(p.id, !p.is_discarded)}
                            className={`h-8 w-8 ${p.is_discarded ? 'text-emerald-500 hover:bg-emerald-50' : 'text-slate-400 hover:text-red-600 hover:bg-red-50'}`}
                        >
                            {p.is_discarded ? (
                                <CheckCircle2 className="h-4 w-4" />
                            ) : (
                                <Trash2 className="h-4 w-4" />
                            )}
                        </Button>
                    </div>
                );
            },
        },
    ];

    const table = useReactTable({
        data,
        columns,
        getCoreRowModel: getCoreRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        onSortingChange: setSorting,
        getSortedRowModel: getSortedRowModel(),
        onColumnFiltersChange: setColumnFilters,
        getFilteredRowModel: getFilteredRowModel(),
        state: {
            sorting,
            columnFilters,
        },
    });

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
                <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                        placeholder="Filter participants..."
                        value={(table.getColumn('session_token')?.getFilterValue() as string) ?? ''}
                        onChange={(event) =>
                            table.getColumn('session_token')?.setFilterValue(event.target.value)
                        }
                        className="pl-9 h-10 bg-white border-slate-200 focus:ring-indigo-500"
                    />
                </div>
                <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="bg-slate-100 text-slate-600">
                        {data.length} Total
                    </Badge>
                </div>
            </div>

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
                                        className="text-[10px] font-bold uppercase tracking-wider text-slate-400 h-10 px-4"
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
                        {table.getRowModel().rows?.length ? (
                            table.getRowModel().rows.map((row) => (
                                <TableRow
                                    key={row.id}
                                    data-state={row.getIsSelected() && 'selected'}
                                    className="border-slate-100 hover:bg-slate-50/30 transition-colors"
                                >
                                    {row.getVisibleCells().map((cell) => (
                                        <TableCell key={cell.id} className="px-4 py-3">
                                            {flexRender(
                                                cell.column.columnDef.cell,
                                                cell.getContext()
                                            )}
                                        </TableCell>
                                    ))}
                                </TableRow>
                            ))
                        ) : data.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={columns.length} className="p-0">
                                    <EmptyState type="participants" studySlug={undefined} />
                                </TableCell>
                            </TableRow>
                        ) : (
                            <TableRow>
                                <TableCell
                                    colSpan={columns.length}
                                    className="h-32 text-center text-slate-400 italic"
                                >
                                    No participants found matching current filters.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>

            <div className="flex items-center justify-between px-2">
                <div className="flex-1 text-xs text-slate-400">
                    Showing {table.getRowModel().rows.length} participants
                </div>
                <div className="flex items-center space-x-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => table.previousPage()}
                        disabled={!table.getCanPreviousPage()}
                        className="h-8 gap-1.5 px-3 text-slate-600 border-slate-200 bg-white"
                    >
                        <ChevronLeft className="h-4 w-4" /> Previous
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => table.nextPage()}
                        disabled={!table.getCanNextPage()}
                        className="h-8 gap-1.5 px-3 text-slate-600 border-slate-200 bg-white"
                    >
                        Next <ChevronRight className="h-4 w-4" />
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default ParticipantTable;
