/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FactorSelectorChips } from './FactorSelectorChips';
import { FactorNoteEditor, type FactorNoteEditorHandle } from './FactorNoteEditor';
import { FactorVoicesPanel } from './FactorVoicesPanel';
import { CompareBar } from './CompareBar';
import type { ParticipantCardComment } from '@/api/model/participantCardComment';
import type { AnalysisResult } from '@/api/model/analysisResult';
import type { AnalysisRunSummary } from '@/api/model';
import type { InterpretPhaseApi } from '@/hooks/admin/useInterpretPhase';

/** |Δz| threshold above which the chip is visually emphasised. Mirrors spec §5.5. */
const DELTA_Z_HIGHLIGHT = 0.5;

interface Props {
    slug: string;
    interpret: InterpretPhaseApi;
    onFocusChange: (factor: number) => void;
    /** Available runs for the compare-pin picker (typically the run history). */
    runs: AnalysisRunSummary[];
    /** The pinned compare-to run id, or null when nothing is pinned. */
    compareTo: number | null;
    onPin: (runId: number) => void;
    onUnpin: () => void;
}

/**
 * Cap on the number of top |z| statements rendered in the canvas.
 * 12 covers the typical 6-up + 6-down extremes of a 30-statement Q-set;
 * larger Q-sets (60+ statements) may bury some distinguishing items
 * outside the cap. The current sort by |z| descending typically surfaces
 * distinguishing items but doesn't guarantee it; "distinguishing first"
 * is a future refinement (Phase 5+).
 */
const TOP_STATEMENTS_LIMIT = 12;
const QUOTE_TRUNCATE = 60;

/**
 * Per-factor focus mode: brings together the top/bottom statements (sorted
 * by |z|), the voices of flagged participants (audio + comments), and the
 * factor narrative editor in a single canvas. The "quote picker" on each
 * comment fires `appendQuote()` on the editor, inserting a markdown
 * blockquote with attribution.
 *
 * Audio insertion is intentionally NOT supported (no transcription
 * pipeline). Statement insertion is also out of scope (z-scores are
 * already visible in StatementsTable / Statements panel).
 */
export function FactorCanvas({
    slug,
    interpret,
    onFocusChange,
    runs,
    compareTo,
    onPin,
    onUnpin,
}: Props) {
    const { t } = useTranslation();
    const editorRef = useRef<FactorNoteEditorHandle>(null);
    const run = interpret.run;
    // The orval-generated `AnalysisRunRead.result` is typed as
    // `{ [key: string]: unknown }` (JSONB column). Narrow once for the body.
    const result = (run?.result as unknown as AnalysisResult | undefined) ?? null;

    // Top/bottom statements by |z| for the active factor; sliced to a
    // sensible UI cap. Distinguishing statements get a `D` badge but no
    // re-sorting (|z| ordering already surfaces them).
    const topStatements = useMemo(() => {
        if (!result) return [];
        const factorIdx = interpret.activeFactor - 1;
        const distinguishingIds = new Set(result.distinguishing.map((d) => d.statement_id));
        return result.statement_scores
            .map((s) => ({
                statement_id: s.statement_id,
                code: s.code,
                text: s.text,
                z: s.z_scores[factorIdx] ?? 0,
                isDistinguishing: distinguishingIds.has(s.statement_id),
            }))
            .sort((a, b) => Math.abs(b.z) - Math.abs(a.z))
            .slice(0, TOP_STATEMENTS_LIMIT);
    }, [result, interpret.activeFactor]);

    const handleInsertCommentQuote = useCallback(
        (comment: ParticipantCardComment, participantLabel: string) => {
            const snippet = formatQuote(t, comment, participantLabel);
            editorRef.current?.appendQuote(snippet);
            // Note: previously also called interpret.appendToNarrative(snippet),
            // but no current consumer reads the hook's narrativeDraft externally.
            // The editor's internal draft is the source of truth until save flushes
            // to factor_notes. Reintroduce the dual-write only if a consumer
            // materializes (e.g. compare-pin reading drafts).
        },
        [t]
    );

    if (!run || !result) {
        return null;
    }

    const definingSorts = interpret.flaggedParticipants.length;
    const factorKey = String(interpret.activeFactor);
    const factorNotes = run.factor_notes as
        | { [key: string]: string | undefined }
        | null
        | undefined;
    const currentNote = factorNotes?.[factorKey] ?? '';

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-4">
                <FactorSelectorChips
                    nFactors={result.n_factors}
                    activeFactor={interpret.activeFactor}
                    onSelect={onFocusChange}
                />
                <div className="text-sm text-slate-500">
                    {t('admin.analysis.interpret.def_sorts', 'Defining sorts: {{n}}', {
                        n: definingSorts,
                    })}
                </div>
                <div className="ml-auto">
                    <CompareBar
                        runs={runs}
                        currentRunId={run.id}
                        compareTo={compareTo}
                        onPin={onPin}
                        onUnpin={onUnpin}
                        phi={interpret.activeMatchPhi}
                    />
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-lg font-black text-slate-900">
                        {t('admin.analysis.interpret.statements_title', 'Statements')}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <ul className="space-y-1 text-sm">
                        {topStatements.map((s) => {
                            const delta = interpret.deltaByStatement?.get(s.statement_id);
                            const isLargeDelta =
                                delta !== undefined && Math.abs(delta) >= DELTA_Z_HIGHLIGHT;
                            return (
                                <li key={s.statement_id} className="flex items-center gap-2">
                                    <span
                                        className={
                                            s.z >= 0
                                                ? 'text-emerald-700 font-mono'
                                                : 'text-rose-700 font-mono'
                                        }
                                    >
                                        {s.z >= 0 ? '+' : ''}
                                        {s.z.toFixed(2)}
                                    </span>
                                    {delta !== undefined && (
                                        <span
                                            className={
                                                isLargeDelta
                                                    ? 'text-2xs px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 font-mono'
                                                    : 'text-2xs text-slate-500 font-mono'
                                            }
                                            role="img"
                                            aria-label={t(
                                                'admin.analysis.compare.delta_z_aria',
                                                'Δz {{delta}} vs compare run',
                                                { delta: delta.toFixed(2) }
                                            )}
                                        >
                                            Δ{delta >= 0 ? '+' : ''}
                                            {delta.toFixed(2)}
                                        </span>
                                    )}
                                    <span className="font-mono font-bold">{s.code}</span>
                                    <span className="text-slate-700 truncate flex-1">
                                        “{s.text}”
                                    </span>
                                    {s.isDistinguishing && (
                                        <span
                                            className="text-2xs px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200"
                                            role="img"
                                            aria-label="distinguishing statement"
                                        >
                                            D
                                        </span>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                </CardContent>
            </Card>

            <FactorVoicesPanel
                slug={slug}
                factorIndex={interpret.activeFactor - 1}
                participants={interpret.flaggedParticipants}
                onInsertCommentQuote={handleInsertCommentQuote}
                deltaByParticipant={interpret.deltaByParticipant ?? undefined}
            />

            <Card>
                <CardHeader>
                    <CardTitle className="text-lg font-black text-slate-900">
                        {t('admin.analysis.interpret.narrative_title', 'Narrative — F{{n}}', {
                            n: interpret.activeFactor,
                        })}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <FactorNoteEditor
                        ref={editorRef}
                        slug={slug}
                        runId={run.id}
                        factorIndex={interpret.activeFactor - 1}
                        currentNote={currentNote}
                    />
                </CardContent>
            </Card>
        </div>
    );
}

type TFn = (key: string, fallback: string, opts?: Record<string, unknown>) => string;

function formatQuote(t: TFn, comment: ParticipantCardComment, participantLabel: string): string {
    const stmtFull = comment.statement_text ?? '';
    const stmt =
        stmtFull.length > QUOTE_TRUNCATE ? `${stmtFull.slice(0, QUOTE_TRUNCATE)}…` : stmtFull;
    return t(
        'admin.analysis.quote_insert_format',
        '> {{text}}\n> — {{p}}, on statement {{code}}: "{{stmt}}"',
        {
            text: comment.comment,
            p: participantLabel,
            code: comment.statement_code,
            stmt,
        }
    );
}
