import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Info, Loader2, AlertTriangle, Mic } from 'lucide-react';
import type { ParticipantLoading } from '@/api/model/participantLoading';
import { useListAudiosForParticipantsApiAdminStudiesSlugAnalysisAudiosGet } from '@/api/generated';

interface FactorVoicesPanelProps {
    slug: string;
    factorIndex: number;
    participants: ParticipantLoading[];
}

export function FactorVoicesPanel({ slug, factorIndex, participants }: FactorVoicesPanelProps) {
    const { t } = useTranslation();
    const [tooltipOpen, setTooltipOpen] = useState(false);

    // Factor numbers are 1-indexed in flagged_factors; factorIndex is 0-indexed
    const factorNumber = factorIndex + 1;

    // Filter to participants flagged on this factor
    const flaggedParticipants = participants.filter((p) =>
        (p.flagged_factors ?? []).includes(factorNumber)
    );

    const participantIds = flaggedParticipants.map((p) => p.db_id).join(',');

    const audiosQuery = useListAudiosForParticipantsApiAdminStudiesSlugAnalysisAudiosGet(
        slug,
        { participant_ids: participantIds },
        {
            query: {
                enabled: !!slug && flaggedParticipants.length > 0,
            },
        }
    );

    // Group recordings by participant db_id
    const recordingsByParticipant = new Map<number, typeof audiosQuery.data>();
    if (audiosQuery.data) {
        for (const rec of audiosQuery.data) {
            const existing = recordingsByParticipant.get(rec.participant_db_id);
            if (existing) {
                existing.push(rec);
            } else {
                recordingsByParticipant.set(rec.participant_db_id, [rec]);
            }
        }
    }

    // Only show participants that have at least one recording
    const participantsWithAudio = flaggedParticipants.filter(
        (p) => (recordingsByParticipant.get(p.db_id) ?? []).length > 0
    );

    const hasNoAudio =
        audiosQuery.isSuccess &&
        (flaggedParticipants.length === 0 || participantsWithAudio.length === 0);

    return (
        <div className="mt-5 border border-slate-100 rounded-xl bg-slate-50/60 p-4 space-y-3">
            {/* Header row */}
            <div className="flex items-center gap-2">
                <Mic className="size-4 text-slate-500" aria-hidden="true" />
                <h3 className="text-sm font-black text-slate-700">
                    {t('admin.analysis.factor_voices.title', 'Voices on Factor {{n}}', {
                        n: factorNumber,
                    })}
                </h3>

                {/* Critical Q context tooltip */}
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
                                'In critical Q-methodology (Sneegas 2020), grounding factor interpretation in the words of the people who define each factor is part of the analytical practice.'
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Loading state */}
            {audiosQuery.isLoading && (
                <div
                    className="flex items-center gap-2 text-sm text-slate-400 py-2"
                    role="status"
                    aria-live="polite"
                >
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    {t('admin.analysis.factor_voices.loading', 'Loading recordings…')}
                </div>
            )}

            {/* Error state */}
            {audiosQuery.isError && (
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

            {/* Empty state: no flagged participants OR none with recordings */}
            {hasNoAudio && (
                <p className="text-xs text-slate-400 italic py-1">
                    {t(
                        'admin.analysis.factor_voices.no_audio',
                        'No post-sort audio recordings from participants flagged on this factor.'
                    )}
                </p>
            )}

            {/* Participant recording cards */}
            {audiosQuery.isSuccess && participantsWithAudio.length > 0 && (
                <div className="space-y-3">
                    {participantsWithAudio.map((participant) => {
                        const recordings = recordingsByParticipant.get(participant.db_id) ?? [];
                        return (
                            <div
                                key={participant.db_id}
                                className="bg-white rounded-lg border border-slate-200 p-3 space-y-2"
                            >
                                <p className="text-xs font-semibold text-slate-700">
                                    {participant.label}
                                </p>
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
                                                        {
                                                            key: rec.question_key,
                                                            participant: participant.label,
                                                        }
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
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
