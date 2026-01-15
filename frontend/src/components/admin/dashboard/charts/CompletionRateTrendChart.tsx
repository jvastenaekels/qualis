import { useMemo, useState } from 'react';
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
} from 'recharts';
import {
    format,
    startOfDay,
    eachDayOfInterval,
    isSameDay,
    parseISO,
    subDays,
    endOfDay,
} from 'date-fns';
import type { ParticipantRead } from '@/api/model';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface CompletionRateTrendChartProps {
    participants: ParticipantRead[];
    className?: string;
}

type TimeRange = '7d' | '30d' | '90d' | 'all';

export const CompletionRateTrendChart = ({
    participants,
    className,
}: CompletionRateTrendChartProps) => {
    const [range, setRange] = useState<TimeRange>('all');

    const chartData = useMemo(() => {
        if (!participants || participants.length === 0) return [];

        // 1. Determine date range
        const dates = participants.map((p) => parseISO(p.created_at as unknown as string));
        const minDate = new Date(Math.min(...dates.map((d) => d.getTime())));
        const maxDate = new Date();

        let startDate = minDate;
        if (range === '7d') startDate = subDays(maxDate, 7);
        else if (range === '30d') startDate = subDays(maxDate, 30);
        else if (range === '90d') startDate = subDays(maxDate, 90);

        if (range === 'all') startDate = startOfDay(minDate);
        else startDate = startOfDay(startDate);

        const interval = eachDayOfInterval({
            start: startDate,
            end: endOfDay(maxDate),
        });

        // 3. Process cumulative counts to calculate rolling completion rate
        let cumulativeStarted = 0;
        let cumulativeCompleted = 0;

        // We calculate counts FOR ALL TIME before startDate to get baseline for the chart
        const baselineStarted = participants.filter(
            (p) => parseISO(p.created_at as unknown as string) < startDate
        ).length;
        const baselineCompleted = participants.filter(
            (p) => p.submitted_at && parseISO(p.submitted_at as unknown as string) < startDate
        ).length;

        cumulativeStarted = baselineStarted;
        cumulativeCompleted = baselineCompleted;

        return interval.map((day) => {
            const dayStarted = participants.filter((p) => {
                const date = parseISO(p.created_at as unknown as string);
                return isSameDay(date, day);
            }).length;

            const dayCompleted = participants.filter((p) => {
                if (!p.submitted_at) return false;
                const date = parseISO(p.submitted_at as unknown as string);
                return isSameDay(date, day);
            }).length;

            cumulativeStarted += dayStarted;
            cumulativeCompleted += dayCompleted;

            const rate =
                cumulativeStarted > 0
                    ? Math.round((cumulativeCompleted / cumulativeStarted) * 100)
                    : 0;

            return {
                date: format(day, 'MMM dd'),
                rate: rate,
            };
        });
    }, [participants, range]);

    if (!participants || participants.length === 0) {
        return null;
    }

    const currentRate = chartData.length > 0 ? chartData[chartData.length - 1].rate : 0;

    return (
        <Card className={className}>
            <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between space-y-2 sm:space-y-0 pb-6">
                <div className="space-y-1">
                    <CardTitle className="text-base font-bold flex items-center gap-2">
                        Completion Trend
                        <span className="text-emerald-500 text-sm ml-2">{currentRate}%</span>
                    </CardTitle>
                    <CardDescription>Rolling conversion over time</CardDescription>
                </div>
                <Tabs
                    value={range}
                    onValueChange={(v) => setRange(v as TimeRange)}
                    className="w-full sm:w-auto"
                >
                    <TabsList className="grid grid-cols-4 w-full sm:w-[240px]">
                        <TabsTrigger value="7d" className="text-xs">
                            7d
                        </TabsTrigger>
                        <TabsTrigger value="30d" className="text-xs">
                            30d
                        </TabsTrigger>
                        <TabsTrigger value="90d" className="text-xs">
                            90d
                        </TabsTrigger>
                        <TabsTrigger value="all" className="text-xs">
                            All
                        </TabsTrigger>
                    </TabsList>
                </Tabs>
            </CardHeader>
            <CardContent>
                <div className="h-[200px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart
                            data={chartData}
                            margin={{ top: 5, right: 10, left: 0, bottom: 0 }}
                        >
                            <defs>
                                <linearGradient id="colorRate" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.1} />
                                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid
                                strokeDasharray="3 3"
                                vertical={false}
                                stroke="#f1f5f9"
                            />
                            <XAxis
                                dataKey="date"
                                axisLine={false}
                                tickLine={false}
                                tick={{ fontSize: 10, fill: '#64748b' }}
                                minTickGap={40}
                            />
                            <YAxis
                                axisLine={false}
                                tickLine={false}
                                tick={{ fontSize: 10, fill: '#64748b' }}
                                domain={[0, 100]}
                                unit="%"
                            />
                            <Tooltip
                                contentStyle={{
                                    borderRadius: '12px',
                                    border: 'none',
                                    boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                                    fontSize: '12px',
                                }}
                            />
                            <Area
                                type="monotone"
                                dataKey="rate"
                                name="Completion Rate"
                                stroke="#10b981"
                                strokeWidth={2}
                                fillOpacity={1}
                                fill="url(#colorRate)"
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </CardContent>
        </Card>
    );
};
