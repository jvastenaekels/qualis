import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type {
    DumpParticipant,
    DumpResponse,
} from '@/components/admin/dashboard/InteractiveDataView';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface ParticipantGridViewProps {
    participant: DumpParticipant;
    studyData: DumpResponse;
    className?: string;
}

export const ParticipantGridView = ({
    participant,
    studyData,
    className,
}: ParticipantGridViewProps) => {
    const { t } = useTranslation();
    const gridData = useMemo(() => {
        if (!studyData?.study?.grid_config || !participant.scores) return null;

        const gridConfig = studyData.study.grid_config;
        const statements = studyData.study.statements;

        // Map scores to statements
        const scores = participant.scores;
        const placements: Record<number, any[]> = {};

        scores.forEach((score, index) => {
            if (score === null || score === undefined) return;
            if (!placements[score]) placements[score] = [];
            placements[score].push(statements[index]);
        });

        // Get unique sorted scores from config
        const sortedColumnScores = Object.keys(gridConfig)
            .map(Number)
            .sort((a, b) => a - b);

        return {
            columns: sortedColumnScores.map((score) => ({
                score,
                statements: placements[score] || [],
                // biome-ignore lint/suspicious/noExplicitAny: API type mismatch
                maxAllowed: (gridConfig as Record<string, number>)[String(score)],
            })),
            // biome-ignore lint/suspicious/noExplicitAny: API type mismatch
            maxHeight: Math.max(...Object.values(gridConfig as any).map((v) => Number(v))),
        };
    }, [participant, studyData]);

    if (!gridData) return null;

    return (
        <Card className={cn('overflow-hidden border-none shadow-none bg-transparent', className)}>
            <CardHeader className="px-0 pt-0">
                <CardTitle className="text-sm font-bold uppercase tracking-wider text-slate-500">
                    {t('admin.analytics.charts.participant_grid.title')}
                </CardTitle>
            </CardHeader>
            <CardContent className="px-0 pb-0">
                <div className="flex justify-center items-end gap-1.5 min-h-[150px] overflow-x-auto pb-4 pt-10">
                    <TooltipProvider>
                        {gridData.columns.map((col) => (
                            <div
                                key={col.score}
                                className="flex flex-col-reverse gap-1 items-center"
                            >
                                {/* Score Label */}
                                <div
                                    className={cn(
                                        'mt-3 text-[10px] font-black w-7 h-7 rounded-lg flex items-center justify-center border shadow-sm',
                                        col.score > 0
                                            ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                                            : col.score < 0
                                              ? 'bg-rose-50 text-rose-700 border-rose-100'
                                              : 'bg-slate-50 text-slate-600 border-slate-100'
                                    )}
                                >
                                    {col.score > 0 ? `+${col.score}` : col.score}
                                </div>

                                {/* Statement Slots */}
                                {Array.from({ length: col.maxAllowed }).map((_, i) => {
                                    const statement = col.statements[i];
                                    return (
                                        <Tooltip key={i}>
                                            <TooltipTrigger asChild>
                                                <div
                                                    className={cn(
                                                        'w-7 h-7 rounded-sm border transition-all duration-300',
                                                        statement
                                                            ? 'bg-indigo-600 border-indigo-700 shadow-sm cursor-help hover:scale-110 active:scale-95 z-10'
                                                            : 'bg-slate-50 border-slate-200 border-dashed'
                                                    )}
                                                />
                                            </TooltipTrigger>
                                            {statement && (
                                                <TooltipContent
                                                    side="top"
                                                    className="max-w-xs p-3 bg-slate-900 border-slate-800 text-white rounded-xl shadow-2xl"
                                                >
                                                    <p className="text-[10px] font-black uppercase text-indigo-400 mb-1">
                                                        {t(
                                                            'admin.analytics.charts.participant_grid.statement_code',
                                                            { code: statement.code }
                                                        )}
                                                    </p>
                                                    <p className="text-xs font-medium leading-relaxed">
                                                        {statement.translations?.[0]?.text ||
                                                            t(
                                                                'admin.analytics.charts.participant_grid.no_text'
                                                            )}
                                                    </p>
                                                </TooltipContent>
                                            )}
                                        </Tooltip>
                                    );
                                })}
                            </div>
                        ))}
                    </TooltipProvider>
                </div>
            </CardContent>
        </Card>
    );
};
