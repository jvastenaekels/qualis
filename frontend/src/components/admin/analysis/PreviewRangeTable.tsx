/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import type { PreviewRangeRow } from '@/api/model/previewRangeRow';

interface Props {
    rows: PreviewRangeRow[];
    onSelect: (k: number) => void;
    disabled: boolean;
}

export function PreviewRangeTable({ rows, onSelect, disabled }: Props) {
    const { t } = useTranslation();

    if (disabled) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg font-black text-slate-900">
                        {t('admin.analysis.explore.preview_range_title', 'Preview range')}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-sm text-slate-600">
                        {t(
                            'admin.analysis.explore.preview_range_disabled',
                            'Preview range supports PCA + varimax only. Centroid extraction and judgmental rotation are path-dependent — commit a real run to inspect.'
                        )}
                    </p>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-lg font-black text-slate-900">
                    {t('admin.analysis.explore.preview_range_title', 'Preview range')}
                </CardTitle>
            </CardHeader>
            <CardContent>
                <table className="w-full text-sm">
                    <thead>
                        <tr>
                            <th className="text-left font-medium text-slate-500">k</th>
                            {rows.map((r) => (
                                <th key={r.n_factors}>
                                    <button
                                        type="button"
                                        onClick={() => onSelect(r.n_factors)}
                                        aria-label={t(
                                            'admin.analysis.explore.select_k',
                                            '{{k}} factors',
                                            { k: r.n_factors }
                                        )}
                                        className="font-black text-slate-900 hover:underline focus:outline-none focus:ring-2 focus:ring-blue-500 rounded px-1"
                                    >
                                        {r.n_factors}
                                        {r.has_empty_factor && (
                                            <AlertTriangle
                                                className="inline ml-1 h-3 w-3 text-amber-500"
                                                aria-label={t(
                                                    'admin.analysis.explore.empty_factor',
                                                    'Empty factor — over-factorisation'
                                                )}
                                            />
                                        )}
                                    </button>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        <Row
                            label={t('admin.analysis.explore.cumvar', 'cumvar %')}
                            values={rows.map((r) => r.cumulative_variance.toFixed(0))}
                        />
                        <Row
                            label={t('admin.analysis.explore.pct_flagged', '% flagged')}
                            values={rows.map((r) => Math.round(r.pct_flagged * 100).toString())}
                        />
                        <Row
                            label={t('admin.analysis.explore.n_distinguishing', '# distinguishing')}
                            values={rows.map((r) => r.n_distinguishing.toString())}
                        />
                        <Row
                            label={t('admin.analysis.explore.n_cross_loaders', '# cross-loaders')}
                            values={rows.map((r) => r.n_cross_loaders.toString())}
                        />
                        <Row
                            label={t('admin.analysis.explore.min_def_sorts', 'min defining sorts')}
                            values={rows.map((r) => r.min_defining_sorts.toString())}
                        />
                    </tbody>
                </table>
            </CardContent>
        </Card>
    );
}

function Row({ label, values }: { label: string; values: string[] }) {
    return (
        <tr>
            <td className="text-slate-500">{label}</td>
            {values.map((v, i) => (
                <td key={i} className="text-center font-mono">
                    {v}
                </td>
            ))}
        </tr>
    );
}
