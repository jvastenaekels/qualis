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

    const data = eigenvalues
        .filter((v) => Number.isFinite(v))
        .map((value, index) => ({
            factor: index + 1,
            eigenvalue: Number(value.toFixed(3)),
        }));
    const formatTooltipValue = (value: unknown) => {
        const numericValue = typeof value === 'number' ? value : Number(value);
        return Number.isFinite(numericValue) ? numericValue.toFixed(3) : '';
    };

    return (
        <div className="space-y-2 min-w-0">
            <p className="text-xs text-slate-500">
                {t(
                    'admin.analysis.scree_hint',
                    'Each bar shows how much variance a factor explains (its eigenvalue). The dashed line marks eigenvalue = 1 (Kaiser criterion). Click a bar to select the number of factors to extract.'
                )}
            </p>
            <ResponsiveContainer width="100%" height={200} minWidth={0}>
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
                        formatter={(value) => [
                            formatTooltipValue(value),
                            t('admin.analysis.eigenvalue', 'Eigenvalue'),
                        ]}
                        labelFormatter={(label) =>
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

            {/* Keyboard-accessible alternative for scree plot bar selection */}
            <div
                className="sr-only"
                role="listbox"
                aria-label={t('admin.analysis.select_factors', 'Select number of factors')}
            >
                {eigenvalues.map((ev, i) => (
                    <button
                        key={i}
                        type="button"
                        role="option"
                        aria-selected={selectedNFactors === i + 1}
                        onClick={() => onSelectNFactors(i + 1)}
                    >
                        {t('admin.analysis.factor', 'Factor')} {i + 1}: {ev.toFixed(3)}
                    </button>
                ))}
            </div>

            <p className="text-xs text-slate-400 text-center">
                {t(
                    'admin.analysis.kaiser_suggestion',
                    '{{n}} factor(s) have eigenvalues above 1 (Kaiser criterion)',
                    {
                        n: suggestedNFactors,
                    }
                )}
            </p>
        </div>
    );
}
