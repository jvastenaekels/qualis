import type {
    DumpParticipant,
    DumpResponse,
    DumpStatement,
} from '@/components/admin/dashboard/InteractiveDataView';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    Clock,
    Globe,
    Trash2,
    Eye,
    Link as LinkIcon,
    MessageSquare,
    CheckCircle2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { ParticipantGridView } from './charts/ParticipantGridView';

// Helper to reconstruct Q-Sort
const getReconstructedQSort = (participant: DumpParticipant, studyData: DumpResponse) => {
    if (!studyData?.study?.statements) return [];

    // Group statements by score
    const piles: Record<number, DumpStatement[]> = {};

    participant.scores.forEach((score, index) => {
        if (score === null || score === undefined) return;
        if (!piles[score]) piles[score] = [];
        const _statement = studyData.study.statements.find(
            (s) => s.id === studyData.study.statements[index].id
        ); // Re-find to be safe or use index
        // Actually studyData.study.statements[index] maps to participant.scores[index] if arrays are aligned.
        // The original logic relied on array index alignment.
        // Let's use the statements array directly if indices align, which they should for dump format.
        if (studyData.study.statements[index]) {
            piles[score].push(studyData.study.statements[index]);
        }
    });

    // Convert to array and sort by score
    return Object.entries(piles)
        .map(([score, statements]) => ({
            score: Number(score),
            statements,
        }))
        .sort((a, b) => a.score - b.score);
};

interface ParticipantDetailContentProps {
    participant: DumpParticipant;
    studyData: DumpResponse;
    onToggleDiscard: (isDiscarded: boolean) => void;
    isDiscardPending?: boolean;
}

export function ParticipantDetailContent({
    participant,
    studyData,
    onToggleDiscard,
    isDiscardPending,
}: ParticipantDetailContentProps) {
    const { t } = useTranslation();

    // Extract recruitment token from presort if available
    // Assuming it's in presort_answers keyed by '_recruitment_token' or we check the Participant model logic
    // But DumpParticipant has 'presort' as Record<string, string>.
    // Let's check keys for something that looks like a token if needed, or if backend dumps it specifically.
    // The current backend dump might not include the hidden '_recruitment_token' in the 'presort' map unless we exposed it.
    // Check earlier backend changes: we modify `presort_answers`.
    // Functional check: logic in `StudyService` saves it to `presort_answers`.
    // `DumpParticipant` has `presort` which comes from that.
    // So `participant.presort['_recruitment_token']` should exist if it was saved.
    const recruitmentToken = participant.presort?._recruitment_token;

    return (
        <div className="flex-1 p-4 sm:p-8 pt-6 space-y-8 text-slate-900 overflow-y-auto">
            {/* Header / Identity */}
            <div className="flex flex-col gap-4">
                <div className="flex items-start justify-between">
                    <div>
                        <h2 className="text-2xl font-black flex items-center gap-2 text-slate-900">
                            {t('admin.data.detail.session', 'Session')}
                            <span className="font-mono bg-indigo-600 text-white px-2.5 py-0.5 rounded-lg text-lg shadow-lg shadow-indigo-200">
                                {participant.id.substring(0, 8)}
                            </span>
                            {participant.is_discarded && (
                                <Badge
                                    variant="destructive"
                                    className="ml-2 text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ring-2 ring-red-100 shadow-sm animate-in fade-in zoom-in duration-300"
                                >
                                    {t('admin.data.detail.discarded_badge', 'Discarded')}
                                </Badge>
                            )}
                        </h2>
                        {recruitmentToken && (
                            <div className="mt-2 flex items-center gap-2">
                                <Badge
                                    variant="outline"
                                    className="bg-slate-50 border-indigo-200 text-indigo-700 gap-1.5 py-1 px-2.5 shadow-sm"
                                >
                                    <LinkIcon className="w-3.5 h-3.5" />
                                    <span className="font-mono font-bold tracking-tight">
                                        Token: {recruitmentToken}
                                    </span>
                                </Badge>
                            </div>
                        )}
                    </div>
                </div>
                <p className="text-slate-500 font-medium max-w-lg">
                    {t(
                        'admin.data.detail.description',
                        'Detailed review of participant response data, sorting behavior, and metadata.'
                    )}
                </p>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-white/60 backdrop-blur-md p-5 rounded-2xl border border-white/60 shadow-sm space-y-1 group hover:border-indigo-200 transition-all">
                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5 group-hover:text-indigo-500 transition-colors">
                        <Clock className="w-3.5 h-3.5" />{' '}
                        {t('admin.data.detail.stats.duration', 'Duration')}
                    </div>
                    <div className="text-2xl font-black text-slate-900 font-mono">
                        {participant.duration_seconds
                            ? `${Math.floor(Math.abs(participant.duration_seconds) / 60)}m`
                            : '-'}
                        <span className="text-sm text-slate-400 font-bold ml-1">
                            {participant.duration_seconds
                                ? `${Math.round(Math.abs(participant.duration_seconds) % 60)}s`
                                : ''}
                        </span>
                    </div>
                </div>
                <div className="bg-white/60 backdrop-blur-md p-5 rounded-2xl border border-white/60 shadow-sm space-y-1 group hover:border-indigo-200 transition-all">
                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5 group-hover:text-indigo-500 transition-colors">
                        <Globe className="w-3.5 h-3.5" />{' '}
                        {t('admin.data.detail.stats.language', 'Language')}
                    </div>
                    <div className="text-2xl font-black text-slate-900 uppercase">
                        {participant.language === 'US' ? 'EN' : participant.language}
                    </div>
                </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3 bg-slate-50 p-4 rounded-xl border border-slate-100">
                <Button
                    variant="outline"
                    className={cn(
                        'flex-1 h-11 rounded-lg font-bold transition-all border-slate-200 shadow-sm',
                        participant.is_discarded
                            ? 'text-emerald-600 hover:bg-emerald-50 hover:border-emerald-200 hover:text-emerald-700'
                            : 'text-red-500 hover:bg-red-50 hover:border-red-200 hover:text-red-600'
                    )}
                    onClick={() => onToggleDiscard(!participant.is_discarded)}
                    disabled={isDiscardPending}
                >
                    <Trash2 className="w-4 h-4 mr-2" />
                    {participant.is_discarded
                        ? t('admin.data.detail.actions.restore', 'Restore Participant')
                        : t('admin.data.detail.actions.discard', 'Discard Participant')}
                </Button>
            </div>

            {/* Presort / Survey Data */}
            {participant.presort && Object.keys(participant.presort).length > 0 && (
                <div className="space-y-4">
                    <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide flex items-center gap-2 border-b border-slate-100 pb-2">
                        <CheckCircle2 className="w-4 h-4 text-indigo-500" />
                        {t('admin.data.detail.presort', 'Survey Data')}
                    </h3>
                    <div className="grid gap-3">
                        {Object.entries(participant.presort)
                            .filter(([key]) => !key.startsWith('_'))
                            .map(([key, value]) => (
                                <div
                                    key={key}
                                    className="bg-white p-3 rounded-lg border border-slate-100 shadow-sm"
                                >
                                    <div className="text-xs font-bold text-slate-500 uppercase mb-1">
                                        {key}
                                    </div>
                                    <div className="text-sm text-slate-800">{String(value)}</div>
                                </div>
                            ))}
                    </div>
                </div>
            )}

            {/* Q-Sort Reconstruction */}
            <div className="space-y-4">
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide flex items-center gap-2 border-b border-slate-100 pb-2">
                    <Eye className="w-4 h-4 text-indigo-500" />
                    {t('admin.data.detail.sort_config', 'Sort Re-construction')}
                </h3>

                <ParticipantGridView
                    participant={participant}
                    studyData={studyData}
                    className="mb-8"
                />

                <div className="space-y-6 relative before:absolute before:left-3.5 before:top-4 before:bottom-4 before:w-0.5 before:bg-slate-200 before:-z-10">
                    {getReconstructedQSort(participant, studyData).map((pile) => (
                        <div key={pile.score} className="relative pl-10 group">
                            {/* Score Indicator */}
                            <div
                                className={cn(
                                    'absolute left-0 top-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shadow-sm border-2 z-10 bg-white',
                                    pile.score > 0
                                        ? 'bg-green-50 text-green-700 border-green-200'
                                        : pile.score < 0
                                          ? 'bg-red-50 text-red-700 border-red-200'
                                          : 'bg-slate-50 text-slate-700 border-slate-200'
                                )}
                            >
                                {pile.score > 0 ? `+${pile.score}` : pile.score}
                            </div>

                            {/* Statements Pile */}
                            <div className="space-y-2">
                                {pile.statements.map((statement) => (
                                    <div
                                        key={statement.id}
                                        className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm text-sm text-slate-700 leading-relaxed hover:border-indigo-300 hover:shadow-md transition-all relative"
                                    >
                                        <span className="text-[10px] font-bold text-slate-400 absolute top-1.5 right-2 opacity-50 select-none">
                                            #{statement.id}
                                        </span>
                                        {/* Assuming first translation is main language or checking lang */}
                                        {statement.translations[0]?.text ||
                                            `[Statement ${statement.id}]`}
                                    </div>
                                ))}
                                {pile.statements.length === 0 && (
                                    <div className="text-xs text-slate-400 italic pl-1">
                                        Empty pile
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Post-Sort / Debrief */}
            {participant.postsort && Object.keys(participant.postsort).length > 0 && (
                <div className="space-y-4 pt-4 border-t border-slate-100">
                    <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide flex items-center gap-2">
                        <MessageSquare className="w-4 h-4 text-indigo-500" />
                        {t('admin.data.detail.postsort', 'Debrief / Comments')}
                    </h3>
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 italic text-slate-700 text-sm">
                        {Object.entries(participant.postsort).map(([key, value]) => (
                            <div key={key} className="mb-2 last:mb-0">
                                <span className="font-semibold not-italic text-slate-500 mr-2">
                                    {key}:
                                </span>
                                {String(value)}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
