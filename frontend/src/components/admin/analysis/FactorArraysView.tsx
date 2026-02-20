import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { AnalysisResult } from '@/api/model';

interface FactorArraysViewProps {
    result: AnalysisResult;
}

export function FactorArraysView({ result }: FactorArraysViewProps) {
    const { t } = useTranslation();

    const distinguishingIds = useMemo(
        () => new Set(result.distinguishing.map((d) => d.statement_id)),
        [result.distinguishing]
    );

    const hasFlaggedParticipants = result.factor_characteristics.some((c) => c.n_flagged > 0);

    if (!hasFlaggedParticipants) {
        return (
            <div className="flex items-center justify-center p-8 text-muted-foreground text-sm">
                {t(
                    'admin.analysis.no_flagged_participants',
                    'No participants flagged for any factor. Try adjusting the number of factors or flagging method.'
                )}
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {Array.from({ length: result.n_factors }, (_, f) => {
                // Group statements by their factor array score for this factor
                const groups = new Map<number, typeof result.statement_scores>();
                for (const stmt of result.statement_scores) {
                    const score = stmt.factor_arrays[f] ?? 0;
                    if (!groups.has(score)) groups.set(score, []);
                    groups.get(score)?.push(stmt);
                }

                const sortedScores = [...groups.keys()].sort((a, b) => b - a);

                // Find max count per column for table rows
                const maxRows = Math.max(...sortedScores.map((s) => groups.get(s)?.length ?? 0));

                return (
                    <div key={f} className="space-y-3">
                        <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-slate-900">
                                {t('admin.analysis.factor_n', 'Factor {{n}}', { n: f + 1 })}
                            </h3>
                            <Badge variant="secondary" className="text-xs">
                                {result.factor_characteristics[f]?.n_flagged ?? 0}{' '}
                                {t('admin.analysis.sorts', 'sorts')}
                            </Badge>
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
                                            'admin.analysis.factor_array_help',
                                            'Composite Q-sort showing the idealized sort pattern for this factor. Statements are placed in the distribution based on their weighted z-scores.'
                                        )}
                                    </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                        </div>
                        <div className="relative">
                            <div className="overflow-x-auto pb-2">
                                <table
                                    className="border-collapse"
                                    aria-label={t(
                                        'admin.analysis.factor_array_label',
                                        'Factor {{n}} composite sort',
                                        { n: f + 1 }
                                    )}
                                >
                                    <thead>
                                        <tr>
                                            {sortedScores.map((score) => (
                                                <th
                                                    key={score}
                                                    scope="col"
                                                    className="text-center text-xs font-medium text-slate-500 py-1 px-1 min-w-[60px] sm:min-w-[90px] lg:min-w-[110px]"
                                                >
                                                    {score > 0 ? `+${score}` : score}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {Array.from({ length: maxRows }, (_, row) => (
                                            <tr key={row}>
                                                {sortedScores.map((score) => {
                                                    const stmts = groups.get(score) ?? [];
                                                    const stmt = stmts[row];
                                                    if (!stmt) {
                                                        return (
                                                            <td
                                                                key={score}
                                                                className="p-0.5 align-top"
                                                            />
                                                        );
                                                    }
                                                    const isDistinguishing = distinguishingIds.has(
                                                        stmt.statement_id
                                                    );
                                                    return (
                                                        <td key={score} className="p-0.5 align-top">
                                                            <div
                                                                className={cn(
                                                                    'px-2 py-1.5 rounded text-xs border min-w-[60px] sm:min-w-[90px] lg:min-w-[110px]',
                                                                    isDistinguishing
                                                                        ? 'bg-amber-50 border-amber-200'
                                                                        : 'bg-white border-slate-200'
                                                                )}
                                                                title={stmt.text}
                                                            >
                                                                <span className="font-mono font-medium text-slate-500">
                                                                    {stmt.code}
                                                                </span>
                                                                <p className="text-slate-700 mt-0.5 line-clamp-3 md:line-clamp-3 leading-tight">
                                                                    {stmt.text}
                                                                </p>
                                                            </div>
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <div
                                className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-white to-transparent pointer-events-none md:hidden"
                                aria-hidden="true"
                            />
                        </div>
                    </div>
                );
            })}
            <div className="flex items-center gap-2 text-xs text-slate-500 pt-2 border-t border-slate-100">
                <div className="w-3 h-3 rounded bg-amber-50 border border-amber-200" />
                {t('admin.analysis.distinguishing_legend', 'Distinguishing statement')}
            </div>
        </div>
    );
}
