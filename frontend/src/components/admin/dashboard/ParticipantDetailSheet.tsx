import type React from 'react';
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription,
} from '@/components/ui/sheet';
import { useGetParticipant } from '@/api/generated';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { User, Monitor, Calendar, Clock, MessageSquare, CheckCircle2, XCircle } from 'lucide-react';
import { format } from 'date-fns';

interface ParticipantDetailSheetProps {
    participantId: number | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

const ParticipantDetailSheet: React.FC<ParticipantDetailSheetProps> = ({
    participantId,
    open,
    onOpenChange,
}) => {
    const {
        data: p,
        isLoading,
        error,
    } = useGetParticipant(participantId || 0, { query: { enabled: !!participantId && open } });

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent className="sm:max-w-xl overflow-y-auto bg-slate-50/95 backdrop-blur-sm border-l border-slate-200">
                <SheetHeader className="pb-6">
                    <div className="flex items-center gap-2 mb-2">
                        <Badge
                            variant={p?.is_discarded ? 'secondary' : 'outline'}
                            className={
                                p?.is_discarded
                                    ? 'bg-slate-200 text-slate-600'
                                    : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                            }
                        >
                            {p?.is_discarded ? 'Discarded' : 'Active Session'}
                        </Badge>
                        {p?.status === 'completed' && (
                            <Badge
                                variant="outline"
                                className="bg-emerald-50 text-emerald-700 border-emerald-200"
                            >
                                <CheckCircle2 size={10} className="mr-1" /> Complete
                            </Badge>
                        )}
                    </div>
                    <SheetTitle className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                        <User className="h-6 w-6 text-slate-400" />
                        Participant Overview
                    </SheetTitle>
                    <SheetDescription className="text-slate-500 font-mono text-xs">
                        ID: {p?.session_token || '...'}
                    </SheetDescription>
                </SheetHeader>

                {isLoading ? (
                    <div className="space-y-6">
                        <Skeleton className="h-24 w-full rounded-xl" />
                        <Skeleton className="h-64 w-full rounded-xl" />
                        <Skeleton className="h-48 w-full rounded-xl" />
                    </div>
                ) : error ? (
                    <div className="p-4 rounded-xl bg-red-50 border border-red-100 text-red-600 flex items-center gap-2">
                        <XCircle className="h-5 w-5" />
                        <span>Failed to load participant details.</span>
                    </div>
                ) : p ? (
                    <div className="space-y-8 pb-12">
                        {/* Meta Grid */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
                                <div className="flex items-center gap-2 text-slate-400 text-[10px] font-bold uppercase mb-1">
                                    <Calendar size={12} /> Started
                                </div>
                                <div className="text-sm font-semibold text-slate-700">
                                    {format(new Date(p.created_at), 'PPPp')}
                                </div>
                            </div>
                            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
                                <div className="flex items-center gap-2 text-slate-400 text-[10px] font-bold uppercase mb-1">
                                    <Clock size={12} /> Duration
                                </div>
                                <div className="text-sm font-semibold text-slate-700">
                                    {p.submitted_at
                                        ? `${Math.floor((new Date(p.submitted_at).getTime() - new Date(p.created_at).getTime()) / 60000)}m ${Math.floor((new Date(p.submitted_at).getTime() - new Date(p.created_at).getTime()) / 1000) % 60}s`
                                        : 'In Progress'}
                                </div>
                            </div>
                        </div>

                        {/* Survey Answers */}
                        <section className="space-y-4">
                            <h3 className="text-sm font-bold text-slate-900 border-l-2 border-indigo-500 pl-3">
                                Survey Responses
                            </h3>
                            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                                <div className="p-4 space-y-4">
                                    {Object.entries(p.presort_answers || {}).length > 0 ? (
                                        Object.entries(p.presort_answers).map(([key, value]) => (
                                            <div key={key} className="space-y-1">
                                                <div className="text-[10px] font-bold text-indigo-400 uppercase tracking-tight">
                                                    {key.replace(/_/g, ' ')}
                                                </div>
                                                <div className="text-sm text-slate-700 font-medium">
                                                    {typeof value === 'boolean'
                                                        ? value
                                                            ? 'Yes'
                                                            : 'No'
                                                        : String(value)}
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="text-sm text-slate-400 italic">
                                            No pre-sort survey data.
                                        </div>
                                    )}
                                </div>
                            </div>
                        </section>

                        {/* Q-Sort Summary */}
                        <section className="space-y-4">
                            <h3 className="text-sm font-bold text-slate-900 border-l-2 border-emerald-500 pl-3">
                                Q-Sort Placement
                            </h3>
                            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                                <div className="divide-y divide-slate-50">
                                    {(p.qsort_entries || []).length > 0 ? (
                                        p.qsort_entries
                                            .sort((a, b) => b.grid_score - a.grid_score)
                                            .map((entry, _idx) => (
                                                <div
                                                    key={entry.statement_id}
                                                    className="p-4 flex items-start gap-4 hover:bg-slate-50/50 transition-colors"
                                                >
                                                    <div
                                                        className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center font-bold text-sm ${
                                                            entry.grid_score > 0
                                                                ? 'bg-emerald-50 text-emerald-700'
                                                                : entry.grid_score < 0
                                                                  ? 'bg-amber-50 text-amber-700'
                                                                  : 'bg-slate-100 text-slate-500'
                                                        }`}
                                                    >
                                                        {entry.grid_score > 0
                                                            ? `+${entry.grid_score}`
                                                            : entry.grid_score}
                                                    </div>
                                                    <div className="flex-1 space-y-2">
                                                        <div className="text-sm text-slate-700 leading-relaxed font-medium">
                                                            <span className="text-slate-400 font-mono text-[10px] mr-2">
                                                                S-{entry.statement_id}
                                                            </span>
                                                            {/* Normally we'd fetch statement text here, but for now ID is okay or we'd need translation map */}
                                                            Statement text placeholder
                                                        </div>
                                                        {entry.card_comment && (
                                                            <div className="bg-amber-50/50 p-2 rounded-lg text-xs text-amber-800 flex gap-2 border border-amber-100">
                                                                <MessageSquare
                                                                    size={12}
                                                                    className="mt-0.5"
                                                                />
                                                                {entry.card_comment}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            ))
                                    ) : (
                                        <div className="p-8 text-center text-sm text-slate-400 italic">
                                            No Q-sort data submitted yet.
                                        </div>
                                    )}
                                </div>
                            </div>
                        </section>

                        {/* System Info */}
                        <section className="bg-slate-200/30 p-4 rounded-xl border border-slate-200">
                            <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500 uppercase mb-3 px-1">
                                <Monitor size={12} /> Technical Fingerprint
                            </div>
                            <div className="space-y-2 px-1">
                                <div className="flex justify-between text-xs">
                                    <span className="text-slate-500">Device/Browser</span>
                                    <span
                                        className="text-slate-700 font-medium truncate max-w-[200px]"
                                        title={p.user_agent || ''}
                                    >
                                        {p.user_agent || 'Unknown'}
                                    </span>
                                </div>
                                <div className="flex justify-between text-xs">
                                    <span className="text-slate-500">Language Used</span>
                                    <Badge variant="secondary" className="text-[10px] uppercase">
                                        {p.language_used}
                                    </Badge>
                                </div>
                            </div>
                        </section>
                    </div>
                ) : null}
            </SheetContent>
        </Sheet>
    );
};

export default ParticipantDetailSheet;
