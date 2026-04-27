import { useTranslation } from 'react-i18next';
import { Info, Check, AlertTriangle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { AnalysisResult } from '@/api/model';

function BenchmarkBadge({
    value,
    good,
    caution,
    higherIsBetter = true,
    aboveLabel,
    belowLabel,
}: {
    value: number;
    good: number;
    caution: number;
    higherIsBetter?: boolean;
    aboveLabel: string;
    belowLabel: string;
}) {
    const isAbove = higherIsBetter ? value >= good : value <= good;
    const isBelow = higherIsBetter ? value < caution : value > caution;
    if (isAbove)
        return (
            <span className="inline-flex ml-1 text-emerald-600" title={aboveLabel}>
                <Check className="size-3" aria-hidden="true" />
                <span className="sr-only">{aboveLabel}</span>
            </span>
        );
    if (isBelow)
        return (
            <span className="inline-flex ml-1 text-amber-500" title={belowLabel}>
                <AlertTriangle className="size-3" aria-hidden="true" />
                <span className="sr-only">{belowLabel}</span>
            </span>
        );
    return null;
}

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

    const aboveLabel = t('admin.analysis.benchmark_above', 'Above threshold');
    const belowLabel = t('admin.analysis.benchmark_below', 'Below threshold');

    const rows: {
        label: string;
        values: string[];
        benchmark?: { value: number; good: number; caution: number; higherIsBetter?: boolean }[];
    }[] = [
        {
            label: t('admin.analysis.eigenvalue', 'Eigenvalue'),
            values: chars.map((c) => c.eigenvalue.toFixed(3)),
            benchmark: chars.map((c) => ({
                value: c.eigenvalue,
                good: 1.0,
                caution: 1.0,
            })),
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
            benchmark: chars.map((c) => ({
                value: c.composite_reliability,
                good: 0.8,
                caution: 0.7,
            })),
        },
        {
            label: t('admin.analysis.se_factor_scores', 'SE of Factor Scores'),
            values: chars.map((c) => c.se_factor_scores.toFixed(3)),
            benchmark: chars.map((c) => ({
                value: c.se_factor_scores,
                good: 0.3,
                caution: 0.4,
                higherIsBetter: false,
            })),
        },
    ];

    // Append a "Mean SE (z)" row when bootstrap was run, so the column is
    // hidden entirely otherwise (Zabala & Pascual 2016).
    if (result.bootstrap) {
        const factorMeanSe = result.bootstrap.factor_mean_se;
        rows.push({
            label: t('admin.analysis.bootstrap.se_column', 'Mean SE (z)'),
            values: chars.map((_c, i) => (factorMeanSe[i] ?? 0).toFixed(3)),
        });
    }

    return (
        <div className="space-y-4">
            <div className="relative">
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
                                        'Eigenvalues reflect the amount of variance explained. Composite reliability reflects internal consistency among flagged sorts. SE of factor scores reflects the precision of the composite estimate.'
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
                                            {row.benchmark?.[i] && (
                                                <BenchmarkBadge
                                                    value={row.benchmark[i].value}
                                                    good={row.benchmark[i].good}
                                                    caution={row.benchmark[i].caution}
                                                    higherIsBetter={
                                                        row.benchmark[i].higherIsBetter ?? true
                                                    }
                                                    aboveLabel={aboveLabel}
                                                    belowLabel={belowLabel}
                                                />
                                            )}
                                        </td>
                                    ))}
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

            {/* Factor correlation matrix */}
            {result.n_factors >= 2 && (
                <div>
                    <h4 className="text-sm font-medium text-slate-700 mb-2">
                        {t('admin.analysis.factor_correlations', 'Factor Correlations')}
                    </h4>
                    <div className="relative">
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
                                            {row.map((val, j) => {
                                                const v = val ?? 0;
                                                const isOffDiagonal = i !== j;
                                                const isHigh = isOffDiagonal && Math.abs(v) > 0.5;
                                                return (
                                                    <td
                                                        key={j}
                                                        className={`text-right py-1.5 px-3 font-mono text-xs tabular-nums ${isHigh ? 'text-amber-700 bg-amber-50' : 'text-slate-600'}`}
                                                    >
                                                        {isOffDiagonal ? v.toFixed(3) : '1.000'}
                                                        {isHigh && (
                                                            <span className="sr-only">
                                                                {' '}
                                                                (
                                                                {t(
                                                                    'admin.analysis.high_correlation',
                                                                    'High correlation'
                                                                )}
                                                                )
                                                            </span>
                                                        )}
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
