import type {
    DumpParticipant,
    DumpResponse,
} from '@/components/admin/dashboard/InteractiveDataView';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    MessageSquare,
    MousePointer2,
    FileJson,
    FileSpreadsheet,
    Fingerprint,
    ClipboardList,
    LayoutGrid,
    Mic,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ParticipantMetadataCard } from './ParticipantMetadataCard';
import { SurveyResponseTable } from './SurveyResponseTable';
import { motion, AnimatePresence } from 'framer-motion';
import { AdminService } from '@/api/admin';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useState, useMemo } from 'react';
import GridSort from '@/components/GridSort';
import SortableCard from '@/components/SortableCard';
import { AudioPlayer } from '@/components/admin/AudioPlayer';

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
    const { studySlug } = useParams<{ studySlug: string }>();
    const [isExporting, setIsExporting] = useState(false);
    const [detailStatementId, setDetailStatementId] = useState<number | null>(null);

    const handleExportCSV = async () => {
        if (!studySlug || !participant.db_id) return;
        setIsExporting(true);
        try {
            await AdminService.exportParticipantCSV(studySlug, participant.db_id as number);
            toast.success(t('admin.export.success', 'Export successful'));
        } catch (err) {
            console.error(err);
            toast.error(t('admin.export.error', 'Export failed'));
        } finally {
            setIsExporting(false);
        }
    };

    const handleExportJSON = async () => {
        if (!studySlug || !participant.db_id) return;
        setIsExporting(true);
        try {
            const data = await AdminService.exportParticipantJSON(
                studySlug,
                participant.db_id as number
            );
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${studySlug}_participant_${participant.db_id}.json`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            toast.success(t('admin.export.success', 'Export successful'));
        } catch (err) {
            console.error(err);
            toast.error(t('admin.export.error', 'Export failed'));
        } finally {
            setIsExporting(false);
        }
    };

    // --- Data Preparation for GridSort ---
    const { gridConfig, gridPlacements, statementsMap } = useMemo(() => {
        const statements = studyData.study.statements || [];
        // Map statement ID directly to statement object for easy lookup
        const sMap = new Map(statements.map((s) => [s.id, s]));

        // Parse Grid Config
        // biome-ignore lint/suspicious/noExplicitAny: config structure varies
        const rawConfig = (studyData.study.grid_config as any) || [];
        const config: { score: number; capacity: number; id: string }[] = Array.isArray(rawConfig)
            ? // biome-ignore lint/suspicious/noExplicitAny: dynamic mapping
              rawConfig.map((c: any) => ({
                  score: c.score,
                  capacity: c.capacity,
                  id: String(c.score),
              }))
            : [];

        // Build score -> column index map
        const scoreToCol: Record<number, number> = {};
        config.forEach((c, idx) => {
            scoreToCol[c.score] = idx;
        });

        // Reconstruct Placements (Col, Row) from Scores
        // participant.placements is { statementId: score }
        const placements: Record<number, { col: number; row: number }> = {};
        const slotsFilled: Record<number, number> = {}; // track rows per col/score

        Object.entries(participant.placements).forEach(([sIdStr, score]) => {
            const sId = Number(sIdStr);
            const colIdx = scoreToCol[score];
            if (colIdx !== undefined) {
                const row = slotsFilled[colIdx] || 0;
                placements[sId] = { col: colIdx, row };
                slotsFilled[colIdx] = row + 1;
            }
        });

        return {
            gridConfig: config,
            gridPlacements: placements,
            statementsMap: sMap,
        };
    }, [studyData, participant]);

    // Reverse lookup for rendering: (col, row) -> statementId
    const cellContentMap = useMemo(() => {
        const map: Record<string, number> = {};
        Object.entries(gridPlacements).forEach(([sIdStr, pos]) => {
            map[`${pos.col}-${pos.row}`] = Number(sIdStr);
        });
        return map;
    }, [gridPlacements]);

    // biome-ignore lint/suspicious/noExplicitAny: participant type variation
    const language = (participant as any).language || 'en';
    // biome-ignore lint/suspicious/noExplicitAny: study type adaptation
    const studyForSurvey = studyData.study as any;

    const detailStatement = detailStatementId ? statementsMap.get(detailStatementId) : null;
    const detailComment = detailStatementId
        ? participant.postsort?.card_comments?.[String(detailStatementId)]
        : null;
    const detailAudio = detailStatementId
        ? // biome-ignore lint/suspicious/noExplicitAny: audio recordings type
          (participant as any).audio_recordings?.[`card_${detailStatementId}`]
        : null;

    // Sidebar Content Logic
    const sidebarContent = (
        <div className="flex flex-col h-full bg-white">
            <div className="p-4 border-b border-slate-100 bg-slate-50/50">
                <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">
                    {t('admin.participant.grid.detail_view', 'Card Details')}
                </h3>
            </div>
            <div className="flex-1 p-6 overflow-y-auto custom-scrollbar">
                {detailStatement ? (
                    <div className="space-y-6 animate-in fade-in slide-in-from-right-2 duration-300">
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <Badge variant="outline" className="font-mono text-xs">
                                    {detailStatement.code ||
                                        `${t('admin.participant.metadata.id', 'ID')}: ${detailStatement.id}`}
                                </Badge>
                                <span className="text-xs font-medium text-slate-400">
                                    {t('common.score', 'Score')}:{' '}
                                    <span className="text-slate-900 font-bold">
                                        {participant.placements[String(detailStatement.id)]}
                                    </span>
                                </span>
                            </div>
                            <div className="text-lg font-medium text-slate-800 leading-relaxed border-l-4 border-indigo-500 pl-4 py-1">
                                {detailStatement.translations.find((tr) => tr.lang === language)
                                    ?.text || detailStatement.translations[0]?.text}
                            </div>
                        </div>

                        {/* Text Comment */}
                        {detailComment && (
                            <div className="bg-indigo-50/50 p-4 rounded-xl border border-indigo-100/50 space-y-2">
                                <div className="flex items-center gap-2 text-indigo-600 font-bold text-xs uppercase tracking-wider">
                                    <MessageSquare className="w-3.5 h-3.5" />
                                    {t('common.comment', 'Comment')}
                                </div>
                                <p className="text-sm text-slate-700 italic">"{detailComment}"</p>
                            </div>
                        )}

                        {/* Audio Recording */}
                        {detailAudio && (
                            <div className="space-y-2">
                                <div className="flex items-center gap-2 text-indigo-600 font-bold text-xs uppercase tracking-wider">
                                    <Mic className="w-3.5 h-3.5" />
                                    {t('admin.audio.recording', 'Audio Recording')}
                                </div>
                                <AudioPlayer
                                    url={detailAudio.presigned_url}
                                    duration={detailAudio.duration_seconds}
                                    fileName={`card_${detailStatementId}.webm`}
                                />
                                <p className="text-xs text-slate-500">
                                    {t('admin.audio.file_size', 'File size')}:{' '}
                                    {(detailAudio.file_size_bytes / 1024).toFixed(1)} KB
                                </p>
                            </div>
                        )}

                        {/* No Response */}
                        {!detailComment && !detailAudio && (
                            <div className="text-center py-8 text-slate-400 text-sm">
                                {t('admin.participant.grid.no_response', 'No response provided.')}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400 text-center space-y-2">
                        <div className="p-3 bg-slate-50 rounded-full">
                            <MousePointer2 className="w-6 h-6 text-slate-300" />
                        </div>
                        <p className="text-sm font-medium">
                            {t(
                                'admin.participant.grid.select_instruction',
                                'Select a card on the grid to view details.'
                            )}
                        </p>
                    </div>
                )}
            </div>
        </div>
    );

    const agreeCards: number[] = [];
    const disagreeCards: number[] = [];
    const neutralCards: number[] = [];

    const disagreeScores = new Set(gridConfig.filter((c) => c.score < 0).map((c) => c.score));
    const neutralScores = new Set(gridConfig.filter((c) => c.score === 0).map((c) => c.score));
    const agreeScores = new Set(gridConfig.filter((c) => c.score > 0).map((c) => c.score));

    Object.entries(participant.placements).forEach(([sIdStr, score]) => {
        const sId = Number(sIdStr);
        if (disagreeScores.has(score)) {
            disagreeCards.push(sId);
        } else if (neutralScores.has(score)) {
            neutralCards.push(sId);
        } else if (agreeScores.has(score)) {
            agreeCards.push(sId);
        }
    });

    return (
        <div className="flex flex-col h-full bg-white rounded-2xl overflow-hidden border border-slate-100 shadow-sm">
            {/* Header / Identity is handled by Page Header usually, keeping simplified actions or removing */}
            {/* Note: User requested enriched header, we can rely on Page header or add detail here. */}

            <Tabs defaultValue="session" className="flex-1 flex flex-col">
                <div className="flex items-center justify-between px-6 border-b border-slate-50 bg-white sticky top-0 z-10">
                    <TabsList className="h-14 bg-transparent p-0 gap-6">
                        {['session', 'presort', 'grid', 'postsort'].map((tab) => (
                            <TabsTrigger
                                key={tab}
                                value={tab}
                                className="h-14 rounded-none border-b-2 border-transparent px-0 text-xs font-black uppercase tracking-widest text-slate-400 data-[state=active]:border-indigo-500 data-[state=active]:text-indigo-600 data-[state=active]:bg-transparent transition-all"
                            >
                                <div className="flex items-center gap-2">
                                    {tab === 'session' && <Fingerprint className="w-3.5 h-3.5" />}
                                    {tab === 'presort' && <ClipboardList className="w-3.5 h-3.5" />}
                                    {tab === 'grid' && <LayoutGrid className="w-3.5 h-3.5" />}
                                    {tab === 'postsort' && (
                                        <MessageSquare className="w-3.5 h-3.5" />
                                    )}
                                    {t(
                                        `admin.participant.tabs.${tab}`,
                                        tab === 'presort'
                                            ? 'Pre-Sort'
                                            : tab === 'grid'
                                              ? 'Q-Sort Grid'
                                              : tab === 'session'
                                                ? 'Session Metadata'
                                                : 'Post-Sort'
                                    )}
                                </div>
                            </TabsTrigger>
                        ))}
                    </TabsList>
                    <div className="flex items-center gap-2 ml-auto">
                        <Button
                            variant="ghost"
                            size="sm"
                            disabled={isExporting}
                            onClick={handleExportCSV}
                            className="text-slate-400 hover:text-indigo-600"
                            title={t('admin.export.csv', 'Export CSV')}
                        >
                            <FileSpreadsheet className="w-4 h-4" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            disabled={isExporting}
                            onClick={handleExportJSON}
                            className="text-slate-400 hover:text-indigo-600"
                            title={t('admin.export.json', 'Export JSON')}
                        >
                            <FileJson className="w-4 h-4" />
                        </Button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto bg-slate-50/30">
                    <AnimatePresence mode="wait">
                        <TabsContent value="session" className="h-full mt-0 outline-none p-6">
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="space-y-6 max-w-7xl mx-auto"
                            >
                                <ParticipantMetadataCard
                                    participant={{
                                        ...participant,
                                        user_agent: participant.user_agent,
                                        created_at: participant.created_at || '',
                                        ip_address: participant.ip_address,
                                    }}
                                    onToggleDiscard={onToggleDiscard}
                                    isDiscardPending={isDiscardPending}
                                />
                            </motion.div>
                        </TabsContent>

                        <TabsContent value="presort" className="h-full mt-0 outline-none p-6">
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="space-y-6 max-w-7xl mx-auto"
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
                            </motion.div>
                        </TabsContent>

                        <TabsContent value="grid" className="h-[800px] mt-0 outline-none">
                            {/* Grid View fixed height for canvas scroll */}
                            <GridSort
                                agreeCards={[]}
                                disagreeCards={[]}
                                neutralCards={[]}
                                gridColumns={gridConfig}
                                readOnly={true}
                                conditionOfInstruction={t(
                                    'admin.participant.grid.read_only_mode',
                                    'Viewer Mode'
                                )}
                                sidebarContent={sidebarContent}
                                renderSlotContent={(colIdx, rowIdx, dims) => {
                                    const sId = cellContentMap[`${colIdx}-${rowIdx}`];
                                    if (!sId) return null;
                                    const statement = statementsMap.get(sId);
                                    if (!statement) return null;

                                    return (
                                        <SortableCard
                                            id={sId}
                                            text={
                                                statement.translations.find(
                                                    (tr) => tr.lang === language
                                                )?.text || statement.translations[0]?.text
                                            }
                                            code={statement.code}
                                            readOnly={true}
                                            hasComment={
                                                !!participant.postsort?.card_comments?.[String(sId)]
                                            }
                                            hasAudio={
                                                // biome-ignore lint/suspicious/noExplicitAny: audio recordings type
                                                !!(participant as any).audio_recordings?.[
                                                    `card_${sId}`
                                                ]
                                            }
                                            onClick={() => setDetailStatementId(sId)}
                                            isSelected={detailStatementId === sId}
                                            dimensions={dims}
                                            aspectRatio={3 / 4} // Force aspect ratio for consistent grid
                                        />
                                    );
                                }}
                            />
                        </TabsContent>

                        <TabsContent value="postsort" className="h-full mt-0 outline-none p-6">
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="space-y-8 max-w-7xl mx-auto"
                            >
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
                    </AnimatePresence>
                </div>
            </Tabs>
        </div>
    );
}
