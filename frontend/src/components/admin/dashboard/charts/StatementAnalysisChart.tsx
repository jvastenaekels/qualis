import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Info, AlertCircle, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatementAnalysisChartProps {
    dump: any; // The full study dump
    className?: string;
}

type AnalysisMode = 'consensus' | 'controversy';

export const StatementAnalysisChart = ({ dump, className }: StatementAnalysisChartProps) => {
    const [mode, setMode] = useState<AnalysisMode>('consensus');

    const analysisData = useMemo(() => {
        if (!dump || !dump.participants) return [];

        const statements = dump.study.statements;
        const participants = dump.participants;

        const results = statements
            .map((s: any, idx: number) => {
                const scores = participants
                    .map((p: any) => p.scores[idx])
                    .filter((s: any) => s !== null);

                if (scores.length === 0) return null;

                // Calculate Mean
                const mean = scores.reduce((a: number, b: number) => a + b, 0) / scores.length;

                // Calculate Variance
                const variance =
                    scores.reduce((a: number, b: number) => a + (b - mean) ** 2, 0) / scores.length;
                const stdDev = Math.sqrt(variance);

                // Get text translation (defaulting to first available)
                const text = s.translations?.[0]?.text || s.code;

                return {
                    id: s.id,
                    code: s.code,
                    text: text,
                    mean: mean,
                    stdDev: stdDev,
                    variance: variance,
                    count: scores.length,
                };
            })
            .filter(Boolean);

        if (mode === 'consensus') {
            // Consensual = Lowest StdDev (everyone agrees)
            return [...results].sort((a, b) => a.stdDev - b.stdDev).slice(0, 6);
        } else {
            // Controversial = Highest StdDev (people disagree)
            return [...results].sort((a, b) => b.stdDev - a.stdDev).slice(0, 6);
        }
    }, [dump, mode]);

    if (!dump || analysisData.length === 0) return null;

    return (
        <Card className={className}>
            <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between space-y-2 sm:space-y-0 pb-6">
                <div>
                    <CardTitle className="text-base font-bold flex items-center gap-2">
                        Statement Agreement
                        {mode === 'consensus' ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        ) : (
                            <AlertCircle className="h-4 w-4 text-amber-500" />
                        )}
                    </CardTitle>
                    <CardDescription>
                        {mode === 'consensus'
                            ? 'High consensus (shared perspective)'
                            : 'High controversy (diverging views)'}
                    </CardDescription>
                </div>
                <Tabs
                    value={mode}
                    onValueChange={(v) => setMode(v as AnalysisMode)}
                    className="w-full sm:w-auto"
                >
                    <TabsList className="grid grid-cols-2 w-full sm:w-[220px]">
                        <TabsTrigger value="consensus" className="text-[10px] font-bold">
                            Consensus
                        </TabsTrigger>
                        <TabsTrigger value="controversy" className="text-[10px] font-bold">
                            Controversy
                        </TabsTrigger>
                    </TabsList>
                </Tabs>
            </CardHeader>
            <CardContent>
                <div className="space-y-6">
                    {analysisData.map((item, _index) => (
                        <div key={item.id} className="space-y-2">
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex gap-3">
                                    <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-[10px] font-black text-slate-500 border border-slate-200">
                                        {item.code}
                                    </div>
                                    <p className="text-xs font-medium text-slate-700 leading-relaxed line-clamp-2">
                                        {item.text}
                                    </p>
                                </div>
                                <div className="text-right flex-shrink-0">
                                    <div className="text-xs font-black text-slate-900">
                                        Avg: {item.mean.toFixed(1)}
                                    </div>
                                    <div className="text-[10px] font-medium text-slate-400">
                                        SD: {item.stdDev.toFixed(2)}
                                    </div>
                                </div>
                            </div>
                            <div className="relative h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                                {/* Gauge indicating Consensus/Controversy intensity */}
                                <div
                                    className={cn(
                                        'absolute h-full transition-all duration-1000',
                                        mode === 'consensus' ? 'bg-emerald-500' : 'bg-amber-500'
                                    )}
                                    style={{
                                        width:
                                            mode === 'consensus'
                                                ? `${Math.max(10, 100 - item.stdDev * 25)}%`
                                                : `${Math.min(100, item.stdDev * 25)}%`,
                                    }}
                                />
                            </div>
                        </div>
                    ))}
                </div>
                <div className="mt-6 p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center gap-2 text-[10px] text-slate-500 italic">
                    <Info size={14} className="text-slate-400 flex-shrink-0" />
                    Standard deviation (SD) indicates how much participants' rankings varied for
                    each statement.
                </div>
            </CardContent>
        </Card>
    );
};
