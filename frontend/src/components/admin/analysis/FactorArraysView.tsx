import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
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

    return (
        <div className="space-y-6">
            {Array.from({ length: result.n_factors }, (_, f) => {
                // Group statements by their factor array score for this factor
                const groups = new Map<number, typeof result.statement_scores>();
                for (const stmt of result.statement_scores) {
                    const score = stmt.factor_arrays[f];
                    if (!groups.has(score)) groups.set(score, []);
                    groups.get(score)?.push(stmt);
                }

                const sortedScores = [...groups.keys()].sort((a, b) => b - a);

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
                        </div>
                        <div className="flex gap-1 overflow-x-auto pb-2">
                            {sortedScores.map((score) => (
                                <div key={score} className="flex-shrink-0 space-y-1">
                                    <div className="text-center text-xs font-medium text-slate-500 py-1">
                                        {score > 0 ? `+${score}` : score}
                                    </div>
                                    <div className="space-y-1 min-w-[100px]">
                                        {groups.get(score)?.map((stmt) => (
                                            <div
                                                key={stmt.statement_id}
                                                className={cn(
                                                    'px-2 py-1.5 rounded text-xs border',
                                                    distinguishingIds.has(stmt.statement_id)
                                                        ? 'bg-amber-50 border-amber-200'
                                                        : 'bg-white border-slate-200'
                                                )}
                                            >
                                                <span className="font-mono font-medium text-slate-500">
                                                    {stmt.code}
                                                </span>
                                                <p className="text-slate-700 mt-0.5 line-clamp-3 leading-tight">
                                                    {stmt.text}
                                                </p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
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
