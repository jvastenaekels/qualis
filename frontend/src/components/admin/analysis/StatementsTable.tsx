import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Info } from 'lucide-react';
import {
    Tooltip as UiTooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import type { AnalysisResult } from '@/api/model';

interface StatementsTableProps {
    result: AnalysisResult;
}

type SortKey = 'code' | 'type' | `z${number}` | `a${number}`;

function zScoreColor(z: number): string {
    if (z >= 1.5) return 'text-blue-700 bg-blue-50';
    if (z >= 0.5) return 'text-blue-600 bg-blue-50/50';
    if (z <= -1.5) return 'text-red-700 bg-red-50';
    if (z <= -0.5) return 'text-red-500 bg-red-50/50';
    return 'text-slate-500';
}

export function StatementsTable({ result }: StatementsTableProps) {
    const { t } = useTranslation();
    const [sortKey, setSortKey] = useState<SortKey>('code');
    const [sortAsc, setSortAsc] = useState(true);

    const distinguishingMap = useMemo(() => {
        const map = new Map<number, { significance: Record<string, string> }>();
        for (const d of result.distinguishing) {
            map.set(d.statement_id, { significance: d.significance ?? {} });
        }
        return map;
    }, [result.distinguishing]);

    const consensusIds = useMemo(
        () => new Set(result.consensus.map((c) => c.statement_id)),
        [result.consensus]
    );

    const handleSort = (key: SortKey) => {
        if (sortKey === key) {
            setSortAsc(!sortAsc);
        } else {
            setSortKey(key);
            setSortAsc(key === 'code');
        }
    };

    const sorted = useMemo(
        () =>
            [...result.statement_scores].sort((a, b) => {
                let cmp = 0;
                if (sortKey === 'code') {
                    cmp = a.code.localeCompare(b.code, undefined, { numeric: true });
                } else if (sortKey === 'type') {
                    const aType = distinguishingMap.has(a.statement_id)
                        ? 1
                        : consensusIds.has(a.statement_id)
                          ? -1
                          : 0;
                    const bType = distinguishingMap.has(b.statement_id)
                        ? 1
                        : consensusIds.has(b.statement_id)
                          ? -1
                          : 0;
                    cmp = aType - bType;
                } else if (sortKey.startsWith('z')) {
                    const f = Number(sortKey.slice(1));
                    cmp = (a.z_scores[f] ?? 0) - (b.z_scores[f] ?? 0);
                } else if (sortKey.startsWith('a')) {
                    const f = Number(sortKey.slice(1));
                    cmp = (a.factor_arrays[f] ?? 0) - (b.factor_arrays[f] ?? 0);
                }
                return sortAsc ? cmp : -cmp;
            }),
        [result.statement_scores, sortKey, sortAsc, distinguishingMap, consensusIds]
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

    const getTypeLabel = (stmtId: number): string => {
        const d = distinguishingMap.get(stmtId);
        if (d) {
            const maxSig = Object.values(d.significance).reduce((best, sig) => {
                const levels = ['p<0.000001', 'p<0.001', 'p<0.01', 'p<0.05'];
                return levels.indexOf(sig) < levels.indexOf(best) ? sig : best;
            }, 'p<0.05');
            const stars =
                maxSig === 'p<0.000001'
                    ? '****'
                    : maxSig === 'p<0.001'
                      ? '***'
                      : maxSig === 'p<0.01'
                        ? '**'
                        : '*';
            return `D${stars}`;
        }
        if (consensusIds.has(stmtId)) return 'C';
        return '';
    };

    if (result.statement_scores.length === 0) {
        return (
            <div className="flex items-center justify-center p-8 text-muted-foreground text-sm">
                {t(
                    'admin.analysis.no_statement_scores',
                    'No statement scores available. Ensure participants are flagged for at least one factor.'
                )}
            </div>
        );
    }

    return (
        <div className="relative">
            <div className="overflow-x-auto">
                <div className="flex items-center gap-2 mb-2">
                    <p className="text-xs text-slate-500">
                        {t(
                            'admin.analysis.z_scores_description',
                            'Z-scores and factor array positions per statement'
                        )}
                    </p>
                    <TooltipProvider delayDuration={300}>
                        <UiTooltip>
                            <TooltipTrigger asChild>
                                <Info
                                    className="size-3.5 text-slate-400 cursor-help"
                                    aria-hidden="true"
                                />
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="max-w-xs text-xs">
                                {t(
                                    'admin.analysis.statements_help',
                                    "Z-scores show each factor's standardized position on each statement. D = distinguishing (significantly different between factors), C = consensus (no significant differences)."
                                )}
                            </TooltipContent>
                        </UiTooltip>
                    </TooltipProvider>
                </div>
                <table className="w-full text-sm">
                    <caption className="sr-only">
                        {t(
                            'admin.analysis.caption_statements',
                            'Statement z-scores and factor arrays per factor'
                        )}
                    </caption>
                    <thead>
                        <tr className="border-b border-slate-200">
                            <th
                                scope="col"
                                className="text-left py-2 px-2 font-medium text-slate-600 cursor-pointer hover:text-slate-900 w-12"
                                {...sortProps('code')}
                            >
                                {t('admin.analysis.code', 'Code')}
                                {arrow('code')}
                            </th>
                            <th
                                scope="col"
                                className="text-left py-2 px-2 font-medium text-slate-600"
                            >
                                {t('admin.analysis.statement', 'Statement')}
                            </th>
                            {Array.from({ length: result.n_factors }, (_, f) => (
                                <th
                                    key={`z${f}`}
                                    scope="col"
                                    className="text-right py-2 px-2 font-medium text-slate-600 cursor-pointer hover:text-slate-900"
                                    {...sortProps(`z${f}`)}
                                >
                                    F{f + 1} z{arrow(`z${f}`)}
                                </th>
                            ))}
                            {Array.from({ length: result.n_factors }, (_, f) => (
                                <th
                                    key={`a${f}`}
                                    scope="col"
                                    className="text-right py-2 px-2 font-medium text-slate-600 cursor-pointer hover:text-slate-900"
                                    {...sortProps(`a${f}`)}
                                >
                                    F{f + 1}
                                    {arrow(`a${f}`)}
                                </th>
                            ))}
                            <th
                                scope="col"
                                className="text-center py-2 px-2 font-medium text-slate-600 cursor-pointer hover:text-slate-900 w-16"
                                {...sortProps('type')}
                            >
                                {t('admin.analysis.type', 'Type')}
                                {arrow('type')}
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {sorted.map((stmt) => {
                            const typeLabel = getTypeLabel(stmt.statement_id);
                            return (
                                <tr
                                    key={stmt.statement_id}
                                    className="border-b border-slate-100 hover:bg-slate-50/50"
                                >
                                    <td className="py-1.5 px-2 font-mono text-xs text-slate-500">
                                        {stmt.code}
                                    </td>
                                    <td className="py-1.5 px-2 text-xs text-slate-700 max-w-xs">
                                        <TooltipProvider delayDuration={300}>
                                            <UiTooltip>
                                                <TooltipTrigger asChild>
                                                    <span className="block truncate md:truncate">
                                                        {stmt.text}
                                                    </span>
                                                </TooltipTrigger>
                                                <TooltipContent
                                                    side="bottom"
                                                    className="max-w-sm text-xs"
                                                >
                                                    {stmt.text}
                                                </TooltipContent>
                                            </UiTooltip>
                                        </TooltipProvider>
                                    </td>
                                    {stmt.z_scores.map((z, f) => (
                                        <td
                                            key={`z${f}`}
                                            className={cn(
                                                'text-right py-1.5 px-2 font-mono text-xs tabular-nums',
                                                zScoreColor(z)
                                            )}
                                        >
                                            {z > 0 ? '+' : ''}
                                            {z.toFixed(2)}
                                        </td>
                                    ))}
                                    {stmt.factor_arrays.map((a, f) => (
                                        <td
                                            key={`a${f}`}
                                            className="text-right py-1.5 px-2 font-mono text-xs tabular-nums text-slate-600"
                                        >
                                            {a > 0 ? `+${a}` : a}
                                        </td>
                                    ))}
                                    <td className="text-center py-1.5 px-2">
                                        {typeLabel && (
                                            <span
                                                className={cn(
                                                    'inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium',
                                                    typeLabel.startsWith('D')
                                                        ? 'bg-amber-100 text-amber-800'
                                                        : 'bg-emerald-100 text-emerald-800'
                                                )}
                                            >
                                                {typeLabel}
                                            </span>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                <div className="flex items-center gap-4 text-xs text-slate-500 mt-3 pt-3 border-t border-slate-100">
                    <span>
                        <span className="bg-amber-100 text-amber-800 px-1 py-0.5 rounded font-medium">
                            D*
                        </span>{' '}
                        {t('admin.analysis.distinguishing', 'Distinguishing')}
                    </span>
                    <span>
                        <span className="bg-emerald-100 text-emerald-800 px-1 py-0.5 rounded font-medium">
                            C
                        </span>{' '}
                        {t('admin.analysis.consensus', 'Consensus')}
                    </span>
                </div>
            </div>
            <div
                className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-white to-transparent pointer-events-none md:hidden"
                aria-hidden="true"
            />
        </div>
    );
}
