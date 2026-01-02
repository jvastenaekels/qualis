import type React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Users, CheckCircle2, Clock, Smartphone, AlertTriangle, MousePointer2 } from 'lucide-react';
// biome-ignore lint/suspicious/noExplicitAny: stats type refinement
const HealthDashboard: React.FC<{ stats: any }> = ({ stats }) => {
    const completionPercentage = Math.round(stats.completion_rate * 100);

    // Formatting duration
    const formatDuration = (seconds: number | null | undefined) => {
        if (seconds === null || seconds === undefined) return '--';
        const minutes = Math.floor(seconds / 60);
        if (minutes === 0) return `${Math.round(seconds)}s`;
        return `${minutes}m ${Math.round(seconds % 60)}s`;
    };

    const deviceTotal = stats.device_breakdown?.mobile + stats.device_breakdown?.desktop || 0;
    const mobilePercentage =
        deviceTotal > 0 ? Math.round((stats.device_breakdown.mobile / deviceTotal) * 100) : 0;

    return (
        <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {/* Total Participants */}
                <Card className="overflow-hidden border-none shadow-md bg-white">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 bg-slate-50/50">
                        <CardTitle className="text-sm font-medium text-slate-500 uppercase tracking-wider">
                            Total Reach
                        </CardTitle>
                        <Users className="h-4 w-4 text-indigo-500" />
                    </CardHeader>
                    <CardContent className="pt-4">
                        <div className="text-3xl font-bold text-slate-900">
                            {stats.started_count}
                        </div>
                        <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                            Individual unique sessions
                        </p>
                    </CardContent>
                </Card>

                {/* Completion Rate */}
                <Card className="overflow-hidden border-none shadow-md bg-white">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 bg-slate-50/50">
                        <CardTitle className="text-sm font-medium text-slate-500 uppercase tracking-wider">
                            Conversion
                        </CardTitle>
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    </CardHeader>
                    <CardContent className="pt-4">
                        <div className="text-3xl font-bold text-emerald-600">
                            {completionPercentage}%
                        </div>
                        <div className="mt-4 flex flex-col gap-1.5">
                            <div className="flex justify-between text-[10px] font-bold text-slate-400 uppercase">
                                <span>{stats.completed_count} Completed</span>
                                <span>{100 - completionPercentage}% Drop-off</span>
                            </div>
                            <Progress
                                value={completionPercentage}
                                className="h-1.5 bg-emerald-50"
                            />
                        </div>
                    </CardContent>
                </Card>

                {/* Median Duration */}
                <Card className="overflow-hidden border-none shadow-md bg-white">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 bg-slate-50/50">
                        <CardTitle className="text-sm font-medium text-slate-500 uppercase tracking-wider">
                            Avg. Effort
                        </CardTitle>
                        <Clock className="h-4 w-4 text-amber-500" />
                    </CardHeader>
                    <CardContent className="pt-4">
                        <div className="text-3xl font-bold text-slate-900">
                            {formatDuration(stats.median_duration_seconds)}
                        </div>
                        <p className="text-xs text-slate-400 mt-1">Median time to complete</p>
                        {stats.median_duration_seconds && stats.median_duration_seconds < 120 && (
                            <div className="mt-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 text-[10px] font-bold uppercase ring-1 ring-amber-200">
                                <AlertTriangle size={10} /> Fast suspect
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Device Breakdown */}
                <Card className="overflow-hidden border-none shadow-md bg-white">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 bg-slate-50/50">
                        <CardTitle className="text-sm font-medium text-slate-500 uppercase tracking-wider">
                            Device Split
                        </CardTitle>
                        <Smartphone className="h-4 w-4 text-sky-500" />
                    </CardHeader>
                    <CardContent className="pt-4">
                        <div className="flex items-end gap-2 mb-2">
                            <span className="text-3xl font-bold text-slate-900">
                                {mobilePercentage}%
                            </span>
                            <span className="text-xs text-slate-400 pb-1 font-medium">
                                Mobile Traffic
                            </span>
                        </div>
                        <div className="flex w-full h-1.5 rounded-full overflow-hidden bg-slate-100">
                            <div
                                className="h-full bg-sky-400 transition-all"
                                style={{ width: `${mobilePercentage}%` }}
                            />
                            <div
                                className="h-full bg-slate-300 transition-all"
                                style={{ width: `${100 - mobilePercentage}%` }}
                            />
                        </div>
                        <div className="flex justify-between mt-2 text-[10px] font-bold text-slate-400 uppercase">
                            <span className="flex items-center gap-1">
                                <Smartphone size={10} /> {stats.device_breakdown?.mobile || 0}
                            </span>
                            <span className="flex items-center gap-1">
                                <MousePointer2 size={10} /> {stats.device_breakdown?.desktop || 0}
                            </span>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
};

export default HealthDashboard;
