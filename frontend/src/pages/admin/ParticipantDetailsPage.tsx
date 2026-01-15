import { useParams, useNavigate } from 'react-router-dom';
import {
    useGetStudyDumpApiAdminStudiesSlugDumpGet,
    useDiscardParticipantApiAdminStudiesParticipantsParticipantIdDiscardPatch,
} from '@/api/generated';
import { StudyPageHeader } from '@/components/admin/layout/StudyPageHeader';
import { Button } from '@/components/ui/button';
import { ArrowLeft, User } from 'lucide-react';
import type { DumpResponse } from '@/components/admin/dashboard/InteractiveDataView';
import { ParticipantDetailContent } from '@/components/admin/dashboard/ParticipantDetailContent';
import { useTranslation } from 'react-i18next';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';

export default function ParticipantDetailsPage() {
    const { slug, participantId } = useParams<{
        slug: string;
        participantId: string;
    }>();
    const navigate = useNavigate();
    const { t } = useTranslation();

    // Use the dump API for now as requested
    const {
        data: rawData,
        isLoading,
        error,
        refetch,
    } = useGetStudyDumpApiAdminStudiesSlugDumpGet(slug || '');
    const studyData = rawData as unknown as DumpResponse;

    const discardMutation =
        useDiscardParticipantApiAdminStudiesParticipantsParticipantIdDiscardPatch();

    // Find the participant
    const participant = studyData?.participants?.find((p) => String(p.id) === participantId);

    const handleToggleDiscard = async (isDiscarded: boolean) => {
        if (!participant) return;
        try {
            await discardMutation.mutateAsync({
                participantId: Number(participantId) || Number(participant.id), // Try params first, then data
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

    if (error || !participant) {
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
                <Button variant="outline" onClick={() => navigate(`/admin/studies/${slug}`)}>
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
                    onClick={() => navigate(`/admin/studies/${slug}`)}
                    className="mb-4 text-slate-500 hover:text-slate-900 pl-0 hover:bg-transparent"
                >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    {t('admin.studies.back_to_overview', 'Back to Overview')}
                </Button>

                <StudyPageHeader
                    title={t('admin.data.detail.title', 'Participant Details')}
                    description={`${t('admin.studies.study', 'Study')}: ${
                        studyData.study.translations[0]?.title || studyData.study.slug
                    }`}
                    icon={User}
                />
            </div>

            <div className="flex-1 overflow-y-auto px-6 pb-6">
                <div className="bg-white rounded-2xl border-none shadow-sm max-w-5xl mx-auto min-h-[500px]">
                    <ParticipantDetailContent
                        participant={participant}
                        studyData={studyData}
                        onToggleDiscard={handleToggleDiscard}
                        isDiscardPending={discardMutation.isPending}
                    />
                </div>
            </div>
        </div>
    );
}
