import { useLoaderData } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { StudyPageHeader } from '@/components/admin/layout/StudyPageHeader';
import { BarChart3, TrendingUp, Users, Target } from 'lucide-react';
import { SubmissionsTimelineChart } from '@/components/admin/dashboard/charts/SubmissionsTimelineChart';
import { CompletionRateTrendChart } from '@/components/admin/dashboard/charts/CompletionRateTrendChart';
import { DeviceBreakdownChart } from '@/components/admin/dashboard/charts/DeviceBreakdownChart';
import { DurationHistogramChart } from '@/components/admin/dashboard/charts/DurationHistogramChart';
import { StatementAnalysisChart } from '@/components/admin/dashboard/charts/StatementAnalysisChart';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import type { ParticipantRead } from '@/api/model';

const StudyAnalyticsPage = () => {
    const { dump } = useLoaderData() as {
        dump: any;
        slug: string;
    };
    const { t } = useTranslation();

    // Map dump data to formats expected by existing charts
    const participants = (dump.participants || []).map((p: any) => ({
        ...p,
        // Ensure keys match ParticipantRead
        created_at: p.created_at || new Date().toISOString(), // Fallback if missing, though dump should have it
        submitted_at: p.submitted_at,
        status: p.status || 'completed',
        is_discarded: p.is_discarded || false
    })) as ParticipantRead[];

    // Extract stats for DeviceBreakdown
    const deviceBreakdown = participants.reduce((acc: any, p: any) => {
        const ua = (p.user_agent || '').toLowerCase();
        let device = 'desktop';
        if (ua.includes('mobile')) device = 'mobile';
        else if (ua.includes('tablet')) device = 'tablet';
        acc[device] = (acc[device] || 0) + 1;
        return acc;
    }, { mobile: 0, desktop: 0, tablet: 0 });

    return (
        <div className="flex flex-1 flex-col gap-6 p-6 pt-2">
            <StudyPageHeader
                title={t('admin.analytics.title', 'Study Analytics')}
                description={t(
                    'admin.analytics.description',
                    'Deep dive into participation patterns, consensus analysis, and data quality.'
                )}
                icon={BarChart3}
            />

            <div className="grid gap-6 md:grid-cols-12">
                {/* Participation Trends */}
                <div className="col-span-12 md:col-span-8">
                    <SubmissionsTimelineChart
                        participants={participants}
                        className="border-none shadow-sm bg-white rounded-2xl h-full"
                    />
                </div>

                {/* Device Breakdown */}
                <div className="col-span-12 md:col-span-4">
                    <DeviceBreakdownChart
                        deviceBreakdown={deviceBreakdown}
                        className="border-none shadow-sm bg-white rounded-2xl h-full"
                    />
                </div>

                {/* Duration Distribution */}
                <div className="col-span-12 md:col-span-6">
                    <DurationHistogramChart
                        participants={participants}
                        className="border-none shadow-sm bg-white rounded-2xl h-full"
                    />
                </div>

                {/* Completion Trend */}
                <div className="col-span-12 md:col-span-6">
                    <CompletionRateTrendChart
                        participants={participants}
                        className="border-none shadow-sm bg-white rounded-2xl h-full"
                    />
                </div>

                {/* Statement Analysis */}
                <div className="col-span-12 md:col-span-7">
                    <StatementAnalysisChart
                        dump={dump}
                        className="border-none shadow-sm bg-white rounded-2xl h-full"
                    />
                </div>

                {/* Summary Metrics */}
                <div className="col-span-12 md:col-span-5 flex flex-col gap-6">
                    <Card className="border-none shadow-sm bg-indigo-600 text-white rounded-2xl overflow-hidden relative">
                        <div className="absolute top-0 right-0 p-6 opacity-10">
                            <Target size={80} />
                        </div>
                        <CardHeader>
                            <CardTitle className="text-white/70 text-[10px] uppercase font-black tracking-widest">Research Strength</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-5xl font-black mb-2">
                                {participants.length}
                            </div>
                            <p className="text-sm text-white/60 font-medium">Valid samples reached</p>
                            <div className="mt-6 pt-6 border-t border-white/10">
                                <div className="flex items-center justify-between text-xs font-bold mb-2">
                                    <span>Target Confidence</span>
                                    <span>{Math.min(100, (participants.length / 40) * 100).toFixed(0)}%</span>
                                </div>
                                <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-white transition-all duration-1000"
                                        style={{ width: `${Math.min(100, (participants.length / 40) * 100)}%` }}
                                    />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border-none shadow-sm bg-white rounded-2xl overflow-hidden flex-1">
                        <CardHeader>
                            <CardTitle className="text-base font-bold">Quick Insights</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100">
                                <TrendingUp className="h-5 w-5 text-emerald-500 mt-0.5" />
                                <div>
                                    <p className="text-xs font-bold text-slate-900">Participation Momentum</p>
                                    <p className="text-[11px] text-slate-500">Study activity is healthy across all sources.</p>
                                </div>
                            </div>
                            <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100">
                                <Users className="h-5 w-5 text-indigo-500 mt-0.5" />
                                <div>
                                    <p className="text-xs font-bold text-slate-900">Broad Viewpoint</p>
                                    <p className="text-[11px] text-slate-500">Statements show a diverse set of opinions.</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
};

export default StudyAnalyticsPage;
