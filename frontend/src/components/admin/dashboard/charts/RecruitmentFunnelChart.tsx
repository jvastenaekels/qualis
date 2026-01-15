import { useMemo } from 'react';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    Cell,
    LabelList,
} from 'recharts';
import type { RecruitmentLinkRead } from '@/api/model';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ArrowRight, Filter } from 'lucide-react';

interface RecruitmentFunnelChartProps {
    links: RecruitmentLinkRead[];
    className?: string;
}

export const RecruitmentFunnelChart = ({ links, className }: RecruitmentFunnelChartProps) => {
    const data = useMemo(() => {
        if (!links || links.length === 0) return [];

        const totals = links.reduce(
            (acc, link) => {
                acc.starts += link.start_count || 0;
                acc.completions += link.usage_count || 0;
                return acc;
            },
            { starts: 0, completions: 0 }
        );

        // We estimate "Views" slightly higher than starts if we don't have it,
        // but let's just use what we have accurately.
        // If we want a funnel, we need at least 2 points.

        return [
            {
                step: 'Initial Contact',
                value: totals.starts,
                fill: '#6366f1',
                label: 'Started Study',
            },
            {
                step: 'Completion',
                value: totals.completions,
                fill: '#10b981',
                label: 'Submitted',
            },
        ];
    }, [links]);

    const conversionRate = useMemo(() => {
        const starts = links?.reduce((acc, l) => acc + (l.start_count || 0), 0) || 0;
        const completions = links?.reduce((acc, l) => acc + (l.usage_count || 0), 0) || 0;
        return starts > 0 ? Math.round((completions / starts) * 100) : 0;
    }, [links]);

    if (!links || links.length === 0) return null;

    return (
        <Card className={className}>
            <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="text-base font-bold">Recruitment Funnel</CardTitle>
                        <CardDescription>Aggregate conversion performance</CardDescription>
                    </div>
                    <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-indigo-50 text-indigo-700 text-[10px] font-black uppercase tracking-wider border border-indigo-100">
                        {conversionRate}% Yield
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                <div className="h-[200px] w-full mt-4">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                            layout="vertical"
                            data={data}
                            margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
                            barSize={40}
                        >
                            <XAxis type="number" hide />
                            <YAxis
                                type="category"
                                dataKey="step"
                                axisLine={false}
                                tickLine={false}
                                tick={{ fontSize: 10, fontWeight: 700, fill: '#64748b' }}
                                width={80}
                            />
                            <Tooltip
                                cursor={{ fill: '#f8fafc' }}
                                contentStyle={{
                                    borderRadius: '12px',
                                    border: 'none',
                                    boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                                    fontSize: '12px',
                                }}
                            />
                            <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                                {data.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.fill} />
                                ))}
                                <LabelList
                                    dataKey="value"
                                    position="right"
                                    style={{ fill: '#64748b', fontSize: '11px', fontWeight: 700 }}
                                />
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
                <div className="mt-6 p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-white rounded-lg shadow-sm">
                            <Filter size={14} className="text-indigo-600" />
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">
                                Success Rate
                            </p>
                            <p className="text-sm font-bold text-slate-700">
                                {conversionRate}% of starters completed
                            </p>
                        </div>
                    </div>
                    <ArrowRight size={16} className="text-slate-300" />
                </div>
            </CardContent>
        </Card>
    );
};
