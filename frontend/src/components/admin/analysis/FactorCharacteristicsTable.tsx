import { useTranslation } from 'react-i18next';
import { Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { AnalysisResult } from '@/api/model';

interface FactorCharacteristicsTableProps {
    result: AnalysisResult;
}

export function FactorCharacteristicsTable({ result }: FactorCharacteristicsTableProps) {
    const { t } = useTranslation();
    const chars = result.factor_characteristics;

    if (chars.length === 0) {
        return (
            <div className="flex items-center justify-center p-8 text-muted-foreground text-sm">
                {t('admin.analysis.no_characteristics', 'No factor characteristics available.')}
            </div>
        );
    }

    const rows: { label: string; values: string[] }[] = [
        {
            label: t('admin.analysis.eigenvalue', 'Eigenvalue'),
            values: chars.map((c) => c.eigenvalue.toFixed(3)),
        },
        {
            label: t('admin.analysis.variance_explained', 'Variance Explained (%)'),
            values: chars.map((c) => c.variance_explained.toFixed(1)),
        },
        {
            label: t('admin.analysis.cumulative_variance', 'Cumulative Variance (%)'),
            values: chars.map((c) => c.cumulative_variance.toFixed(1)),
        },
        {
            label: t('admin.analysis.n_flagged', 'N Flagged Sorts'),
            values: chars.map((c) => String(c.n_flagged)),
        },
        {
            label: t('admin.analysis.composite_reliability', 'Composite Reliability'),
            values: chars.map((c) => c.composite_reliability.toFixed(3)),
        },
        {
            label: t('admin.analysis.se_factor_scores', 'SE of Factor Scores'),
            values: chars.map((c) => c.se_factor_scores.toFixed(3)),
        },
    ];

    return (
        <div className="space-y-4">
            <div className="overflow-x-auto">
                <div className="flex items-center gap-2 mb-2">
                    <h4 className="text-sm font-medium text-slate-700">
                        {t('admin.analysis.factor_statistics', 'Factor Statistics')}
                    </h4>
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
                                    'admin.analysis.characteristics_help',
                                    'Eigenvalues indicate factor strength. Composite reliability measures internal consistency. SE indicates precision of factor score estimates.'
                                )}
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                </div>
                <table className="w-full text-sm">
                    <caption className="sr-only">
                        {t(
                            'admin.analysis.caption_characteristics',
                            'Factor characteristics and reliability statistics'
                        )}
                    </caption>
                    <thead>
                        <tr className="border-b border-slate-200">
                            <th
                                scope="col"
                                className="text-left py-2 px-3 font-medium text-slate-600"
                            >
                                <span className="sr-only">
                                    {t('admin.analysis.metric', 'Metric')}
                                </span>
                            </th>
                            {chars.map((c) => (
                                <th
                                    key={c.factor}
                                    scope="col"
                                    className="text-right py-2 px-3 font-medium text-slate-600"
                                >
                                    F{c.factor}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row) => (
                            <tr key={row.label} className="border-b border-slate-100">
                                <th
                                    scope="row"
                                    className="py-1.5 px-3 text-slate-700 font-medium text-xs text-left"
                                >
                                    {row.label}
                                </th>
                                {row.values.map((val, i) => (
                                    <td
                                        key={i}
                                        className="text-right py-1.5 px-3 font-mono text-xs tabular-nums text-slate-600"
                                    >
                                        {val}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Factor correlation matrix */}
            {result.n_factors >= 2 && (
                <div>
                    <h4 className="text-sm font-medium text-slate-700 mb-2">
                        {t('admin.analysis.factor_correlations', 'Factor Correlations')}
                    </h4>
                    <div className="overflow-x-auto">
                        <table className="text-sm">
                            <caption className="sr-only">
                                {t(
                                    'admin.analysis.caption_correlations',
                                    'Factor-to-factor correlation matrix'
                                )}
                            </caption>
                            <thead>
                                <tr className="border-b border-slate-200">
                                    <th scope="col" className="py-2 px-3">
                                        <span className="sr-only">
                                            {t('admin.analysis.factor', 'Factor')}
                                        </span>
                                    </th>
                                    {Array.from({ length: result.n_factors }, (_, f) => (
                                        <th
                                            key={f}
                                            scope="col"
                                            className="text-right py-2 px-3 font-medium text-slate-600"
                                        >
                                            F{f + 1}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {result.correlation_matrix.map((row, i) => (
                                    <tr key={i} className="border-b border-slate-100">
                                        <th
                                            scope="row"
                                            className="py-1.5 px-3 font-medium text-slate-600 text-xs text-left"
                                        >
                                            F{i + 1}
                                        </th>
                                        {row.map((val, j) => (
                                            <td
                                                key={j}
                                                className="text-right py-1.5 px-3 font-mono text-xs tabular-nums text-slate-600"
                                            >
                                                {i === j ? '1.000' : val.toFixed(3)}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Summary stats */}
            <div className="flex flex-wrap gap-4 text-xs text-slate-500 pt-2 border-t border-slate-100">
                <span>
                    {t('admin.analysis.total_variance', 'Total Variance Explained')}:{' '}
                    {result.total_variance_explained.toFixed(1)}%
                </span>
                <span>
                    {t('admin.analysis.method_used', 'Method')}: {result.extraction.toUpperCase()} +{' '}
                    {result.rotation}
                </span>
                <span>
                    N = {result.n_participants} | {result.n_statements}{' '}
                    {t('admin.analysis.statements_label', 'statements')}
                </span>
            </div>
        </div>
    );
}
