import { useTranslation } from 'react-i18next';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    ReferenceLine,
    Cell,
} from 'recharts';

interface ScreePlotProps {
    eigenvalues: number[];
    suggestedNFactors: number;
    selectedNFactors: number;
    onSelectNFactors: (n: number) => void;
}

export function ScreePlot({
    eigenvalues,
    suggestedNFactors,
    selectedNFactors,
    onSelectNFactors,
}: ScreePlotProps) {
    const { t } = useTranslation();

    const data = eigenvalues.map((value, index) => ({
        factor: index + 1,
        eigenvalue: Number(value.toFixed(3)),
    }));

    return (
        <div className="space-y-2">
            <p className="text-xs text-slate-500">
                {t(
                    'admin.analysis.scree_hint',
                    'Click a bar to select the number of factors. Dashed line = Kaiser criterion (eigenvalue > 1).'
                )}
            </p>
            <ResponsiveContainer width="100%" height={220}>
                <BarChart
                    data={data}
                    margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
                    aria-label={t(
                        'admin.analysis.scree_plot_label',
                        'Scree plot showing eigenvalues for {{n}} factors',
                        { n: eigenvalues.length }
                    )}
                >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis
                        dataKey="factor"
                        tick={{ fontSize: 12 }}
                        label={{
                            value: t('admin.analysis.factor', 'Factor'),
                            position: 'insideBottom',
                            offset: -2,
                            fontSize: 11,
                        }}
                    />
                    <YAxis
                        tick={{ fontSize: 12 }}
                        label={{
                            value: t('admin.analysis.eigenvalue', 'Eigenvalue'),
                            angle: -90,
                            position: 'insideLeft',
                            offset: 10,
                            fontSize: 11,
                        }}
                    />
                    <Tooltip
                        formatter={(value: number | undefined) => [
                            value?.toFixed(3) ?? '',
                            t('admin.analysis.eigenvalue', 'Eigenvalue'),
                        ]}
                        labelFormatter={(label: number) =>
                            `${t('admin.analysis.factor', 'Factor')} ${label}`
                        }
                    />
                    <ReferenceLine y={1} stroke="#94a3b8" strokeDasharray="6 3" label="" />
                    <Bar
                        dataKey="eigenvalue"
                        radius={[4, 4, 0, 0]}
                        cursor="pointer"
                        onClick={(_data: unknown, index: number) => onSelectNFactors(index + 1)}
                    >
                        {data.map((entry) => (
                            <Cell
                                key={entry.factor}
                                fill={entry.factor <= selectedNFactors ? '#6366f1' : '#cbd5e1'}
                            />
                        ))}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
            <p className="text-xs text-slate-400 text-center">
                {t(
                    'admin.analysis.kaiser_suggestion',
                    'Kaiser criterion suggests {{n}} factor(s)',
                    {
                        n: suggestedNFactors,
                    }
                )}
            </p>
        </div>
    );
}
