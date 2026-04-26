/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

/**
 * useAnalysisPage hook
 *
 * Encapsulates the durable state-and-effect logic for the Analysis admin page.
 * AnalysisPage receives this hook's return value and renders JSX from it.
 *
 * Visual-only state that stays in the component:
 * - activeTab (Radix UI Tabs visual state)
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ApiError } from '@/api/client';
import { useQueryClient } from '@tanstack/react-query';
import {
    useGetEigenvaluesApiAdminStudiesSlugAnalysisEigenvaluesGet,
    useRunFactorAnalysisApiAdminStudiesSlugAnalysisRunPost,
    listAnalysisRunsApiAdminStudiesSlugAnalysisRunsGet,
    getListAnalysisRunsApiAdminStudiesSlugAnalysisRunsGetQueryKey,
} from '@/api/generated';
import type { AnalysisResult, AnalysisRunSummary } from '@/api/model';
import { generateAnalysisXlsx } from '@/utils/analysisXlsxExport';

// ────────────────────────────────────────────────────────────────
// Module-level CSV/blob helpers (pure, no state dependency)
// ────────────────────────────────────────────────────────────────

function downloadBlob(blob: Blob, filename: string): void {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();
}

function generateLoadingsCsv(result: AnalysisResult): string {
    const headers = [
        'Participant',
        ...Array.from({ length: result.n_factors }, (_, f) => `F${f + 1}`),
        'Flagged',
    ];
    const rows = result.participants.map((p) => [
        p.label,
        ...p.loadings.map((l) => l.toFixed(4)),
        (p.flagged_factors ?? []).map((f) => `F${f}`).join(';') || '',
    ]);
    return [headers, ...rows].map((r) => r.join(',')).join('\n');
}

function generateScoresCsv(result: AnalysisResult): string {
    const dIds = new Set(result.distinguishing.map((d) => d.statement_id));
    const headers = [
        'Code',
        'Statement',
        ...Array.from({ length: result.n_factors }, (_, f) => `F${f + 1} Z-Score`),
        ...Array.from({ length: result.n_factors }, (_, f) => `F${f + 1} Array`),
        'Type',
    ];
    const rows = result.statement_scores.map((s) => [
        s.code,
        `"${s.text.replace(/"/g, '""')}"`,
        ...s.z_scores.map((z) => z.toFixed(2)),
        ...s.factor_arrays.map(String),
        dIds.has(s.statement_id)
            ? 'D'
            : result.consensus.some((c) => c.statement_id === s.statement_id)
              ? 'C'
              : '',
    ]);
    return [headers, ...rows].map((r) => r.join(',')).join('\n');
}

// ────────────────────────────────────────────────────────────────
// Public API surface
// ────────────────────────────────────────────────────────────────

export interface AnalysisPageApi {
    // Slug
    slug: string;

    // Form state
    extraction: string;
    setExtraction: (value: string) => void;
    nFactors: number;
    setNFactors: (value: number) => void;
    rotation: string;
    setRotation: (value: string) => void;
    flagging: 'auto' | 'manual';
    setFlagging: (value: 'auto' | 'manual') => void;
    manualFlags: Record<number, number[]>;

    // Derived / query state
    maxFactors: number;
    hasEigenvalues: boolean;
    isTooFewParticipants: boolean;
    isEigenvalueError: boolean;
    eigenvaluesIsLoading: boolean;
    eigenvalues: number[] | undefined;
    suggestedNFactors: number | undefined;
    handleRefetchEigenvalues: () => void;

    // Run state
    isRunning: boolean;
    isExporting: boolean;

    // Result
    result: AnalysisResult | null;
    viewingRun: AnalysisRunSummary | null;
    isViewingHistorical: boolean;
    /**
     * The AnalysisRun summary for the result currently displayed, regardless
     * of whether it came from a fresh run or was loaded from history. Used by
     * the per-factor narrative editor to know which run id to PATCH.
     * `null` until the first analysis is run/loaded.
     */
    currentRun: AnalysisRunSummary | null;

    /**
     * Per-analyst, per-study UI preference for showing the per-factor
     * narrative editor in the Factor Arrays view. Persisted in localStorage
     * (`qualis-analysis-show-narratives-{slug}`) so the toggle survives
     * across visits to the same study in the same browser. Independent
     * across co-authors — toggling does not affect other users' views, and
     * does not delete already-written narratives (it only hides the editor).
     */
    showFactorNarratives: boolean;
    setShowFactorNarratives: (v: boolean) => void;

    // Handlers
    handleRunAnalysis: () => void;
    handleLoadHistoricalRun: (historicalResult: AnalysisResult, run: AnalysisRunSummary) => void;
    handleClearHistoricalView: () => void;
    handleToggleFlag: (participantDbId: number, factorNumber: number) => void;
    handleExport: (type: 'loadings' | 'scores' | 'xlsx') => Promise<void>;
}

// ────────────────────────────────────────────────────────────────
// Hook
// ────────────────────────────────────────────────────────────────

export function useAnalysisPage(slug: string): AnalysisPageApi {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const [, setSearchParams] = useSearchParams();
    const [searchParamsSnapshot] = useSearchParams();

    // ── Form state (persisted in URL) ─────────────────────────────
    const [extraction, setExtraction] = useState(searchParamsSnapshot.get('extraction') || 'pca');
    const [nFactors, setNFactors] = useState(Number(searchParamsSnapshot.get('nFactors')) || 3);
    const [rotation, setRotation] = useState(searchParamsSnapshot.get('rotation') || 'varimax');
    const [flagging, setFlaggingRaw] = useState<'auto' | 'manual'>(
        (searchParamsSnapshot.get('flagging') as 'auto' | 'manual') || 'auto'
    );
    const [manualFlags, setManualFlags] = useState<Record<number, number[]>>({});

    // Wrap setFlagging so that switching to auto always clears manualFlags
    const setFlagging = useCallback((value: 'auto' | 'manual') => {
        setFlaggingRaw(value);
        if (value === 'auto') {
            setManualFlags({});
        }
    }, []);
    const manualFlagsInitialized = useRef(false);

    // ── Result / history state ────────────────────────────────────
    const [result, setResult] = useState<AnalysisResult | null>(null);
    const [viewingRun, setViewingRun] = useState<AnalysisRunSummary | null>(null);
    // `freshRun` holds the AnalysisRunSummary that the just-completed POST
    // /analysis/run created. Distinct from `viewingRun`, which is set only
    // when the user clicks a historical run in the history panel. Together
    // they let `currentRun` always point to the run summary for the result
    // on screen — needed by the per-factor narrative editor.
    const [freshRun, setFreshRun] = useState<AnalysisRunSummary | null>(null);
    const [isExporting, setIsExporting] = useState(false);

    // ── Per-analyst, per-study view prefs (localStorage-persisted) ───
    // The "show factor narratives" toggle lets analysts hide the per-factor
    // narrative editor when working in a more classical Q-method mode.
    // localStorage is per-user-per-browser, which is the right granularity
    // for a private view preference: co-authors don't override each other.
    const narrativesPrefKey = `qualis-analysis-show-narratives-${slug || ''}`;
    const [showFactorNarratives, setShowFactorNarrativesState] = useState<boolean>(() => {
        if (!slug) return true;
        try {
            const raw = window.localStorage.getItem(narrativesPrefKey);
            if (raw === null) return true;
            return raw === 'true';
        } catch {
            return true;
        }
    });
    const setShowFactorNarratives = useCallback(
        (v: boolean) => {
            setShowFactorNarrativesState(v);
            try {
                window.localStorage.setItem(narrativesPrefKey, String(v));
            } catch {
                // Ignore localStorage errors (e.g., quota exceeded, private mode).
            }
        },
        [narrativesPrefKey]
    );

    // ── URL sync ──────────────────────────────────────────────────
    const syncParams = useCallback(
        (ext: string, nf: number, rot: string, flag: string) => {
            setSearchParams(
                { extraction: ext, nFactors: String(nf), rotation: rot, flagging: flag },
                { replace: true }
            );
        },
        [setSearchParams]
    );

    // ── Eigenvalues query ─────────────────────────────────────────
    const eigenvaluesQuery = useGetEigenvaluesApiAdminStudiesSlugAnalysisEigenvaluesGet(slug, {
        query: { enabled: !!slug },
    });

    // ── Derived: maxFactors ───────────────────────────────────────
    const maxFactors = useMemo(() => {
        if (!eigenvaluesQuery.data) return 10;
        return Math.min(Math.max(eigenvaluesQuery.data.eigenvalues.length - 1, 1), 10);
    }, [eigenvaluesQuery.data]);

    // ── Effect: set suggested nFactors when eigenvalues load ──────
    useEffect(() => {
        if (eigenvaluesQuery.data && !result) {
            const suggested = eigenvaluesQuery.data.suggested_n_factors;
            const capped = Math.min(suggested, maxFactors);
            setNFactors(capped);
        }
    }, [eigenvaluesQuery.data, result, maxFactors]);

    // ── Effect: clamp nFactors when maxFactors changes ────────────
    useEffect(() => {
        if (nFactors > maxFactors) {
            setNFactors(maxFactors);
        }
    }, [maxFactors, nFactors]);

    // ── Analysis mutation ─────────────────────────────────────────
    const analysisMutation = useRunFactorAnalysisApiAdminStudiesSlugAnalysisRunPost({
        mutation: { retry: false },
    });

    const isRunning = analysisMutation.isPending;

    // ── Handlers ──────────────────────────────────────────────────
    const handleRunAnalysis = useCallback(() => {
        const manualFlagsPayload: Record<string, number> | undefined =
            flagging === 'manual'
                ? Object.fromEntries(
                      Object.entries(manualFlags).flatMap(([dbId, factors]) =>
                          factors.map((f) => [dbId, f])
                      )
                  )
                : undefined;

        analysisMutation.mutate(
            {
                slug,
                data: {
                    extraction,
                    n_factors: nFactors,
                    rotation,
                    flagging,
                    manual_flags: manualFlagsPayload,
                },
            },
            {
                onSuccess: async (data) => {
                    setResult(data);
                    setViewingRun(null);
                    syncParams(extraction, nFactors, rotation, flagging);
                    toast.success(
                        t('admin.analysis.success', 'Analysis complete — {{n}} factors extracted', {
                            n: data.n_factors,
                        })
                    );
                    // Invalidate the runs list so the history panel refreshes,
                    // then fetch the freshest run and store it as `freshRun`.
                    // This lets the per-factor narrative editor know which run
                    // id to PATCH when the analyst writes a factor narrative,
                    // without changing `viewingRun` (which means "loaded from
                    // history" — distinct from a fresh result).
                    const runsQueryKey =
                        getListAnalysisRunsApiAdminStudiesSlugAnalysisRunsGetQueryKey(slug);
                    queryClient.invalidateQueries({ queryKey: runsQueryKey });
                    try {
                        const runs = await listAnalysisRunsApiAdminStudiesSlugAnalysisRunsGet(slug);
                        // Runs are sorted desc by ran_at server-side.
                        setFreshRun(runs.length > 0 ? (runs[0] ?? null) : null);
                    } catch {
                        // Non-fatal: the analyst can reload from history if
                        // they want to write factor narratives.
                        setFreshRun(null);
                    }
                },
                onError: (error) => {
                    const message = error instanceof Error ? error.message : String(error);
                    toast.error(
                        t('admin.analysis.error', 'Analysis failed: {{message}}', { message })
                    );
                },
            }
        );
    }, [
        slug,
        extraction,
        nFactors,
        rotation,
        flagging,
        manualFlags,
        analysisMutation,
        syncParams,
        t,
        queryClient,
    ]);

    const handleLoadHistoricalRun = useCallback(
        (historicalResult: AnalysisResult, run: AnalysisRunSummary) => {
            if (!historicalResult || !run) {
                setViewingRun(null);
                return;
            }
            setResult(historicalResult);
            setViewingRun(run);
            // Loading a historical run takes precedence over the freshly-run
            // tracker. `currentRun` reads viewingRun first (see the API
            // assembly below), so this is implicitly handled, but we clear
            // freshRun to keep state tidy.
            setFreshRun(null);
        },
        []
    );

    const handleClearHistoricalView = useCallback(() => {
        setViewingRun(null);
    }, []);

    const handleToggleFlag = useCallback((participantDbId: number, factorNumber: number) => {
        setManualFlags((prev) => {
            const current = prev[participantDbId] ?? [];
            const has = current.includes(factorNumber);
            const next = has ? [] : [factorNumber];
            return { ...prev, [participantDbId]: next };
        });
    }, []);

    // ── Effect: initialize manual flags from auto-flagging result ──
    useEffect(() => {
        if (result && flagging === 'manual' && !manualFlagsInitialized.current) {
            const flags: Record<number, number[]> = {};
            for (const p of result.participants) {
                if (p.flagged_factors && p.flagged_factors.length > 0) {
                    flags[p.db_id] = [...p.flagged_factors];
                }
            }
            setManualFlags(flags);
            manualFlagsInitialized.current = true;
        }
        if (flagging === 'auto') {
            manualFlagsInitialized.current = false;
        }
    }, [result, flagging]);

    const handleExport = useCallback(
        async (type: 'loadings' | 'scores' | 'xlsx') => {
            if (!result) return;
            if (type === 'xlsx') {
                setIsExporting(true);
                try {
                    const factorNotes = (viewingRun ?? freshRun)?.factor_notes ?? undefined;
                    const blob = await generateAnalysisXlsx(result, factorNotes);
                    downloadBlob(blob, `${slug}_analysis.xlsx`);
                } catch {
                    toast.error(
                        t('admin.analysis.export_error', 'Failed to generate XLSX export.')
                    );
                } finally {
                    setIsExporting(false);
                }
                return;
            }
            const csv =
                type === 'loadings' ? generateLoadingsCsv(result) : generateScoresCsv(result);
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            downloadBlob(blob, `${slug}_analysis_${type}.csv`);
        },
        [result, slug, t, viewingRun, freshRun]
    );

    const handleRefetchEigenvalues = useCallback(() => {
        void eigenvaluesQuery.refetch();
    }, [eigenvaluesQuery]);

    // ── Derived error flags ───────────────────────────────────────
    const isTooFewParticipants =
        eigenvaluesQuery.isError &&
        eigenvaluesQuery.error instanceof ApiError &&
        eigenvaluesQuery.error.status === 400;
    const isEigenvalueError = eigenvaluesQuery.isError && !isTooFewParticipants;
    const hasEigenvalues = eigenvaluesQuery.isSuccess && !!eigenvaluesQuery.data;

    return {
        slug,
        extraction,
        setExtraction,
        nFactors,
        setNFactors,
        rotation,
        setRotation,
        flagging,
        setFlagging,
        manualFlags,
        maxFactors,
        hasEigenvalues,
        isTooFewParticipants,
        isEigenvalueError,
        eigenvaluesIsLoading: eigenvaluesQuery.isLoading,
        eigenvalues: eigenvaluesQuery.data?.eigenvalues,
        suggestedNFactors: eigenvaluesQuery.data?.suggested_n_factors,
        handleRefetchEigenvalues,
        isRunning,
        isExporting,
        result,
        viewingRun,
        isViewingHistorical: viewingRun !== null,
        currentRun: viewingRun ?? freshRun,
        showFactorNarratives,
        setShowFactorNarratives,
        handleRunAnalysis,
        handleLoadHistoricalRun,
        handleClearHistoricalView,
        handleToggleFlag,
        handleExport,
    };
}
