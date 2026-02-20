import { useParams, useNavigate, Link } from 'react-router-dom';
import {
    useGetStudyApiAdminStudiesSlugGet,
    useGetParticipantApiAdminStudiesParticipantsParticipantIdGet,
    useDiscardParticipantApiAdminStudiesParticipantsParticipantIdDiscardPatch,
    useListStudyParticipantsApiAdminStudiesSlugParticipantsGet,
} from '@/api/generated';
import { StudyPageHeader } from '@/components/admin/layout/StudyPageHeader';
import { Button } from '@/components/ui/button';
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { ArrowLeft, ChevronLeft, ChevronRight, User } from 'lucide-react';
import type { DumpResponse, DumpParticipant } from '@/components/admin/dashboard/types';
import { ParticipantDetailContent } from '@/components/admin/dashboard/ParticipantDetailContent';
import { useTranslation } from 'react-i18next';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { useMemo } from 'react';
import { useAdminContext } from '@/hooks/useAdminContext';

export default function ParticipantDetailsPage() {
    const { workspace: currentWorkspace } = useAdminContext();
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

    // Fetch participant list for prev/next navigation
    const { data: participantList } = useListStudyParticipantsApiAdminStudiesSlugParticipantsGet(
        effectiveSlug,
        {
            query: { enabled: !!effectiveSlug },
        }
    );

    const { currentIndex, prevId, nextId } = useMemo(() => {
        if (!participantList || !participantId) {
            return { currentIndex: -1, prevId: null, nextId: null };
        }
        const idx = participantList.findIndex((p) => p.id === Number(participantId));
        return {
            currentIndex: idx,
            prevId: idx > 0 ? participantList[idx - 1].id : null,
            nextId:
                idx >= 0 && idx < participantList.length - 1 ? participantList[idx + 1].id : null,
        };
    }, [participantList, participantId]);

    const baseUrl = currentWorkspace?.slug
        ? `/app/${currentWorkspace.slug}/studies/${effectiveSlug}`
        : `/admin/studies/${effectiveSlug}`;

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
            presort_config: study.presort_config as any,
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
        const card_comments: Record<string, string> = {};
        participant.qsort_entries?.forEach((entry) => {
            placements[entry.statement_id] = entry.grid_score;
            if (entry.card_comment) {
                card_comments[entry.statement_id] = entry.card_comment;
            }
        });

        const scores: (number | null)[] = sortedStatements.map((s) => {
            return placements[s.id] !== undefined ? placements[s.id] : null;
        });

        // Build audio recordings map by question_key
        // biome-ignore lint/suspicious/noExplicitAny: audio recordings dynamic structure
        const audio_recordings: Record<string, any> = {};
        participant.audio_recordings?.forEach((audio) => {
            audio_recordings[audio.question_key] = {
                id: audio.id,
                duration_seconds: audio.duration_seconds,
                file_size_bytes: audio.file_size_bytes,
                presigned_url: audio.presigned_url,
                created_at: audio.created_at,
            };
        });

        const adaptedParticipant: DumpParticipant & {
            user_agent?: string;
            created_at?: string;
            ip_address?: string;
            // biome-ignore lint/suspicious/noExplicitAny: audio recordings dynamic structure
            audio_recordings?: Record<string, any>;
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
            postsort: {
                // biome-ignore lint/suspicious/noExplicitAny: generic cast
                ...((participant.postsort_answers as any) || {}),
                card_comments,
            },
            audio_recordings,
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
                isDiscarded
                    ? t('admin.data.toast.discarded', 'Participant discarded')
                    : t('admin.data.toast.restored', 'Participant restored')
            );
        } catch (err) {
            console.error(err);
            toast.error(t('admin.data.toast.error', 'Failed to update participant'));
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
            <div className="flex-none p-6 pb-0 space-y-3">
                <Breadcrumb>
                    <BreadcrumbList>
                        <BreadcrumbItem>
                            <BreadcrumbLink asChild>
                                <Link
                                    to={`/app/${currentWorkspace?.slug || 'default'}/studies/${effectiveSlug}`}
                                >
                                    {study?.translations?.[0]?.title || study?.slug}
                                </Link>
                            </BreadcrumbLink>
                        </BreadcrumbItem>
                        <BreadcrumbSeparator />
                        <BreadcrumbItem>
                            <BreadcrumbLink asChild>
                                <Link
                                    to={`/app/${currentWorkspace?.slug || 'default'}/studies/${effectiveSlug}/data`}
                                >
                                    {t('admin.sidebar.data', 'Data')}
                                </Link>
                            </BreadcrumbLink>
                        </BreadcrumbItem>
                        <BreadcrumbSeparator />
                        <BreadcrumbItem>
                            <BreadcrumbPage>
                                {t('admin.data.detail.participant', 'Participant')} #{participantId}
                            </BreadcrumbPage>
                        </BreadcrumbItem>
                    </BreadcrumbList>
                </Breadcrumb>

                <div className="flex items-center justify-between gap-4">
                    <StudyPageHeader
                        title={t('admin.data.detail.title', 'Participant Details')}
                        description={`${t('admin.sidebar.study', 'Study')}: ${
                            study?.translations?.[0]?.title || study?.slug
                        }`}
                        icon={User}
                    />

                    {participantList && participantList.length > 1 && (
                        <div className="flex items-center gap-2 shrink-0">
                            <Button
                                variant="outline"
                                size="icon"
                                disabled={prevId === null}
                                onClick={() => navigate(`${baseUrl}/participants/${prevId}`)}
                                aria-label={t('common.previous', 'Previous')}
                            >
                                <ChevronLeft className="w-4 h-4" />
                            </Button>
                            <span className="text-sm text-slate-500 tabular-nums min-w-[3ch] text-center">
                                {currentIndex >= 0 ? currentIndex + 1 : '–'} /{' '}
                                {participantList.length}
                            </span>
                            <Button
                                variant="outline"
                                size="icon"
                                disabled={nextId === null}
                                onClick={() => navigate(`${baseUrl}/participants/${nextId}`)}
                                aria-label={t('common.next', 'Next')}
                            >
                                <ChevronRight className="w-4 h-4" />
                            </Button>
                        </div>
                    )}
                </div>
            </div>

            <div className="flex-1 overflow-y-auto px-6 pb-6">
                <div className="bg-white rounded-2xl border-none shadow-sm max-w-7xl mx-auto min-h-[500px]">
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
