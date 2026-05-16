import type { DumpParticipant, DumpResponse } from '@/components/admin/dashboard/types';
import type { StudyRead } from '@/api/model';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    MessageSquare,
    MousePointer2,
    FileJson,
    FileSpreadsheet,
    FileArchive,
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
import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import GridSort from '@/components/GridSort';
import SortableCard from '@/components/SortableCard';
import { AudioPlayer } from '@/components/admin/AudioPlayer';
import { MultiLangFieldIcon } from '@/components/admin/designer/MultiLangFieldIcon';
import type { InteractionUtils } from '@/types/grid';

/** Shape of an audio recording entry in the participant answer blob. */
type AudioEntry = {
    presigned_url: string;
    duration_seconds: number;
    file_size_bytes: number;
};

interface ParticipantDetailContentProps {
    participant: DumpParticipant;
    studyData: DumpResponse;
    onToggleDiscard: (isDiscarded: boolean, reason?: string) => void;
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
    const [activeTab, setActiveTab] = useState('session');
    const gridUtilsRef = useRef<InteractionUtils | null>(null);
    const handleInteractionUtils = useCallback((utils: InteractionUtils) => {
        gridUtilsRef.current = utils;
        // Wait for the full layout to stabilize: the sidebar panel (360px on
        // desktop) affects the grid canvas width via CSS flex. Card dimensions
        // from useGridCalculations must be computed and rendered before autofit
        // can read accurate content dimensions.
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                utils.performAutoFit();
            });
        });
    }, []);

    // Auto-fit grid when returning to the tab (GridSort remounts, so
    // gridUtilsRef is reset by handleInteractionUtils above)
    useEffect(() => {
        if (activeTab !== 'grid') {
            gridUtilsRef.current = null;
        }
    }, [activeTab]);

    const handleExportCSV = async () => {
        if (!studySlug || !participant.db_id) return;
        setIsExporting(true);
        try {
            await AdminService.exportParticipantCSV(studySlug, participant.db_id as number);
            toast.success(t('admin.export.success', 'Export successful'));
        } catch (err) {
            console.error(err);
            toast.error(t('admin.export.error', 'Export failed. Try again.'));
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
            toast.error(t('admin.export.error', 'Export failed. Try again.'));
        } finally {
            setIsExporting(false);
        }
    };

    const hasAudioRecordings =
        participant.audio_recordings != null &&
        Object.keys(participant.audio_recordings).length > 0;

    const handleExportAudio = async () => {
        if (!studySlug || !participant.db_id || !hasAudioRecordings) return;
        setIsExporting(true);
        try {
            const blob = await AdminService.exportParticipantAudio(
                studySlug,
                participant.db_id as number
            );
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${studySlug}_participant_${participant.db_id}_audio.zip`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            toast.success(t('admin.export.success', 'Export successful'));
        } catch (err) {
            console.error(err);
            toast.error(t('admin.export.error', 'Export failed. Try again.'));
        } finally {
            setIsExporting(false);
        }
    };

    // --- Data Preparation for GridSort ---
    const { gridConfig, gridPlacements, statementsMap, qsortForGridSort } = useMemo(() => {
        const statements = studyData.study.statements || [];
        // Map statement ID directly to statement object for easy lookup
        const sMap = new Map(statements.map((s) => [s.id, s]));

        // Parse Grid Config
        const rawConfig = studyData.study.grid_config || [];
        const config: { score: number; capacity: number; id: string }[] = Array.isArray(rawConfig)
            ? rawConfig.map((c) => ({
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
        // qsort shape consumed by GridSort.slotCounts (only col/row are read,
        // but we keep statementId for completeness and future use). Built in
        // lockstep with `placements` so free-mode overflow rows are surfaced
        // for admin viewers (PR #77 follow-up).
        const qsort: { statementId: number; col: number; row: number }[] = [];

        Object.entries(participant.placements).forEach(([sIdStr, score]) => {
            const sId = Number(sIdStr);
            const colIdx = scoreToCol[score];
            if (colIdx !== undefined) {
                const row = slotsFilled[colIdx] || 0;
                placements[sId] = { col: colIdx, row };
                qsort.push({ statementId: sId, col: colIdx, row });
                slotsFilled[colIdx] = row + 1;
            }
        });

        return {
            gridConfig: config,
            gridPlacements: placements,
            statementsMap: sMap,
            qsortForGridSort: qsort,
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

    const language = participant.language || 'en';
    const studyForSurvey = studyData.study as unknown as StudyRead;

    const detailStatement = detailStatementId ? statementsMap.get(detailStatementId) : null;
    const detailComment = detailStatementId
        ? participant.postsort?.card_comments?.[String(detailStatementId)]
        : null;
    const detailAudio = detailStatementId
        ? (participant.audio_recordings?.[`card_${detailStatementId}`] as AudioEntry | undefined)
        : null;

    // Sidebar Content Logic
    const sidebarContent = (
        <div className="flex flex-col h-full bg-white">
            <div className="p-4 border-b border-slate-100 bg-slate-50/50">
                <h3 className="text-xs font-black text-slate-400">
                    {t('admin.participant.grid.detail_view', 'Card Details')}
                </h3>
            </div>
            <div className="flex-1 p-3 sm:p-6 overflow-y-auto custom-scrollbar">
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
                            <div className="flex items-start gap-2">
                                <div className="text-lg font-medium text-slate-800 leading-relaxed border-l-4 border-indigo-500 pl-4 py-1 flex-1">
                                    {detailStatement.translations.find((tr) => tr.lang === language)
                                        ?.text || detailStatement.translations[0]?.text}
                                </div>
                                <MultiLangFieldIcon
                                    translations={detailStatement.translations.map((tr) => ({
                                        language_code: tr.lang,
                                        text: tr.text,
                                    }))}
                                    activeLocale={language}
                                    className="mt-1 shrink-0"
                                />
                            </div>
                        </div>

                        {/* Text Comment */}
                        {detailComment && (
                            <div className="bg-indigo-50/50 p-3 sm:p-4 rounded-xl border border-indigo-100/50 space-y-2">
                                <div className="flex items-center gap-2 text-indigo-600 font-bold text-xs">
                                    <MessageSquare className="w-3.5 h-3.5" />
                                    {t('common.comment', 'Comment')}
                                </div>
                                <p className="text-xs sm:text-sm text-slate-700 italic break-words">
                                    "{detailComment}"
                                </p>
                            </div>
                        )}

                        {/* Audio Recording */}
                        {detailAudio && (
                            <div className="space-y-2">
                                <div className="flex items-center gap-2 text-indigo-600 font-bold text-xs">
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

            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
                <div className="flex items-center justify-between px-3 sm:px-6 border-b border-slate-50 bg-white sticky top-0 z-10">
                    <TabsList className="h-12 sm:h-14 bg-transparent p-0 gap-0 sm:gap-4 overflow-x-auto">
                        {['session', 'presort', 'grid', 'postsort'].map((tab) => (
                            <TabsTrigger
                                key={tab}
                                value={tab}
                                className="min-h-[44px] sm:h-14 min-w-[44px] rounded-none border-b-2 border-transparent px-3 sm:px-0 text-xs sm:text-xs font-black text-slate-400 data-[state=active]:border-indigo-500 data-[state=active]:text-indigo-600 data-[state=active]:bg-transparent transition-all"
                            >
                                <div className="flex items-center gap-2">
                                    {tab === 'session' && (
                                        <Fingerprint className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                                    )}
                                    {tab === 'presort' && (
                                        <ClipboardList className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                                    )}
                                    {tab === 'grid' && (
                                        <LayoutGrid className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                                    )}
                                    {tab === 'postsort' && (
                                        <MessageSquare className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                                    )}
                                    <span className="hidden sm:inline">
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
                                    </span>
                                </div>
                            </TabsTrigger>
                        ))}
                    </TabsList>
                    <div className="flex items-center gap-1 sm:gap-2 ml-auto">
                        <Button
                            variant="ghost"
                            size="sm"
                            disabled={isExporting}
                            onClick={handleExportCSV}
                            className="h-11 w-11 sm:h-auto sm:w-auto p-0 sm:p-2 text-slate-400 hover:text-indigo-600"
                            title={t('admin.export.csv', 'Export CSV')}
                            aria-label={t('admin.export.csv', 'Export CSV')}
                        >
                            <FileSpreadsheet className="w-5 h-5 sm:w-4 sm:h-4" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            disabled={isExporting}
                            onClick={handleExportJSON}
                            className="h-11 w-11 sm:h-auto sm:w-auto p-0 sm:p-2 text-slate-400 hover:text-indigo-600"
                            title={t('admin.export.json', 'Export JSON')}
                            aria-label={t('admin.export.json', 'Export JSON')}
                        >
                            <FileJson className="w-5 h-5 sm:w-4 sm:h-4" />
                        </Button>
                        {hasAudioRecordings && (
                            <Button
                                variant="ghost"
                                size="sm"
                                disabled={isExporting}
                                onClick={handleExportAudio}
                                className="h-11 w-11 sm:h-auto sm:w-auto p-0 sm:p-2 text-slate-400 hover:text-indigo-600"
                                title={t('admin.export.audio', 'Export Audio (ZIP)')}
                                aria-label={t('admin.export.audio', 'Export Audio (ZIP)')}
                            >
                                <FileArchive className="w-5 h-5 sm:w-4 sm:h-4" />
                            </Button>
                        )}
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto bg-slate-50/30">
                    <AnimatePresence mode="wait">
                        <TabsContent
                            value="session"
                            className="h-full mt-0 outline-none p-3 sm:p-6"
                        >
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

                        <TabsContent
                            value="presort"
                            className="h-full mt-0 outline-none p-3 sm:p-6"
                        >
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="space-y-6 max-w-7xl mx-auto"
                            >
                                <div className="space-y-4">
                                    <h3 className="text-2xs font-black text-slate-400 flex items-center gap-2">
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

                        <TabsContent
                            value="grid"
                            className="h-[55vh] sm:h-[60vh] md:h-[70vh] lg:h-[800px] min-h-[350px] mt-0 outline-none"
                        >
                            {/* Grid View fixed height for canvas scroll */}
                            <GridSort
                                agreeCards={[]}
                                disagreeCards={[]}
                                neutralCards={[]}
                                gridColumns={gridConfig}
                                readOnly={true}
                                // Mirror the participant-side semantics so
                                // overflow rows in free-mode submissions stay
                                // visible to admins (PR #77 follow-up).
                                distributionMode={studyData.study.distribution_mode ?? 'forced'}
                                qsort={qsortForGridSort}
                                conditionOfInstruction={t(
                                    'admin.participant.grid.read_only_mode',
                                    'Viewer Mode'
                                )}
                                sidebarContent={sidebarContent}
                                onInteractionUtils={handleInteractionUtils}
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
                                                )?.text ||
                                                statement.translations[0]?.text ||
                                                ''
                                            }
                                            code={statement.code}
                                            readOnly={true}
                                            hasComment={
                                                !!participant.postsort?.card_comments?.[String(sId)]
                                            }
                                            hasAudio={
                                                !!participant.audio_recordings?.[`card_${sId}`]
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

                        <TabsContent
                            value="postsort"
                            className="h-full mt-0 outline-none p-3 sm:p-6"
                        >
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="space-y-8 max-w-7xl mx-auto"
                            >
                                <div className="space-y-4">
                                    <h3 className="text-2xs font-black text-slate-400 flex items-center gap-2">
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

                                {/* Audio Recordings */}
                                {hasAudioRecordings && (
                                    <div className="space-y-4">
                                        <h3 className="text-2xs font-black text-slate-400 flex items-center gap-2">
                                            <div className="w-1.5 h-1.5 rounded-full bg-violet-500" />
                                            {t(
                                                'admin.participant.survey.audio_recordings',
                                                'Audio Recordings'
                                            )}
                                        </h3>
                                        <div className="space-y-3">
                                            {Object.entries(
                                                // audio_recordings is non-null here (hasAudioRecordings guard above)
                                                participant.audio_recordings as Record<
                                                    string,
                                                    AudioEntry
                                                >
                                            ).map(([key, audio]) => {
                                                // Resolve label from question_key
                                                let label = key;
                                                if (key.startsWith('card_')) {
                                                    const sId = Number(key.replace('card_', ''));
                                                    const stmt = statementsMap.get(sId);
                                                    if (stmt) {
                                                        label =
                                                            stmt.translations.find(
                                                                (tr) => tr.lang === language
                                                            )?.text ||
                                                            stmt.translations[0]?.text ||
                                                            stmt.code ||
                                                            `Card ${sId}`;
                                                    } else {
                                                        label = `Card ${sId}`;
                                                    }
                                                } else if (key === 'missing_statement') {
                                                    label = t(
                                                        'post.extreme.missing_statement',
                                                        'Missing Statement'
                                                    );
                                                } else if (key === 'general_comment') {
                                                    label = t(
                                                        'post.extreme.general_comment',
                                                        'General Comment'
                                                    );
                                                }

                                                return (
                                                    <div
                                                        key={key}
                                                        className="border border-slate-100 bg-white rounded-2xl p-4 space-y-3"
                                                    >
                                                        <div className="flex items-center gap-2">
                                                            <Mic className="w-3.5 h-3.5 text-violet-500" />
                                                            <p className="text-sm font-bold text-slate-800">
                                                                {label}
                                                            </p>
                                                        </div>
                                                        <AudioPlayer
                                                            url={audio.presigned_url}
                                                            duration={audio.duration_seconds}
                                                            fileName={`${key}.webm`}
                                                        />
                                                        <p className="text-xs text-slate-500">
                                                            {(audio.file_size_bytes / 1024).toFixed(
                                                                1
                                                            )}{' '}
                                                            KB
                                                        </p>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </motion.div>
                        </TabsContent>
                    </AnimatePresence>
                </div>
            </Tabs>
        </div>
    );
}
