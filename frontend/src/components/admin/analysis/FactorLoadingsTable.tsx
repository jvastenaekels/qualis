import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { AnalysisResult } from '@/api/model';

interface FactorLoadingsTableProps {
    result: AnalysisResult;
    flaggingMode: 'auto' | 'manual';
    manualFlags: Record<number, number[]>;
    onToggleFlag: (participantDbId: number, factorNumber: number) => void;
}

type SortKey = 'label' | 'flagged' | number;

export function FactorLoadingsTable({
    result,
    flaggingMode,
    manualFlags,
    onToggleFlag,
}: FactorLoadingsTableProps) {
    const { t } = useTranslation();
    const [sortKey, setSortKey] = useState<SortKey>('label');
    const [sortAsc, setSortAsc] = useState(true);

    const thresholdNum = 1.96 / Math.sqrt(result.n_statements);
    const threshold =
        thresholdNum < 0.001 ? thresholdNum.toExponential(2) : thresholdNum.toFixed(3);

    const handleSort = (key: SortKey) => {
        if (sortKey === key) {
            setSortAsc(!sortAsc);
        } else {
            setSortKey(key);
            setSortAsc(key === 'label');
        }
    };

    const sorted = useMemo(
        () =>
            [...result.participants].sort((a, b) => {
                let cmp = 0;
                if (sortKey === 'label') {
                    cmp = a.label.localeCompare(b.label);
                } else if (sortKey === 'flagged') {
                    cmp = (a.flagged_factors?.[0] ?? 0) - (b.flagged_factors?.[0] ?? 0);
                } else if (typeof sortKey === 'number') {
                    cmp = (a.loadings[sortKey] ?? 0) - (b.loadings[sortKey] ?? 0);
                }
                return sortAsc ? cmp : -cmp;
            }),
        [result.participants, sortKey, sortAsc]
    );

    const hasFlaggedParticipants = result.participants.some(
        (p) => p.flagged_factors && p.flagged_factors.length > 0
    );

    const sortProps = (key: SortKey) => ({
        role: 'columnheader' as const,
        'aria-sort': (sortKey === key ? (sortAsc ? 'ascending' : 'descending') : 'none') as
            | 'ascending'
            | 'descending'
            | 'none',
        tabIndex: 0,
        onClick: () => handleSort(key),
        onKeyDown: (e: React.KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleSort(key);
            }
        },
    });

    const arrow = (key: SortKey) => (sortKey === key ? (sortAsc ? ' \u2191' : ' \u2193') : '');

    return (
        <div className="relative">
            <div className="overflow-x-auto">
                <div className="flex items-center gap-2 mb-2">
                    <p className="text-xs text-slate-500">
                        {t(
                            'admin.analysis.significance_threshold',
                            'Significance threshold (p<0.05): \u00b1{{threshold}}',
                            { threshold }
                        )}
                    </p>
                    <TooltipProvider delayDuration={300}>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Info
                                    className="size-3.5 text-slate-400 cursor-help"
                                    aria-hidden="true"
                                />
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="max-w-xs text-xs">
                                {t(
                                    'admin.analysis.loadings_help',
                                    "Factor loadings show how strongly each participant's sort correlates with each factor. Highlighted cells exceed the significance threshold shown above."
                                )}
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                </div>

                {flaggingMode === 'manual' && (
                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 mb-2">
                        {t(
                            'admin.analysis.manual_flag_hint',
                            'Click a loading cell to flag/unflag a participant for that factor. Re-run analysis to update results.'
                        )}
                    </p>
                )}

                {!hasFlaggedParticipants && (
                    <div className="flex items-center justify-center p-8 text-muted-foreground text-sm">
                        {t(
                            'admin.analysis.no_flagged_participants',
                            'No participants flagged for any factor. Try adjusting the number of factors or flagging method.'
                        )}
                    </div>
                )}

                <table className="w-full text-sm">
                    <caption className="sr-only">
                        {t('admin.analysis.caption_loadings', 'Factor loadings per participant')}
                    </caption>
                    <thead>
                        <tr className="border-b border-slate-200">
                            <th
                                scope="col"
                                className="text-left py-2 px-3 font-medium text-slate-600 cursor-pointer hover:text-slate-900 sticky left-0 bg-white z-[1]"
                                {...sortProps('label')}
                            >
                                {t('admin.analysis.participant', 'Participant')}
                                {arrow('label')}
                            </th>
                            {Array.from({ length: result.n_factors }, (_, f) => (
                                <th
                                    key={f}
                                    scope="col"
                                    className="text-right py-2 px-3 font-medium text-slate-600 cursor-pointer hover:text-slate-900"
                                    {...sortProps(f)}
                                >
                                    F{f + 1}
                                    {arrow(f)}
                                </th>
                            ))}
                            <th
                                scope="col"
                                className="text-center py-2 px-3 font-medium text-slate-600 cursor-pointer hover:text-slate-900"
                                {...sortProps('flagged')}
                            >
                                {t('admin.analysis.flagged', 'Flagged')}
                                {arrow('flagged')}
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {sorted.map((p) => {
                            const flaggedSet =
                                flaggingMode === 'manual'
                                    ? new Set(manualFlags[p.db_id] ?? [])
                                    : new Set(p.flagged_factors ?? []);
                            return (
                                <tr
                                    key={p.db_id}
                                    className="border-b border-slate-100 hover:bg-slate-50/50"
                                >
                                    <td className="py-1.5 px-3 font-mono text-xs sticky left-0 bg-white z-[1]">
                                        {p.label}
                                    </td>
                                    {p.loadings.map((loading, f) => {
                                        const factorNum = f + 1;
                                        const isFlagged = flaggedSet.has(factorNum);
                                        const isManual = flaggingMode === 'manual';
                                        return (
                                            <td
                                                key={f}
                                                className={cn(
                                                    'text-right py-1.5 px-3 font-mono text-xs tabular-nums',
                                                    isFlagged &&
                                                        'font-bold bg-indigo-50 text-indigo-700',
                                                    !isFlagged && loading > 0 && 'text-blue-600',
                                                    !isFlagged && loading < 0 && 'text-red-500',
                                                    isManual &&
                                                        'cursor-pointer hover:bg-indigo-100/50 transition-colors border border-dashed border-slate-200'
                                                )}
                                                onClick={
                                                    isManual
                                                        ? () => onToggleFlag(p.db_id, factorNum)
                                                        : undefined
                                                }
                                                onKeyDown={
                                                    isManual
                                                        ? (e) => {
                                                              if (
                                                                  e.key === 'Enter' ||
                                                                  e.key === ' '
                                                              ) {
                                                                  e.preventDefault();
                                                                  onToggleFlag(p.db_id, factorNum);
                                                              }
                                                          }
                                                        : undefined
                                                }
                                                tabIndex={isManual ? 0 : undefined}
                                                role={isManual ? 'button' : undefined}
                                                aria-label={
                                                    isManual
                                                        ? `${isFlagged ? 'Unflag' : 'Flag'} ${p.label} for Factor ${factorNum}`
                                                        : undefined
                                                }
                                            >
                                                {loading > 0 ? '+' : ''}
                                                {loading.toFixed(4)}
                                            </td>
                                        );
                                    })}
                                    <td className="text-center py-1.5 px-3 text-xs">
                                        {flaggedSet.size > 0 ? (
                                            <span className="inline-flex items-center gap-0.5">
                                                {[...flaggedSet].map((fNum) => (
                                                    <span
                                                        key={fNum}
                                                        className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-indigo-100 text-indigo-700 font-medium text-xs"
                                                    >
                                                        F{fNum}
                                                    </span>
                                                ))}
                                            </span>
                                        ) : (
                                            <span className="text-slate-300">&mdash;</span>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            <div
                className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-white to-transparent pointer-events-none md:hidden"
                aria-hidden="true"
            />
        </div>
    );
}
