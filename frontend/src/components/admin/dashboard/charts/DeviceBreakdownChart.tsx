import { useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Monitor, Smartphone, Tablet, HelpCircle } from 'lucide-react';

interface DeviceBreakdownChartProps {
    deviceBreakdown: Record<string, number>;
    className?: string;
}

const COLORS = {
    desktop: '#4f46e5', // Indigo
    mobile: '#10b981', // Emerald
    tablet: '#f59e0b', // Amber
    unknown: '#94a3b8', // Slate
};

const ICON_MAP = {
    desktop: Monitor,
    mobile: Smartphone,
    tablet: Tablet,
    unknown: HelpCircle,
};

export const DeviceBreakdownChart = ({ deviceBreakdown, className }: DeviceBreakdownChartProps) => {
    const data = useMemo(() => {
        if (!deviceBreakdown) return [];

        return Object.entries(deviceBreakdown)
            .map(([device, count]) => ({
                name: device.charAt(0).toUpperCase() + device.slice(1),
                key: device.toLowerCase(),
                value: count,
            }))
            .filter((item) => item.value > 0)
            .sort((a, b) => b.value - a.value);
    }, [deviceBreakdown]);

    const total = useMemo(() => data.reduce((sum, item) => sum + item.value, 0), [data]);

    if (!deviceBreakdown || total === 0) {
        return null;
    }

    return (
        <Card className={className}>
            <CardHeader className="pb-2">
                <CardTitle className="text-base font-bold">Device Distribution</CardTitle>
                <CardDescription>How participants access your study</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="flex flex-col items-center">
                    <div className="h-[200px] w-full mt-2">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={data}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={80}
                                    paddingAngle={5}
                                    dataKey="value"
                                >
                                    {data.map((entry) => (
                                        <Cell
                                            key={`cell-${entry.key}`}
                                            fill={
                                                COLORS[entry.key as keyof typeof COLORS] ||
                                                COLORS.unknown
                                            }
                                            stroke="none"
                                        />
                                    ))}
                                </Pie>
                                <Tooltip
                                    contentStyle={{
                                        borderRadius: '12px',
                                        border: 'none',
                                        boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                                        fontSize: '12px',
                                    }}
                                    itemStyle={{ fontWeight: 600 }}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>

                    <div className="grid grid-cols-2 gap-4 w-full mt-4">
                        {data.map((item) => {
                            const Icon = ICON_MAP[item.key as keyof typeof ICON_MAP] || HelpCircle;
                            const percentage = Math.round((item.value / total) * 100);
                            const color = COLORS[item.key as keyof typeof COLORS] || COLORS.unknown;

                            return (
                                <div
                                    key={item.key}
                                    className="flex items-center gap-2 p-2 rounded-xl bg-slate-50/50 border border-slate-100/50"
                                >
                                    <div
                                        className="p-1.5 rounded-lg text-white"
                                        style={{ backgroundColor: color }}
                                    >
                                        <Icon size={14} />
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                                            {item.name}
                                        </span>
                                        <div className="flex items-baseline gap-1">
                                            <span className="text-sm font-bold text-slate-900">
                                                {item.value}
                                            </span>
                                            <span className="text-[10px] font-medium text-slate-400">
                                                {percentage}%
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
};
