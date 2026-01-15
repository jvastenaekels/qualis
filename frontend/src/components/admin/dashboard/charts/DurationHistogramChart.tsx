import { useMemo } from 'react';
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
import { parseISO, differenceInSeconds } from 'date-fns';
import type { ParticipantRead } from '@/api/model';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Info } from 'lucide-react';

interface DurationHistogramChartProps {
    participants: ParticipantRead[];
    className?: string;
}

export const DurationHistogramChart = ({
    participants,
    className,
}: DurationHistogramChartProps) => {
    const { chartData, suspectCount } = useMemo(() => {
        if (!participants || participants.length === 0) {
            return { chartData: [], median: 0, suspectCount: 0 };
        }

        const completedDurations = participants
            .filter(
                (p) => p.status === 'completed' && !p.is_discarded && p.submitted_at && p.created_at
            )
            .map((p) => {
                const start = parseISO(p.created_at as unknown as string);
                const end = parseISO(p.submitted_at as unknown as string);
                return Math.max(0, differenceInSeconds(end, start));
            })
            .sort((a, b) => a - b);

        if (completedDurations.length === 0) {
            return { chartData: [], median: 0, suspectCount: 0 };
        }

        // Calculate median
        const mid = Math.floor(completedDurations.length / 2);
        const medianVal =
            completedDurations.length % 2 !== 0
                ? completedDurations[mid]
                : (completedDurations[mid - 1] + completedDurations[mid]) / 2;

        const suspectVal = completedDurations.filter((d) => d < 120).length;

        // Define buckets (in seconds)
        const buckets = [
            { label: '&lt; 2m', max: 120, color: '#ef4444' }, // Red (Suspect)
            { label: '2-5m', max: 300, color: '#f59e0b' }, // Amber
            { label: '5-10m', max: 600, color: '#4f46e5' }, // Indigo
            { label: '10-15m', max: 900, color: '#4f46e5' },
            { label: '15-20m', max: 1200, color: '#4f46e5' },
            { label: '20-30m', max: 1800, color: '#4f46e5' },
            { label: '30m+', max: Infinity, color: '#4f46e5' },
        ];

        const data = buckets.map((bucket) => {
            const count = completedDurations.filter((d) => {
                const prevMax = buckets[buckets.indexOf(bucket) - 1]?.max || 0;
                return d >= prevMax && d < bucket.max;
            }).length;

            return {
                name: bucket.label,
                count: count,
                color: bucket.color,
                isSuspect: bucket.label === '< 2m',
            };
        });

        return {
            chartData: data,
            median: medianVal / 60, // in minutes for the reference line if needed, but we'll use buckets
            suspectCount: suspectVal,
        };
    }, [participants]);

    if (!participants || chartData.length === 0) {
        return null;
    }

    return (
        <Card className={className}>
            <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="text-base font-bold">Duration Distribution</CardTitle>
                        <CardDescription>Time spent to complete the study</CardDescription>
                    </div>
                    {suspectCount > 0 && (
                        <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-red-50 text-red-700 text-[10px] font-black uppercase tracking-wider border border-red-100">
                            <Info size={12} />
                            {suspectCount} Suspect
                        </div>
                    )}
                </div>
            </CardHeader>
            <CardContent>
                <div className="h-[250px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                            data={chartData}
                            margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
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
                                allowDecimals={false}
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
                            <Bar dataKey="count" radius={[4, 4, 0, 0]} barSize={32}>
                                {chartData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
                <div className="mt-4 flex items-center justify-between text-[10px] font-medium text-slate-400 border-t border-slate-50 pt-3">
                    <div className="flex items-center gap-1">
                        <div className="w-2 h-2 rounded-full bg-red-500" />
                        <span>High risk (&lt; 2m)</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <div className="w-2 h-2 rounded-full bg-amber-500" />
                        <span>Medium risk (2-5m)</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <div className="w-2 h-2 rounded-full bg-indigo-500" />
                        <span>Normal (&gt; 5m)</span>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
};
