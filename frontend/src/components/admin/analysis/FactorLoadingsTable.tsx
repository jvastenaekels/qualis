import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { AnalysisResult } from '@/api/model';

interface FactorLoadingsTableProps {
    result: AnalysisResult;
}

type SortKey = 'label' | 'flagged' | number;

export function FactorLoadingsTable({ result }: FactorLoadingsTableProps) {
    const { t } = useTranslation();
    const [sortKey, setSortKey] = useState<SortKey>('label');
    const [sortAsc, setSortAsc] = useState(true);

    const threshold = (1.96 / Math.sqrt(result.n_statements)).toFixed(3);

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
                } else {
                    const fIdx = sortKey as number;
                    cmp = (a.loadings[fIdx] ?? 0) - (b.loadings[fIdx] ?? 0);
                }
                return sortAsc ? cmp : -cmp;
            }),
        [result.participants, sortKey, sortAsc]
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

    const arrow = (key: SortKey) => (sortKey === key ? (sortAsc ? ' ↑' : ' ↓') : '');

    return (
        <div className="overflow-x-auto">
            <p className="text-xs text-slate-500 mb-2">
                {t(
                    'admin.analysis.significance_threshold',
                    'Significance threshold (p<0.05): ±{{threshold}}',
                    { threshold }
                )}
            </p>
            <table className="w-full text-sm">
                <thead>
                    <tr className="border-b border-slate-200">
                        <th
                            scope="col"
                            className="text-left py-2 px-3 font-medium text-slate-600 cursor-pointer hover:text-slate-900"
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
                        const flaggedSet = new Set(p.flagged_factors ?? []);
                        return (
                            <tr
                                key={p.db_id}
                                className="border-b border-slate-100 hover:bg-slate-50/50"
                            >
                                <td className="py-1.5 px-3 font-mono text-xs">{p.label}</td>
                                {p.loadings.map((loading, f) => {
                                    const isFlagged = flaggedSet.has(f + 1);
                                    return (
                                        <td
                                            key={f}
                                            className={cn(
                                                'text-right py-1.5 px-3 font-mono text-xs tabular-nums',
                                                isFlagged &&
                                                    'font-bold bg-indigo-50 text-indigo-700',
                                                !isFlagged && loading > 0 && 'text-blue-600',
                                                !isFlagged && loading < 0 && 'text-red-500'
                                            )}
                                        >
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
                                        <span className="text-slate-300">—</span>
                                    )}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
