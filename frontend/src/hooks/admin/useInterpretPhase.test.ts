/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

/**
 * Unit tests for useInterpretPhase hook.
 *
 * Covers run fetch wiring, focus -> activeFactor derivation, voice filtering,
 * narrative draft state, and the by-index deltaByStatement matching used in
 * Phase 2 (pre-Tucker-φ). No JSX rendering; the @/api/generated module is
 * mocked at the boundary so the hook can be exercised in pure form.
 */

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AllTheProviders } from '@/test-utils/test-utils';
import { useInterpretPhase } from './useInterpretPhase';

// ── Mocks ──────────────────────────────────────────────────────────

const { mockGetAnalysisRunHook } = vi.hoisted(() => ({
    mockGetAnalysisRunHook: vi.fn(),
}));

vi.mock('@/api/generated', () => ({
    useGetAnalysisRunApiAdminStudiesSlugAnalysisRunsRunIdGet: mockGetAnalysisRunHook,
}));

// ── Fixtures ──────────────────────────────────────────────────────

interface FakeStatementScore {
    statement_id: number;
    code: string;
    text: string;
    z_scores: number[];
    factor_arrays: number[];
}

interface FakeParticipant {
    db_id: number;
    label: string;
    loadings: number[];
    flagged_factors?: number[] | null;
}

interface FakeRun {
    id: number;
    ran_at: string;
    n_factors: number;
    factor_notes?: { [key: string]: string };
    result: {
        n_participants: number;
        n_statements: number;
        n_factors: number;
        participants: FakeParticipant[];
        statement_scores: FakeStatementScore[];
    };
}

function makeRun(overrides: Partial<FakeRun> = {}): FakeRun {
    return {
        id: 42,
        ran_at: '2026-04-29T10:00:00Z',
        n_factors: 2,
        factor_notes: { '1': 'Initial F1 narrative.', '2': 'Initial F2 narrative.' },
        result: {
            n_participants: 3,
            n_statements: 2,
            n_factors: 2,
            participants: [
                {
                    db_id: 1,
                    label: 'P1',
                    loadings: [0.7, 0.1],
                    flagged_factors: [1],
                },
                {
                    db_id: 2,
                    label: 'P2',
                    loadings: [0.2, 0.8],
                    flagged_factors: [2],
                },
                {
                    db_id: 3,
                    label: 'P3',
                    loadings: [0.5, 0.5],
                    flagged_factors: [1, 2],
                },
            ],
            statement_scores: [
                {
                    statement_id: 10,
                    code: 'S10',
                    text: 'Statement ten',
                    z_scores: [1.5, -0.3],
                    factor_arrays: [3, -1],
                },
                {
                    statement_id: 11,
                    code: 'S11',
                    text: 'Statement eleven',
                    z_scores: [-1.2, 0.9],
                    factor_arrays: [-2, 2],
                },
            ],
        },
        ...overrides,
    };
}

function makeIdleRunQuery() {
    return {
        data: undefined,
        isLoading: false,
        isError: false,
        error: null,
    };
}

function makeLoadedRunQuery(run: FakeRun) {
    return {
        data: run,
        isLoading: false,
        isError: false,
        error: null,
    };
}

// ── Tests ─────────────────────────────────────────────────────────

describe('useInterpretPhase', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Default to idle for any call
        mockGetAnalysisRunHook.mockReturnValue(makeIdleRunQuery());
    });

    it('returns null run and disables fetches when runId is null', () => {
        const { result } = renderHook(() => useInterpretPhase('test-study', null, 'f1', null), {
            wrapper: AllTheProviders,
        });

        expect(result.current.run).toBeNull();
        expect(result.current.isLoading).toBe(false);
        expect(result.current.activeFactor).toBe(1);
        expect(result.current.flaggedParticipants).toEqual([]);
        expect(result.current.compareRun).toBeNull();
        expect(result.current.deltaByStatement).toBeNull();

        // Both calls must be made disabled when their id is null
        const calls = mockGetAnalysisRunHook.mock.calls;
        expect(calls.length).toBeGreaterThanOrEqual(2);
        for (const call of calls) {
            const opts = call[2] as { query?: { enabled?: boolean } } | undefined;
            expect(opts?.query?.enabled).toBe(false);
        }
    });

    it('exposes the loaded run, result, and activeFactor=1 when focus="f1"', () => {
        const run = makeRun();
        // First call (run) → loaded; second call (compareRun, runId=0) → idle
        mockGetAnalysisRunHook.mockImplementation((_slug: string, runId: number) => {
            if (runId === 42) return makeLoadedRunQuery(run);
            return makeIdleRunQuery();
        });

        const { result } = renderHook(() => useInterpretPhase('test-study', 42, 'f1', null), {
            wrapper: AllTheProviders,
        });

        expect(result.current.run).toEqual(run);
        expect(result.current.activeFactor).toBe(1);
        expect(result.current.compareRun).toBeNull();
        expect(result.current.deltaByStatement).toBeNull();
    });

    it('filters flaggedParticipants to those flagged on the active factor', () => {
        const run = makeRun();
        mockGetAnalysisRunHook.mockImplementation((_slug: string, runId: number) =>
            runId === 42 ? makeLoadedRunQuery(run) : makeIdleRunQuery()
        );

        const { result } = renderHook(() => useInterpretPhase('test-study', 42, 'f1', null), {
            wrapper: AllTheProviders,
        });

        // F1 flagged: P1 (db_id=1) and P3 (db_id=3)
        expect(result.current.flaggedParticipants.map((p) => p.db_id)).toEqual([1, 3]);
    });

    it('switches activeFactor when the focus URL param changes', () => {
        const run = makeRun();
        mockGetAnalysisRunHook.mockImplementation((_slug: string, runId: number) =>
            runId === 42 ? makeLoadedRunQuery(run) : makeIdleRunQuery()
        );

        const { result, rerender } = renderHook(
            ({ focus }: { focus: string }) => useInterpretPhase('test-study', 42, focus, null),
            {
                wrapper: AllTheProviders,
                initialProps: { focus: 'f1' },
            }
        );

        expect(result.current.activeFactor).toBe(1);
        // F1 flagged → P1, P3
        expect(result.current.flaggedParticipants.map((p) => p.db_id)).toEqual([1, 3]);

        rerender({ focus: 'f2' });

        expect(result.current.activeFactor).toBe(2);
        // F2 flagged → P2, P3
        expect(result.current.flaggedParticipants.map((p) => p.db_id)).toEqual([2, 3]);
    });

    it('defaults activeFactor to 1 on garbage focus input', () => {
        const { result } = renderHook(
            () => useInterpretPhase('test-study', null, 'garbage', null),
            { wrapper: AllTheProviders }
        );
        expect(result.current.activeFactor).toBe(1);
    });

    it('initializes narrativeDraft from factor_notes[activeFactor] when run loads', () => {
        const run = makeRun();
        mockGetAnalysisRunHook.mockImplementation((_slug: string, runId: number) =>
            runId === 42 ? makeLoadedRunQuery(run) : makeIdleRunQuery()
        );

        const { result } = renderHook(() => useInterpretPhase('test-study', 42, 'f2', null), {
            wrapper: AllTheProviders,
        });

        expect(result.current.narrativeDraft).toBe('Initial F2 narrative.');
    });

    it('initializes narrativeDraft to empty when factor_notes is missing the active factor', () => {
        const run = makeRun({ factor_notes: { '1': 'Only F1.' } });
        mockGetAnalysisRunHook.mockImplementation((_slug: string, runId: number) =>
            runId === 42 ? makeLoadedRunQuery(run) : makeIdleRunQuery()
        );

        const { result } = renderHook(() => useInterpretPhase('test-study', 42, 'f2', null), {
            wrapper: AllTheProviders,
        });

        expect(result.current.narrativeDraft).toBe('');
    });

    it('appendToNarrative joins snippets with double-newline separator', () => {
        const run = makeRun({ factor_notes: { '1': 'Seed.' } });
        mockGetAnalysisRunHook.mockImplementation((_slug: string, runId: number) =>
            runId === 42 ? makeLoadedRunQuery(run) : makeIdleRunQuery()
        );

        const { result } = renderHook(() => useInterpretPhase('test-study', 42, 'f1', null), {
            wrapper: AllTheProviders,
        });

        expect(result.current.narrativeDraft).toBe('Seed.');

        act(() => {
            result.current.appendToNarrative('Quote one.');
        });
        expect(result.current.narrativeDraft).toBe('Seed.\n\nQuote one.');

        act(() => {
            result.current.appendToNarrative('Quote two.');
        });
        expect(result.current.narrativeDraft).toBe('Seed.\n\nQuote one.\n\nQuote two.');
    });

    it('appendToNarrative uses the snippet alone when prior draft is empty', () => {
        // No factor_notes → narrativeDraft starts empty.
        const run = makeRun({ factor_notes: undefined });
        mockGetAnalysisRunHook.mockImplementation((_slug: string, runId: number) =>
            runId === 42 ? makeLoadedRunQuery(run) : makeIdleRunQuery()
        );

        const { result } = renderHook(() => useInterpretPhase('test-study', 42, 'f1', null), {
            wrapper: AllTheProviders,
        });

        expect(result.current.narrativeDraft).toBe('');

        act(() => {
            result.current.appendToNarrative('First snippet.');
        });
        expect(result.current.narrativeDraft).toBe('First snippet.');
    });

    it('setNarrativeDraft replaces the draft entirely', () => {
        const run = makeRun();
        mockGetAnalysisRunHook.mockImplementation((_slug: string, runId: number) =>
            runId === 42 ? makeLoadedRunQuery(run) : makeIdleRunQuery()
        );

        const { result } = renderHook(() => useInterpretPhase('test-study', 42, 'f1', null), {
            wrapper: AllTheProviders,
        });

        act(() => {
            result.current.setNarrativeDraft('Manual override.');
        });
        expect(result.current.narrativeDraft).toBe('Manual override.');
    });

    it('computes deltaByStatement when both runs are loaded (by-index match)', () => {
        const baseRun = makeRun({ id: 42 });
        const compare = makeRun({
            id: 7,
            result: {
                n_participants: 3,
                n_statements: 2,
                n_factors: 2,
                participants: baseRun.result.participants,
                statement_scores: [
                    {
                        statement_id: 10,
                        code: 'S10',
                        text: 'Statement ten',
                        // F1 z = 0.5 → Δz = baseZ(1.5) - compareZ(0.5) = 1.0
                        z_scores: [0.5, 0.0],
                        factor_arrays: [1, 0],
                    },
                    {
                        statement_id: 11,
                        code: 'S11',
                        text: 'Statement eleven',
                        // F1 z = -2.0 → Δz = baseZ(-1.2) - compareZ(-2.0) = 0.8
                        z_scores: [-2.0, 0.0],
                        factor_arrays: [-3, 0],
                    },
                ],
            },
        });

        mockGetAnalysisRunHook.mockImplementation((_slug: string, runId: number) => {
            if (runId === 42) return makeLoadedRunQuery(baseRun);
            if (runId === 7) return makeLoadedRunQuery(compare);
            return makeIdleRunQuery();
        });

        const { result } = renderHook(() => useInterpretPhase('test-study', 42, 'f1', 7), {
            wrapper: AllTheProviders,
        });

        const delta = result.current.deltaByStatement;
        expect(delta).not.toBeNull();
        expect(delta?.size).toBe(2);
        expect(delta?.get(10)).toBeCloseTo(1.0, 6);
        expect(delta?.get(11)).toBeCloseTo(0.8, 6);
    });

    it('skips statements without a match in the compare run', () => {
        const baseRun = makeRun({ id: 42 });
        const compare = makeRun({
            id: 7,
            result: {
                n_participants: 3,
                n_statements: 1,
                n_factors: 2,
                participants: baseRun.result.participants,
                statement_scores: [
                    // Only matches statement_id=10; statement_id=11 is missing.
                    {
                        statement_id: 10,
                        code: 'S10',
                        text: 'Statement ten',
                        z_scores: [1.0, 0.0],
                        factor_arrays: [2, 0],
                    },
                ],
            },
        });

        mockGetAnalysisRunHook.mockImplementation((_slug: string, runId: number) => {
            if (runId === 42) return makeLoadedRunQuery(baseRun);
            if (runId === 7) return makeLoadedRunQuery(compare);
            return makeIdleRunQuery();
        });

        const { result } = renderHook(() => useInterpretPhase('test-study', 42, 'f1', 7), {
            wrapper: AllTheProviders,
        });

        const delta = result.current.deltaByStatement;
        expect(delta).not.toBeNull();
        expect(delta?.size).toBe(1);
        expect(delta?.has(10)).toBe(true);
        expect(delta?.has(11)).toBe(false);
    });

    it('returns deltaByStatement=null when compareTo is null', () => {
        const run = makeRun();
        mockGetAnalysisRunHook.mockImplementation((_slug: string, runId: number) =>
            runId === 42 ? makeLoadedRunQuery(run) : makeIdleRunQuery()
        );

        const { result } = renderHook(() => useInterpretPhase('test-study', 42, 'f1', null), {
            wrapper: AllTheProviders,
        });

        expect(result.current.compareRun).toBeNull();
        expect(result.current.deltaByStatement).toBeNull();
    });

    describe('showFactorNarratives localStorage', () => {
        beforeEach(() => {
            window.localStorage.clear();
        });

        it('defaults to true when localStorage is empty', () => {
            const { result } = renderHook(() => useInterpretPhase('test-slug', null, 'f1', null), {
                wrapper: AllTheProviders,
            });
            expect(result.current.showFactorNarratives).toBe(true);
        });

        it('reads false from localStorage', () => {
            window.localStorage.setItem('qualis-analysis-show-narratives-test-slug', 'false');
            const { result } = renderHook(() => useInterpretPhase('test-slug', null, 'f1', null), {
                wrapper: AllTheProviders,
            });
            expect(result.current.showFactorNarratives).toBe(false);
        });

        it('writes the new value on toggle', () => {
            const { result } = renderHook(() => useInterpretPhase('test-slug', null, 'f1', null), {
                wrapper: AllTheProviders,
            });
            act(() => {
                result.current.setShowFactorNarratives(false);
            });
            expect(window.localStorage.getItem('qualis-analysis-show-narratives-test-slug')).toBe(
                'false'
            );
            expect(result.current.showFactorNarratives).toBe(false);
        });

        it('uses per-study localStorage keys', () => {
            window.localStorage.setItem('qualis-analysis-show-narratives-study-a', 'false');
            const { result } = renderHook(() => useInterpretPhase('study-b', null, 'f1', null), {
                wrapper: AllTheProviders,
            });
            // Different slug → default true (no leakage from study-a).
            expect(result.current.showFactorNarratives).toBe(true);
        });
    });
});
