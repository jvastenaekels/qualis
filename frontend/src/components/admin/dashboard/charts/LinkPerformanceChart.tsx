import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Cell,
} from 'recharts';
import type { RecruitmentLinkRead } from '@/api/model';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface LinkPerformanceChartProps {
    links: RecruitmentLinkRead[];
    className?: string;
}

type SortMetric = 'responses' | 'conversion';

export const LinkPerformanceChart = ({ links, className }: LinkPerformanceChartProps) => {
    const { t } = useTranslation();
    const [metric, setMetric] = useState<SortMetric>('responses');

    const data = useMemo(() => {
        if (!links || links.length === 0) return [];

        const processed = links.map((link) => {
            const starts = link.start_count || 0;
            const usage = link.usage_count || 0;
            const rate = starts > 0 ? (usage / starts) * 100 : 0;

            return {
                name: link.name || link.token.slice(0, 8),
                responses: usage,
                conversion: Math.round(rate),
                starts: starts,
                full_name: link.name || `Link ${link.token}`,
            };
        });

        if (metric === 'responses') {
            return [...processed].sort((a, b) => b.responses - a.responses).slice(0, 10);
        } else {
            return [...processed].sort((a, b) => b.conversion - a.conversion).slice(0, 10);
        }
    }, [links, metric]);

    if (!links || links.length === 0) return null;

    return (
        <Card className={className}>
            <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between space-y-2 sm:space-y-0 pb-6">
                <div>
                    <CardTitle className="text-base font-bold">
                        {t('admin.analytics.charts.link_performance.title')}
                    </CardTitle>
                    <CardDescription>
                        {t('admin.analytics.charts.link_performance.subtitle')}
                    </CardDescription>
                </div>
                <Tabs
                    value={metric}
                    onValueChange={(v) => setMetric(v as SortMetric)}
                    className="w-full sm:w-auto"
                >
                    <TabsList className="grid grid-cols-2 w-full sm:w-[200px]">
                        <TabsTrigger value="responses" className="text-[10px] font-bold">
                            {t('admin.analytics.charts.link_performance.volume')}
                        </TabsTrigger>
                        <TabsTrigger value="conversion" className="text-[10px] font-bold">
                            {t('admin.analytics.charts.link_performance.yield')}
                        </TabsTrigger>
                    </TabsList>
                </Tabs>
            </CardHeader>
            <CardContent>
                <div className="h-[250px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                            data={data}
                            margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                            barSize={metric === 'responses' ? 32 : 24}
                        >
                            <CartesianGrid
                                strokeDasharray="3 3"
                                vertical={false}
                                stroke="#f1f5f9"
                            />
                            <XAxis
                                dataKey="name"
                                axisLine={false}
                                tickLine={false}
                                tick={{ fontSize: 10, fill: '#64748b', fontWeight: 600 }}
                            />
                            <YAxis
                                axisLine={false}
                                tickLine={false}
                                tick={{ fontSize: 10, fill: '#64748b' }}
                                unit={metric === 'conversion' ? '%' : ''}
                            />
                            <Tooltip
                                contentStyle={{
                                    borderRadius: '12px',
                                    border: 'none',
                                    boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                                    fontSize: '12px',
                                }}
                                // biome-ignore lint/suspicious/noExplicitAny: Recharts type looseness
                                formatter={(value: any) => [
                                    metric === 'conversion' ? `${value ?? 0}%` : (value ?? 0),
                                    metric === 'conversion'
                                        ? t(
                                              'admin.analytics.charts.link_performance.conversion_rate'
                                          )
                                        : t(
                                              'admin.analytics.charts.link_performance.total_responses'
                                          ),
                                ]}
                            />
                            <Bar
                                dataKey={metric}
                                radius={[4, 4, 0, 0]}
                                fill={metric === 'responses' ? '#4f46e5' : '#10b981'}
                            >
                                {data.map((_entry, index) => (
                                    <Cell
                                        key={`cell-${index}`}
                                        fill={metric === 'responses' ? '#4f46e5' : '#10b981'}
                                        fillOpacity={1 - index * 0.08}
                                    />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </CardContent>
        </Card>
    );
};
