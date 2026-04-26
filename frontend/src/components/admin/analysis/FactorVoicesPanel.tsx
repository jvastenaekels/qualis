import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Info, Loader2, AlertTriangle, Mic, MessageSquareText } from 'lucide-react';
import type { ParticipantLoading } from '@/api/model/participantLoading';
import type { ParticipantCardComment } from '@/api/model/participantCardComment';
import type { ParticipantAudioRecording } from '@/api/model/participantAudioRecording';
import {
    useListAudiosForParticipantsApiAdminStudiesSlugAnalysisAudiosGet,
    useListCommentsForParticipantsApiAdminStudiesSlugAnalysisCommentsGet,
} from '@/api/generated';

interface FactorVoicesPanelProps {
    slug: string;
    factorIndex: number;
    participants: ParticipantLoading[];
}

function scoreBadgeClass(score: number): string {
    if (score > 0) return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
    if (score < 0) return 'bg-rose-50 text-rose-700 border border-rose-200';
    return 'bg-slate-50 text-slate-500 border border-slate-200';
}

function formatScore(score: number): string {
    return score > 0 ? `+${score}` : `${score}`;
}

function groupByParticipant<T extends { participant_db_id: number }>(
    items: T[] | undefined
): Map<number, T[]> {
    const map = new Map<number, T[]>();
    if (!items) return map;
    for (const item of items) {
        const existing = map.get(item.participant_db_id);
        if (existing) existing.push(item);
        else map.set(item.participant_db_id, [item]);
    }
    return map;
}

interface ParticipantMaterialCardProps {
    label: string;
    recordings: ParticipantAudioRecording[];
    comments: ParticipantCardComment[];
}

function ParticipantMaterialCard({ label, recordings, comments }: ParticipantMaterialCardProps) {
    const { t } = useTranslation();
    return (
        <div className="bg-white rounded-lg border border-slate-200 p-3 space-y-3">
            <p className="text-xs font-semibold text-slate-700">{label}</p>

            {recordings.length > 0 && (
                <div className="space-y-2">
                    {recordings.map((rec) => (
                        <div key={rec.id} className="space-y-1">
                            <p className="text-2xs text-slate-500 font-medium">
                                {rec.question_key}
                            </p>
                            {rec.presigned_url ? (
                                // biome-ignore lint/a11y/useMediaCaption: research tool — transcripts are not available server-side
                                <audio
                                    controls
                                    src={rec.presigned_url}
                                    className="w-full h-8"
                                    aria-label={t(
                                        'admin.analysis.factor_voices.audio_label',
                                        'Recording: {{key}} by {{participant}}',
                                        { key: rec.question_key, participant: label }
                                    )}
                                />
                            ) : (
                                <p className="text-2xs text-slate-400 italic">
                                    {t(
                                        'admin.analysis.factor_voices.url_unavailable',
                                        'Audio URL not available.'
                                    )}
                                </p>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {comments.length > 0 && (
                <div className="space-y-2">
                    <div className="flex items-center gap-1.5 text-2xs text-slate-500 font-medium">
                        <MessageSquareText className="size-3" aria-hidden="true" />
                        {t('admin.analysis.factor_voices.comments_label', 'Card comments')}
                    </div>
                    <ul className="space-y-2 list-none">
                        {comments.map((c) => (
                            <li
                                key={`${c.statement_id}-${c.participant_db_id}`}
                                className="text-xs"
                            >
                                <div className="flex items-center gap-1.5 mb-0.5">
                                    <span className="font-mono text-slate-500">
                                        {c.statement_code}
                                    </span>
                                    <span
                                        className={`px-1.5 py-0.5 rounded text-2xs font-semibold ${scoreBadgeClass(
                                            c.grid_score
                                        )}`}
                                    >
                                        {formatScore(c.grid_score)}
                                    </span>
                                </div>
                                <p className="text-slate-700 leading-snug">{c.statement_text}</p>
                                <p className="mt-1 text-slate-600 italic leading-snug">
                                    “{c.comment}”
                                </p>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}

export function FactorVoicesPanel({ slug, factorIndex, participants }: FactorVoicesPanelProps) {
    const { t } = useTranslation();
    const [tooltipOpen, setTooltipOpen] = useState(false);

    const factorNumber = factorIndex + 1;
    const flaggedParticipants = participants.filter((p) =>
        (p.flagged_factors ?? []).includes(factorNumber)
    );

    const participantIds = flaggedParticipants.map((p) => p.db_id).join(',');
    const queryEnabled = !!slug && flaggedParticipants.length > 0;

    const audiosQuery = useListAudiosForParticipantsApiAdminStudiesSlugAnalysisAudiosGet(
        slug,
        { participant_ids: participantIds },
        { query: { enabled: queryEnabled } }
    );

    const commentsQuery = useListCommentsForParticipantsApiAdminStudiesSlugAnalysisCommentsGet(
        slug,
        { participant_ids: participantIds },
        { query: { enabled: queryEnabled } }
    );

    const recordingsByParticipant = groupByParticipant(audiosQuery.data);
    const commentsByParticipant = groupByParticipant(commentsQuery.data);

    const participantsWithMaterial = flaggedParticipants.filter(
        (p) =>
            (recordingsByParticipant.get(p.db_id) ?? []).length > 0 ||
            (commentsByParticipant.get(p.db_id) ?? []).length > 0
    );

    const isLoading = audiosQuery.isLoading || commentsQuery.isLoading;
    const isError = audiosQuery.isError || commentsQuery.isError;
    const hasNoMaterial = !isLoading && !isError && participantsWithMaterial.length === 0;

    return (
        <div className="mt-5 border border-slate-100 rounded-xl bg-slate-50/60 p-4 space-y-3">
            <div className="flex items-center gap-2">
                <Mic className="size-4 text-slate-500" aria-hidden="true" />
                <h3 className="text-sm font-black text-slate-700">
                    {t('admin.analysis.factor_voices.title', 'Voices on Factor {{n}}', {
                        n: factorNumber,
                    })}
                </h3>

                <div className="relative">
                    <button
                        type="button"
                        onClick={() => setTooltipOpen((o) => !o)}
                        onBlur={() => setTooltipOpen(false)}
                        className="text-slate-400 hover:text-slate-600 transition-colors"
                        aria-label={t(
                            'admin.analysis.factor_voices.context_aria',
                            'About this panel'
                        )}
                    >
                        <Info className="size-3.5" aria-hidden="true" />
                    </button>
                    {tooltipOpen && (
                        <div className="absolute left-0 top-6 z-20 w-72 rounded-lg bg-white border border-slate-200 shadow-lg p-3 text-xs text-slate-600 leading-relaxed">
                            {t(
                                'admin.analysis.factor_voices.context',
                                "Grounding factor interpretation in participants' own words — their audio rationales and their written card comments — is a core element of careful Q-methodological practice (Watts & Stenner 2012; Sneegas 2020)."
                            )}
                        </div>
                    )}
                </div>
            </div>

            {isLoading && (
                <div
                    className="flex items-center gap-2 text-sm text-slate-400 py-2"
                    role="status"
                    aria-live="polite"
                >
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    {t('admin.analysis.factor_voices.loading', 'Loading recordings…')}
                </div>
            )}

            {isError && (
                <div
                    className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700"
                    role="alert"
                >
                    <AlertTriangle className="size-4 flex-shrink-0" aria-hidden="true" />
                    {t(
                        'admin.analysis.factor_voices.error',
                        'Could not load audio recordings. Please try again.'
                    )}
                </div>
            )}

            {hasNoMaterial && (
                <p className="text-xs text-slate-400 italic py-1">
                    {t(
                        'admin.analysis.factor_voices.no_material',
                        'No post-sort audio recordings or written comments from participants flagged on this factor.'
                    )}
                </p>
            )}

            {!isLoading && !isError && participantsWithMaterial.length > 0 && (
                <div className="space-y-3">
                    {participantsWithMaterial.map((p) => (
                        <ParticipantMaterialCard
                            key={p.db_id}
                            label={p.label}
                            recordings={recordingsByParticipant.get(p.db_id) ?? []}
                            comments={commentsByParticipant.get(p.db_id) ?? []}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
