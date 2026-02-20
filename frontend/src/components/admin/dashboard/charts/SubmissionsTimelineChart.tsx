import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface TimelineParticipant {
    created_at?: string;
    submitted_at?: string;
}

interface SubmissionsTimelineChartProps {
    participants: TimelineParticipant[];
    className?: string;
}

type TimeRange = '7d' | '30d' | '90d' | 'all';

export const SubmissionsTimelineChart = ({
    participants,
    className,
}: SubmissionsTimelineChartProps) => {
    const { t } = useTranslation();
    const [range, setRange] = useState<TimeRange>('all');

    const chartData = useMemo(() => {
        if (!participants || participants.length === 0) return [];

        // 1. Determine date range
        const dates = participants.map((p) => parseISO(p.created_at as unknown as string));
        const minDate = new Date(Math.min(...dates.map((d) => d.getTime())));
        const maxDate = new Date(); // Use today as max

        let startDate = minDate;
        if (range === '7d') startDate = subDays(maxDate, 7);
        else if (range === '30d') startDate = subDays(maxDate, 30);
        else if (range === '90d') startDate = subDays(maxDate, 90);

        // Ensure we don't go before minDate if using "all"
        if (range === 'all') startDate = startOfDay(minDate);
        else startDate = startOfDay(startDate);

        const interval = eachDayOfInterval({
            start: startDate,
            end: endOfDay(maxDate),
        });

        // 2. Aggregate counts per day
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

            return {
                date: format(day, 'MMM dd'),
                fullDate: format(day, 'PPPP'),
                started: dayStarted,
                completed: dayCompleted,
            };
        });
    }, [participants, range]);

    if (!participants || participants.length === 0) {
        return null;
    }

    return (
        <Card className={className}>
            <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between space-y-2 sm:space-y-0 pb-2">
                <div className="space-y-1">
                    <CardTitle className="text-base font-bold flex items-center gap-2">
                        {t('admin.dashboard.timeline.title', 'Submissions Timeline')}
                    </CardTitle>
                    <CardDescription>
                        {t('admin.dashboard.timeline.subtitle', 'Daily participation trends')}
                    </CardDescription>
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
                            {t('common.all', 'All')}
                        </TabsTrigger>
                    </TabsList>
                </Tabs>
            </CardHeader>
            <CardContent>
                <div className="h-[200px] sm:h-[250px] md:h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                        <LineChart
                            data={chartData}
                            margin={{ top: 5, right: 10, left: 0, bottom: 0 }}
                        >
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
                                minTickGap={30}
                            />
                            <YAxis
                                axisLine={false}
                                tickLine={false}
                                tick={{ fontSize: 10, fill: '#64748b' }}
                            />
                            <Tooltip
                                contentStyle={{
                                    borderRadius: '12px',
                                    border: 'none',
                                    boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                                    fontSize: '12px',
                                }}
                                cursor={{ stroke: '#e2e8f0', strokeWidth: 2 }}
                            />
                            <Legend
                                verticalAlign="top"
                                align="right"
                                iconType="circle"
                                wrapperStyle={{
                                    paddingBottom: '20px',
                                    fontSize: '12px',
                                    fontWeight: 600,
                                }}
                            />
                            <Line
                                type="monotone"
                                dataKey="started"
                                name={t('admin.dashboard.timeline.started', 'Started')}
                                stroke="#f59e0b"
                                strokeWidth={3}
                                dot={{
                                    fill: '#f59e0b',
                                    r: 3,
                                    strokeWidth: 2,
                                    stroke: '#fff',
                                }}
                                activeDot={{ r: 6, strokeWidth: 0 }}
                            />
                            <Line
                                type="monotone"
                                dataKey="completed"
                                name={t('admin.dashboard.timeline.completed', 'Completed')}
                                stroke="#10b981"
                                strokeWidth={3}
                                dot={{
                                    fill: '#10b981',
                                    r: 3,
                                    strokeWidth: 2,
                                    stroke: '#fff',
                                }}
                                activeDot={{ r: 6, strokeWidth: 0 }}
                            />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </CardContent>
        </Card>
    );
};
