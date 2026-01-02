import { useParams } from 'react-router-dom';
import { useGetStudyStats, useListStudyParticipants, useDiscardParticipant } from '@/api/generated';
import HealthDashboard from '@/components/admin/dashboard/HealthDashboard';
import ParticipantTable from '@/components/admin/dashboard/ParticipantTable';
import ParticipantDetailSheet from '@/components/admin/dashboard/ParticipantDetailSheet';
import ExportCenter from '@/components/admin/dashboard/ExportCenter';
import RecruitmentModule from '@/components/admin/dashboard/RecruitmentModule';
import { DashboardSkeleton } from '@/components/admin/DashboardSkeleton';
import { Badge } from '@/components/ui/badge';
import { Activity, Users } from 'lucide-react';
import { useState } from 'react';
import type { ParticipantRead as Participant } from '@/api/model';
import { toast } from 'sonner';

const StudyOverviewPage = () => {
    const { slug } = useParams();
    const { data: stats, isLoading: statsLoading } = useGetStudyStats(slug || '');
    const {
        data: participants,
        isLoading: participantsLoading,
        refetch: refetchParticipants,
    } = useListStudyParticipants(slug || '');
    const discardMutation = useDiscardParticipant();

    const [selectedParticipantId, setSelectedParticipantId] = useState<number | null>(null);
    const [detailOpen, setDetailOpen] = useState(false);

    const handleViewDetail = (p: Participant) => {
        setSelectedParticipantId(p.id);
        setDetailOpen(true);
    };

    const handleToggleDiscard = async (id: number, isDiscarded: boolean) => {
        try {
            await discardMutation.mutateAsync({
                participantId: id,
                data: {
                    is_discarded: isDiscarded,
                    discard_reason: isDiscarded ? 'Manual review' : null,
                },
            });
            toast.success(isDiscarded ? 'Participant flagged' : 'Participant restored');
            refetchParticipants();
        } catch (_err) {
            toast.error('Failed to update participant status');
        }
    };

    if (statsLoading || participantsLoading) {
        return <DashboardSkeleton />;
    }

    return (
        <div className="flex flex-1 flex-col gap-6 p-6 pt-2">
            <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-4 border-b border-slate-100">
                <div className="space-y-1">
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
                        {slug}
                        <Badge
                            variant="outline"
                            className="ml-2 bg-emerald-50 text-emerald-700 border-emerald-100 font-bold uppercase tracking-widest text-[10px]"
                        >
                            Live Fieldwork
                        </Badge>
                    </h1>
                    <p className="text-slate-500 text-sm">
                        Real-time analytics and participant overview for this study.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <div className="bg-white shadow-sm border rounded-lg px-4 py-2 flex items-center gap-3">
                        <div className="relative">
                            <Activity className="h-4 w-4 text-emerald-500" />
                            <span className="absolute -top-1 -right-1 flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                            </span>
                        </div>
                        <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                            Receiving Data
                        </span>
                    </div>
                </div>
            </header>

            {/* biome-ignore lint/suspicious/noExplicitAny: stats type is dynamic from generated client */}
            {stats && <HealthDashboard stats={stats as any} />}

            <div className="grid gap-6 md:grid-cols-12 pb-12">
                <Card className="col-span-12 md:col-span-8 shadow-md border-none bg-slate-50/30">
                    <CardHeader className="flex flex-row items-center justify-between border-b border-slate-100 bg-white/50">
                        <div className="space-y-1">
                            <CardTitle className="text-lg flex items-center gap-2">
                                <Users className="h-5 w-5 text-indigo-500" />
                                Participant Audit Table
                            </CardTitle>
                            <CardDescription>
                                Monitor individual progress and flag low-quality data.
                            </CardDescription>
                        </div>
                    </CardHeader>
                    <CardContent className="p-6">
                        <ParticipantTable
                            data={participants || []}
                            onViewDetail={handleViewDetail}
                            onToggleDiscard={handleToggleDiscard}
                        />
                    </CardContent>
                </Card>

                <div className="col-span-12 md:col-span-4 space-y-6">
                    <RecruitmentModule slug={slug || ''} />
                    <ExportCenter slug={slug || ''} />
                </div>
            </div>

            <ParticipantDetailSheet
                participantId={selectedParticipantId}
                open={detailOpen}
                onOpenChange={setDetailOpen}
            />
        </div>
    );
};

export default StudyOverviewPage;
