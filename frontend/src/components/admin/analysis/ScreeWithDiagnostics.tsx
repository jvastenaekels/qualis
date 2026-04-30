/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { useTranslation } from 'react-i18next';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { ScreePlot } from './ScreePlot';

interface ScreeWithDiagnosticsProps {
    eigenvalues: number[];
    kaiserN: number;
    parallelN: number;
    mapN: number;
    selectedNFactors: number;
    onSelectNFactors: (n: number) => void;
}

export function ScreeWithDiagnostics({
    eigenvalues,
    kaiserN,
    parallelN,
    mapN,
    selectedNFactors,
    onSelectNFactors,
}: ScreeWithDiagnosticsProps) {
    const { t } = useTranslation();

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-lg font-black text-slate-900">
                    {t('admin.analysis.explore.diagnostics_title', 'Diagnostics')}
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
                <ScreePlot
                    eigenvalues={eigenvalues}
                    suggestedNFactors={kaiserN}
                    selectedNFactors={selectedNFactors}
                    onSelectNFactors={onSelectNFactors}
                />
                <dl className="grid grid-cols-3 gap-2 text-sm">
                    <div>
                        <dt className="text-slate-500">
                            {t('admin.analysis.explore.kaiser', 'Kaiser')}
                        </dt>
                        <dd className="text-lg font-black text-slate-900">{kaiserN}</dd>
                    </div>
                    <div>
                        <dt className="text-slate-500">
                            {t('admin.analysis.explore.parallel', 'Parallel analysis')}
                        </dt>
                        <dd className="text-lg font-black text-slate-900">{parallelN}</dd>
                    </div>
                    <div>
                        <dt className="text-slate-500">
                            {t('admin.analysis.explore.map', "Velicer's MAP")}
                        </dt>
                        <dd className="text-lg font-black text-slate-900">{mapN}</dd>
                    </div>
                </dl>
                <p className="text-xs text-slate-500 italic">
                    {t(
                        'admin.analysis.explore.advisory',
                        'Advisory only — Q-method retention also depends on interpretability and stability (Watts & Stenner 2012).'
                    )}
                </p>
            </CardContent>
        </Card>
    );
}
