import type {
    DumpParticipant,
    DumpResponse,
    DumpStatement,
} from '@/components/admin/dashboard/InteractiveDataView';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Trash2, Link as LinkIcon, MessageSquare, ClipboardType } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import { ParticipantGridView } from './charts/ParticipantGridView';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ParticipantMetadataCard } from './ParticipantMetadataCard';
import { SurveyResponseTable } from './SurveyResponseTable';
import { motion, AnimatePresence } from 'framer-motion';

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

    const recruitmentToken =
        // biome-ignore lint/suspicious/noExplicitAny: accessing dynamic presort data
        participant.recruitment_token || (participant.presort as any)?._recruitment_token;
    // biome-ignore lint/suspicious/noExplicitAny: participant type variation
    const language = (participant as any).language || 'en';

    // biome-ignore lint/suspicious/noExplicitAny: study type adaptation for survey table
    const studyForSurvey = studyData.study as any;

    return (
        <div className="flex flex-col h-full bg-white rounded-2xl overflow-hidden border border-slate-100 shadow-sm">
            {/* Header / Identity */}
            <div className="p-6 border-b border-slate-50 bg-slate-50/30">
                <div className="flex items-start justify-between">
                    <div className="space-y-1">
                        <div className="flex items-center gap-3">
                            <h2 className="text-xl font-black text-slate-900">
                                {t('admin.data.detail.session', 'Session')}
                            </h2>
                            <code className="bg-indigo-600 text-white px-2 py-0.5 rounded-lg text-sm font-black shadow-sm">
                                {String(participant.id).substring(0, 8)}
                            </code>
                            {participant.is_discarded && (
                                <Badge
                                    variant="destructive"
                                    data-testid="discarded-badge"
                                    className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ring-2 ring-red-100 shadow-sm"
                                >
                                    {t('admin.data.detail.discarded_badge', 'Discarded')}
                                </Badge>
                            )}
                        </div>
                        <p className="text-sm font-medium text-slate-500">
                            {t(
                                'admin.data.detail.description',
                                'Detailed review of participant response data.'
                            )}
                        </p>
                    </div>

                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            className={cn(
                                'h-9 rounded-xl font-black transition-all border-slate-200 px-4',
                                participant.is_discarded
                                    ? 'text-emerald-600 hover:bg-emerald-50 hover:border-emerald-200'
                                    : 'text-red-500 hover:bg-red-50 hover:border-red-200'
                            )}
                            onClick={() => onToggleDiscard(!participant.is_discarded)}
                            disabled={isDiscardPending}
                        >
                            <Trash2 className="w-3.5 h-3.5 mr-2" />
                            {participant.is_discarded
                                ? t('admin.data.detail.actions.restore', 'Restore')
                                : t('admin.data.detail.actions.discard', 'Discard')}
                        </Button>
                    </div>
                </div>
            </div>

            <Tabs defaultValue="overview" className="flex-1 flex flex-col">
                <div className="px-6 border-b border-slate-50 bg-white sticky top-0 z-10">
                    <TabsList className="h-14 bg-transparent p-0 gap-6">
                        {['overview', 'survey', 'qsort', 'technical'].map((tab) => (
                            <TabsTrigger
                                key={tab}
                                value={tab}
                                className="h-14 rounded-none border-b-2 border-transparent px-0 text-xs font-black uppercase tracking-widest text-slate-400 data-[state=active]:border-indigo-500 data-[state=active]:text-indigo-600 data-[state=active]:bg-transparent transition-all"
                            >
                                {t(
                                    `admin.participant.tabs.${tab}`,
                                    tab.charAt(0).toUpperCase() + tab.slice(1)
                                )}
                            </TabsTrigger>
                        ))}
                    </TabsList>
                </div>

                <div className="flex-1 overflow-y-auto p-6 bg-slate-50/30">
                    <AnimatePresence mode="wait">
                        <TabsContent value="overview" className="mt-0 outline-none">
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="space-y-6"
                            >
                                <ParticipantMetadataCard
                                    participant={{
                                        ...participant,
                                        // biome-ignore lint/suspicious/noExplicitAny: extended participant metadata
                                        user_agent: (participant as any).user_agent,
                                        created_at:
                                            // biome-ignore lint/suspicious/noExplicitAny: extended participant metadata
                                            (participant as any).created_at ||
                                            new Date().toISOString(),
                                        // biome-ignore lint/suspicious/noExplicitAny: extended participant metadata
                                        ip_address: (participant as any).ip_address,
                                    }}
                                />

                                {recruitmentToken && (
                                    <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-indigo-50 rounded-lg">
                                                <LinkIcon className="h-4 w-4 text-indigo-500" />
                                            </div>
                                            <div>
                                                <p className="text-[10px] text-slate-400 font-black uppercase tracking-wider">
                                                    {t(
                                                        'admin.participant.metadata.recruitment_token',
                                                        'Recruitment Token'
                                                    )}
                                                </p>
                                                <p className="text-sm font-mono font-bold text-slate-900">
                                                    {recruitmentToken}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </motion.div>
                        </TabsContent>

                        <TabsContent value="survey" className="mt-0 outline-none">
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="space-y-8"
                            >
                                <div className="space-y-4">
                                    <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                                        {t(
                                            'admin.participant.survey.presort',
                                            'Pre-Sort Questions'
                                        )}
                                    </h3>
                                    <SurveyResponseTable
                                        study={studyForSurvey}
                                        answers={participant.presort}
                                        type="presort"
                                        language={language}
                                    />
                                </div>

                                <div className="space-y-4">
                                    <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                        {t(
                                            'admin.participant.survey.postsort',
                                            'Post-Sort Questions'
                                        )}
                                    </h3>
                                    <SurveyResponseTable
                                        study={studyForSurvey}
                                        answers={participant.postsort}
                                        type="postsort"
                                        language={language}
                                    />
                                </div>
                            </motion.div>
                        </TabsContent>

                        <TabsContent value="qsort" className="mt-0 outline-none">
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="space-y-8"
                            >
                                <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
                                    <ParticipantGridView
                                        participant={participant}
                                        studyData={studyData}
                                        className="mb-8"
                                    />
                                </div>

                                <div className="space-y-6 relative before:absolute before:left-3.5 before:top-4 before:bottom-4 before:w-0.5 before:bg-slate-200 before:-z-10">
                                    {getReconstructedQSort(participant, studyData).map((pile) => (
                                        <div key={pile.score} className="relative pl-10 group">
                                            <div
                                                className={cn(
                                                    'absolute left-0 top-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-black shadow-sm border-2 z-10 bg-white transition-all group-hover:scale-110',
                                                    pile.score > 0
                                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                        : pile.score < 0
                                                          ? 'bg-rose-50 text-rose-700 border-rose-200'
                                                          : 'bg-slate-50 text-slate-600 border-slate-200'
                                                )}
                                            >
                                                {pile.score > 0 ? `+${pile.score}` : pile.score}
                                            </div>

                                            <div className="space-y-3">
                                                {pile.statements.map((statement) => (
                                                    <div
                                                        key={statement.id}
                                                        className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm text-sm text-slate-700 leading-relaxed hover:border-indigo-200 hover:shadow-md transition-all relative group/card"
                                                    >
                                                        <span className="absolute top-2 right-3 text-[9px] font-black text-slate-300 font-mono opacity-0 group-hover/card:opacity-100 transition-opacity">
                                                            ID:{statement.id}
                                                        </span>
                                                        <div className="font-medium pr-8">
                                                            {statement.translations.find(
                                                                (t) => t.lang === language
                                                            )?.text ||
                                                                statement.translations[0]?.text ||
                                                                `[Statement ${statement.id}]`}
                                                        </div>

                                                        {participant.postsort?.card_comments?.[
                                                            String(statement.id)
                                                        ] && (
                                                            <div className="mt-3 pt-3 border-t border-slate-50 flex items-start gap-2 text-indigo-600/80 italic text-xs">
                                                                <MessageSquare className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                                                                <p>
                                                                    {
                                                                        participant.postsort
                                                                            .card_comments[
                                                                            String(statement.id)
                                                                        ]
                                                                    }
                                                                </p>
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </motion.div>
                        </TabsContent>

                        <TabsContent value="technical" className="mt-0 outline-none">
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="space-y-6"
                            >
                                <div className="bg-slate-900 rounded-2xl p-6 overflow-hidden relative group">
                                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                        <ClipboardType className="w-24 h-24 text-white" />
                                    </div>
                                    <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-4">
                                        {t(
                                            'admin.participant.technical.raw_user_agent',
                                            'Raw User Agent'
                                        )}
                                    </h3>
                                    <p className="text-xs font-mono text-slate-300 break-all leading-relaxed">
                                        {/* biome-ignore lint/suspicious/noExplicitAny: participant type variation */}
                                        {(participant as any).user_agent || '---'}
                                    </p>
                                </div>

                                <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-4">
                                    <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                                        {t(
                                            'admin.participant.technical.session_context',
                                            'Session Context'
                                        )}
                                    </h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="p-4 bg-slate-50 rounded-xl space-y-1">
                                            <p className="text-[10px] text-slate-400 font-black uppercase tracking-wider">
                                                {t('common.id')} (DB)
                                            </p>
                                            <p className="text-sm font-mono font-bold text-slate-900">
                                                {participant.db_id}
                                            </p>
                                        </div>
                                        <div className="p-4 bg-slate-50 rounded-xl space-y-1">
                                            <p className="text-[10px] text-slate-400 font-black uppercase tracking-wider">
                                                {t(
                                                    'admin.participant.technical.language_code',
                                                    'Language Code'
                                                )}
                                            </p>
                                            <p className="text-sm font-mono font-bold text-slate-900 uppercase">
                                                {language}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        </TabsContent>
                    </AnimatePresence>
                </div>
            </Tabs>
        </div>
    );
}
