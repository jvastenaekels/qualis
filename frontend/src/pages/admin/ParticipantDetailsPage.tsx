import { useParams, useNavigate } from 'react-router-dom';
import {
    useGetStudyApiAdminStudiesSlugGet,
    useGetParticipantApiAdminStudiesParticipantsParticipantIdGet,
    useDiscardParticipantApiAdminStudiesParticipantsParticipantIdDiscardPatch,
} from '@/api/generated';
import { StudyPageHeader } from '@/components/admin/layout/StudyPageHeader';
import { Button } from '@/components/ui/button';
import { ArrowLeft, User } from 'lucide-react';
import type {
    DumpResponse,
    DumpParticipant,
} from '@/components/admin/dashboard/InteractiveDataView';
import { ParticipantDetailContent } from '@/components/admin/dashboard/ParticipantDetailContent';
import { useTranslation } from 'react-i18next';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { useMemo } from 'react';
import { useAuthStore } from '@/store/useAuthStore';

export default function ParticipantDetailsPage() {
    const { currentWorkspace } = useAuthStore();
    const { studySlug, participantId } = useParams<{
        slug: string;
        studySlug: string;
        participantId: string;
    }>();
    const effectiveSlug = studySlug || '';
    const navigate = useNavigate();
    const { t } = useTranslation();

    // Fetch Study Info
    const { data: study, isLoading: isStudyLoading } =
        useGetStudyApiAdminStudiesSlugGet(effectiveSlug);

    // Fetch Individual Participant
    const {
        data: participant,
        isLoading: isParticipantLoading,
        error,
        refetch,
    } = useGetParticipantApiAdminStudiesParticipantsParticipantIdGet(Number(participantId), {
        query: {
            enabled: !!participantId && !Number.isNaN(Number(participantId)),
            retry: 1,
        },
    });

    const discardMutation =
        useDiscardParticipantApiAdminStudiesParticipantsParticipantIdDiscardPatch();

    // Adapt data to Match Dump Format expected by ParticipantDetailContent
    const { studyData, participantData } = useMemo(() => {
        if (!study || !participant) return { studyData: null, participantData: null };

        // 1. Adapt Study
        // Sort statements by ID to ensure consistent order for scores array
        const sortedStatements = [...(study.statements || [])].sort((a, b) => a.id - b.id);

        const adaptedStudy: DumpResponse['study'] = {
            slug: study.slug,
            statements: sortedStatements.map((s) => ({
                id: s.id,
                code: s.code,
                translations:
                    s.translations?.map((tr) => ({
                        lang: tr.language_code,
                        text: tr.text,
                    })) || [],
            })),
            translations:
                study.translations?.map((tr) => ({
                    lang: tr.language_code,
                    title: tr.title || '',
                })) || [],
            // biome-ignore lint/suspicious/noExplicitAny: generic cast
            grid_config: study.grid_config as any,
            // biome-ignore lint/suspicious/noExplicitAny: generic cast
            postsort_config: study.postsort_config as any,
            state: study.state || 'draft',
        };

        const studyDump: DumpResponse = {
            study: adaptedStudy,
            participants: [], // Not needed for detail view context usually, or filled below
            statement_id_to_index: sortedStatements.reduce(
                (acc, s, idx) => {
                    acc[s.id] = idx;
                    return acc;
                },
                {} as Record<string, number>
            ),
        };

        // 2. Adapt Participant
        const placements: Record<string, number> = {};
        participant.qsort_entries?.forEach((entry) => {
            placements[entry.statement_id] = entry.grid_score;
        });

        const scores: (number | null)[] = sortedStatements.map((s) => {
            return placements[s.id] !== undefined ? placements[s.id] : null;
        });

        const adaptedParticipant: DumpParticipant & {
            user_agent?: string;
            created_at?: string;
            ip_address?: string;
        } = {
            id: participant.session_token,
            db_id: participant.id,
            duration_seconds:
                participant.submitted_at && participant.created_at
                    ? Math.floor(
                          (new Date(participant.submitted_at).getTime() -
                              new Date(participant.created_at).getTime()) /
                              1000
                      )
                    : null,
            scores,
            placements,
            // biome-ignore lint/suspicious/noExplicitAny: generic cast
            presort: (participant.presort_answers as any) || {},
            // biome-ignore lint/suspicious/noExplicitAny: generic cast
            postsort: (participant.postsort_answers as any) || {},
            language: participant.language_used || 'en',
            is_discarded: participant.is_discarded,
            is_test_run: participant.is_test_run,
            discard_reason: participant.discard_reason,
            status: participant.status,
            user_agent: participant.user_agent || undefined,
            created_at: participant.created_at || undefined,
            submitted_at: participant.submitted_at || undefined,
            // biome-ignore lint/suspicious/noExplicitAny: optional participant metadata field
            ip_address: (participant as any).ip_address,
        };

        return { studyData: studyDump, participantData: adaptedParticipant };
    }, [study, participant]);

    const handleToggleDiscard = async (isDiscarded: boolean) => {
        if (!participant) return;
        try {
            await discardMutation.mutateAsync({
                participantId: participant.id,
                data: { is_discarded: isDiscarded },
            });
            await refetch();
            toast.success(
                isDiscarded ? t('admin.data.toast.discarded') : t('admin.data.toast.restored')
            );
        } catch (err) {
            console.error(err);
            toast.error(t('admin.data.toast.error'));
        }
    };

    const isLoading = isStudyLoading || isParticipantLoading;

    if (isLoading) {
        return (
            <div className="p-6 space-y-6">
                <div className="flex items-center gap-4">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <Skeleton className="h-8 w-64" />
                </div>
                <Skeleton className="h-[400px] w-full rounded-2xl" />
            </div>
        );
    }

    if (error || !participant || !studyData || !participantData) {
        return (
            <div className="p-6 flex flex-col items-center justify-center h-[50vh] text-center space-y-4">
                <div className="bg-red-50 p-4 rounded-full">
                    <User className="w-8 h-8 text-red-500" />
                </div>
                <h2 className="text-xl font-bold text-slate-900">
                    {error
                        ? t('common.error')
                        : t('admin.data.detail.not_found', 'Participant not found')}
                </h2>
                <Button
                    variant="outline"
                    onClick={() =>
                        navigate(
                            `/app/${currentWorkspace?.slug || 'default'}/studies/${effectiveSlug}`
                        )
                    }
                >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    {t('common.back', 'Back to Study')}
                </Button>
            </div>
        );
    }

    return (
        <div className="flex flex-1 flex-col h-full overflow-hidden bg-slate-50/30">
            <div className="flex-none p-6 pb-0">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                        navigate(
                            `/app/${currentWorkspace?.slug || 'default'}/studies/${effectiveSlug}/data`
                        )
                    }
                    className="text-slate-500 hover:text-indigo-600 hover:bg-indigo-50/50 rounded-xl px-2 -ml-2"
                >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    {t('common.back', 'Back')}
                </Button>

                <StudyPageHeader
                    title={t('admin.data.detail.title', 'Participant Details')}
                    description={`${t('admin.sidebar.study', 'Study')}: ${
                        study?.translations?.[0]?.title || study?.slug
                    }`}
                    icon={User}
                />
            </div>

            <div className="flex-1 overflow-y-auto px-6 pb-6">
                <div className="bg-white rounded-2xl border-none shadow-sm max-w-5xl mx-auto min-h-[500px]">
                    <ParticipantDetailContent
                        participant={participantData}
                        studyData={studyData}
                        onToggleDiscard={handleToggleDiscard}
                        isDiscardPending={discardMutation.isPending}
                    />
                </div>
            </div>
        </div>
    );
}
