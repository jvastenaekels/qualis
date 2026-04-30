/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

/**
 * useInterpretPhase hook
 *
 * Encapsulates the Interpret phase: fetch the active run by id, optionally
 * fetch a comparison run, derive per-factor view-models (statements, voices,
 * comments), and expose the narrative-draft state + quote-insert callback.
 *
 * Visual state stays in the page component (factor selector chips, mode
 * toggle, compare-pin picker open state).
 *
 * Phase 2 limitation: factor matching for compareTo is by-index. Phase 5
 * upgrades it to Tucker's φ alignment with sign-flip and ambiguous-match
 * warnings. The deltaByStatement Map shape stays stable.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useGetAnalysisRunApiAdminStudiesSlugAnalysisRunsRunIdGet } from '@/api/generated';
import type { AnalysisResult, AnalysisRunRead, ParticipantLoading } from '@/api/model';

// ────────────────────────────────────────────────────────────────
// Public API surface
// ────────────────────────────────────────────────────────────────

export interface InterpretPhaseApi {
    run: AnalysisRunRead | null;
    isLoading: boolean;
    isError: boolean;
    activeFactor: number; // 1-based, derived from focus param
    flaggedParticipants: ParticipantLoading[];
    narrativeDraft: string;
    setNarrativeDraft: (draft: string) => void;
    appendToNarrative: (snippet: string) => void;
    compareRun: AnalysisRunRead | null;
    deltaByStatement: Map<number, number> | null;
    /**
     * Per-analyst, per-study UI preference for showing the per-factor narrative
     * editor in the interpret view. Persisted in localStorage so the choice
     * survives reloads; private to the browser (co-authors don't override).
     */
    showFactorNarratives: boolean;
    setShowFactorNarratives: (v: boolean) => void;
}

// ────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────

/**
 * Map a phase-3 focus URL param ("f1", "f2", …) to a 1-indexed factor number.
 * Defaults to 1 on garbage input so the page is still rendered.
 */
function focusToFactor(focus: string): number {
    const m = focus.match(/^f(\d+)$/i);
    return m ? Number(m[1]) : 1;
}

/**
 * Narrow the orval-generated `AnalysisRunReadResult` (typed as
 * `{ [key: string]: unknown }` because the backend column is JSONB) to the
 * stable `AnalysisResult` shape. Centralised here so the hook body stays
 * declarative; matches the cast already used in AnalysisHistoryPanel.
 */
function asAnalysisResult(result: AnalysisRunRead['result'] | undefined): AnalysisResult | null {
    if (!result) return null;
    return result as unknown as AnalysisResult;
}

// ────────────────────────────────────────────────────────────────
// Hook
// ────────────────────────────────────────────────────────────────

export function useInterpretPhase(
    slug: string,
    runId: number | null,
    focus: string,
    compareTo: number | null
): InterpretPhaseApi {
    // ── Active factor (derived) ───────────────────────────────────
    const activeFactor = useMemo(() => focusToFactor(focus), [focus]);

    // ── Run fetch ─────────────────────────────────────────────────
    // The hook always runs (React Query rules-of-hooks); we toggle the
    // request off via `enabled` when there's nothing to fetch. The id
    // passed when disabled is irrelevant — `0` is a stable sentinel so
    // the query key is deterministic across renders.
    const runQuery = useGetAnalysisRunApiAdminStudiesSlugAnalysisRunsRunIdGet(slug, runId ?? 0, {
        query: { enabled: !!slug && runId !== null },
    });
    const run = (runQuery.data as AnalysisRunRead | undefined) ?? null;
    const runResult = asAnalysisResult(run?.result);

    // ── Compare-run fetch ─────────────────────────────────────────
    const compareQuery = useGetAnalysisRunApiAdminStudiesSlugAnalysisRunsRunIdGet(
        slug,
        compareTo ?? 0,
        { query: { enabled: !!slug && compareTo !== null } }
    );
    const compareRun = (compareQuery.data as AnalysisRunRead | undefined) ?? null;
    const compareResult = asAnalysisResult(compareRun?.result);

    // ── Flagged participants on the active factor ─────────────────
    const flaggedParticipants = useMemo<ParticipantLoading[]>(() => {
        if (!runResult) return [];
        return runResult.participants.filter((p) =>
            (p.flagged_factors ?? []).includes(activeFactor)
        );
    }, [runResult, activeFactor]);

    // ── Narrative draft state ─────────────────────────────────────
    // Reset whenever the run or active factor changes — switching factors
    // or loading a different run must not leak draft state across them.
    const [narrativeDraft, setNarrativeDraftState] = useState<string>('');

    useEffect(() => {
        const notes = run?.factor_notes;
        const seed = notes?.[String(activeFactor)] ?? '';
        setNarrativeDraftState(seed);
    }, [run, activeFactor]);

    const setNarrativeDraft = useCallback((draft: string) => {
        setNarrativeDraftState(draft);
    }, []);

    const appendToNarrative = useCallback((snippet: string) => {
        setNarrativeDraftState((prev) => (prev ? `${prev}\n\n${snippet}` : snippet));
    }, []);

    // ── showFactorNarratives (localStorage-persisted UI preference) ─
    // Per-user-per-browser is the right granularity for a private view
    // preference: co-authors don't override each other. Wrapped in try/catch
    // for private mode + quota safety.
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

    // ── deltaByStatement (by-index match — Phase 2) ───────────────
    // Phase 5 (Task 27) refines this to Tucker's φ alignment with sign-flip
    // detection and ambiguous-match warnings. Map shape stays stable so the
    // page component does not need to change.
    const deltaByStatement = useMemo<Map<number, number> | null>(() => {
        if (!runResult || !compareResult) return null;
        const factorIdx = activeFactor - 1;
        const compareById = new Map(compareResult.statement_scores.map((s) => [s.statement_id, s]));
        const out = new Map<number, number>();
        for (const s of runResult.statement_scores) {
            const match = compareById.get(s.statement_id);
            if (!match) continue;
            const za = s.z_scores[factorIdx] ?? 0;
            const zb = match.z_scores[factorIdx] ?? 0;
            out.set(s.statement_id, za - zb);
        }
        return out;
    }, [runResult, compareResult, activeFactor]);

    return {
        run,
        isLoading: runQuery.isLoading,
        isError: runQuery.isError,
        activeFactor,
        flaggedParticipants,
        narrativeDraft,
        setNarrativeDraft,
        appendToNarrative,
        compareRun,
        deltaByStatement,
        showFactorNarratives,
        setShowFactorNarratives,
    };
}
