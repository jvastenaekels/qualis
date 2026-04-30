/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

/**
 * useExplorePhase hook
 *
 * Explorer phase: form state, eigenvalues, diagnostics, commit handler. Does NOT
 * manage the post-run interpretation surfaces (those live in useInterpretPhase).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
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
import type { ManualRotation } from '@/api/model';

/**
 * Client-side draft of a manual rotation row. Carries a stable `id` used as the
 * React key so removing or reordering rows mid-edit doesn't mis-mount the Input
 * fields (focus + cursor preserved). The id is stripped before the rotation is
 * POSTed to the analysis API.
 */
export type ManualRotationDraft = ManualRotation & { id: string };

function newRotationId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `mr-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

// ────────────────────────────────────────────────────────────────
// Public API surface
// ────────────────────────────────────────────────────────────────

export interface ExplorePhaseApi {
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

    /**
     * Sequence of judgmental rotations to apply when `rotation === 'judgmental'`.
     * Each entry rotates the (factor_a, factor_b) factor pair by `angle_deg`
     * degrees; rotations are applied in list order. Empty for varimax/none
     * (Brown 1980; Watts & Stenner 2012).
     *
     * `id` is a client-only stable key for React reconciliation; it is stripped
     * before the rotation is sent to the API so removing/reordering items mid-edit
     * doesn't mis-mount input fields.
     */
    manualRotations: ManualRotationDraft[];
    addManualRotation: () => void;
    updateManualRotation: (index: number, partial: Partial<ManualRotation>) => void;
    removeManualRotation: (index: number) => void;

    /** True when the Run button should be disabled because the judgmental
     * rotation list is empty (without this rotations would silently be a no-op). */
    isJudgmentalWithoutRotations: boolean;

    /**
     * Optional non-parametric bootstrap of Q-sorts (Zabala & Pascual 2016).
     * When enabled, the analysis is repeated B times on resampled Q-sorts to
     * estimate SEs on z-scores. Off by default; existing behaviour unchanged.
     */
    bootstrapEnabled: boolean;
    setBootstrapEnabled: (value: boolean) => void;
    bootstrapIterations: number;
    setBootstrapIterations: (value: number) => void;

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

    // Handlers
    handleRunAnalysis: () => void;
}

// ────────────────────────────────────────────────────────────────
// Hook
// ────────────────────────────────────────────────────────────────

export function useExplorePhase(slug: string, onCommit: (runId: number) => void): ExplorePhaseApi {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const [searchParamsSnapshot] = useSearchParams();

    // ── Form state (persisted in URL) ─────────────────────────────
    const [extraction, setExtraction] = useState(searchParamsSnapshot.get('extraction') || 'pca');
    const [nFactors, setNFactors] = useState(Number(searchParamsSnapshot.get('nFactors')) || 3);
    const [rotation, setRotationRaw] = useState(searchParamsSnapshot.get('rotation') || 'varimax');
    const [flagging, setFlaggingRaw] = useState<'auto' | 'manual'>(
        (searchParamsSnapshot.get('flagging') as 'auto' | 'manual') || 'auto'
    );
    const [manualFlags, setManualFlags] = useState<Record<number, number[]>>({});
    const [manualRotations, setManualRotations] = useState<ManualRotationDraft[]>([]);
    const [bootstrapEnabled, setBootstrapEnabled] = useState<boolean>(false);
    const [bootstrapIterations, setBootstrapIterations] = useState<number>(1000);

    // Wrap setFlagging so that switching to auto always clears manualFlags
    const setFlagging = useCallback((value: 'auto' | 'manual') => {
        setFlaggingRaw(value);
        if (value === 'auto') {
            setManualFlags({});
        }
    }, []);

    // Wrap setRotation: leaving 'judgmental' clears the manual rotation list
    // (the backend rejects mixed configs anyway; this keeps the UI consistent
    // with what would actually be sent).
    const setRotation = useCallback((value: string) => {
        setRotationRaw(value);
        if (value !== 'judgmental') {
            setManualRotations([]);
        }
    }, []);

    const addManualRotation = useCallback(() => {
        setManualRotations((prev) => [
            ...prev,
            { id: newRotationId(), factor_a: 1, factor_b: 2, angle_deg: 0 },
        ]);
    }, []);

    const updateManualRotation = useCallback((index: number, partial: Partial<ManualRotation>) => {
        setManualRotations((prev) => prev.map((r, i) => (i === index ? { ...r, ...partial } : r)));
    }, []);

    const removeManualRotation = useCallback((index: number) => {
        setManualRotations((prev) => prev.filter((_, i) => i !== index));
    }, []);

    // ── Eigenvalues query ─────────────────────────────────────────
    // 4xx responses (e.g. 400 "Need at least 2 valid participants") are
    // not transient — retrying them just delays the user-visible alert
    // and burns console errors. Settle immediately on 4xx; keep the
    // small retry budget for genuine network/5xx blips.
    const eigenvaluesQuery = useGetEigenvaluesApiAdminStudiesSlugAnalysisEigenvaluesGet(slug, {
        query: {
            enabled: !!slug,
            retry: (failureCount, error) => {
                if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
                    return false;
                }
                return failureCount < 2;
            },
        },
    });

    // ── Derived: maxFactors ───────────────────────────────────────
    const maxFactors = useMemo(() => {
        if (!eigenvaluesQuery.data) return 10;
        return Math.min(Math.max(eigenvaluesQuery.data.eigenvalues.length - 1, 1), 10);
    }, [eigenvaluesQuery.data]);

    // ── Effect: set suggested nFactors when eigenvalues load ──────
    useEffect(() => {
        if (eigenvaluesQuery.data) {
            const suggested = eigenvaluesQuery.data.suggested_n_factors;
            const capped = Math.min(suggested, maxFactors);
            setNFactors(capped);
        }
    }, [eigenvaluesQuery.data, maxFactors]);

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
                    manual_rotations:
                        rotation === 'judgmental'
                            ? manualRotations.map(({ factor_a, factor_b, angle_deg }) => ({
                                  factor_a,
                                  factor_b,
                                  angle_deg,
                              }))
                            : null,
                    bootstrap_iterations: bootstrapEnabled ? bootstrapIterations : null,
                },
            },
            {
                onSuccess: async (data) => {
                    toast.success(
                        t('admin.analysis.success', 'Analysis complete — {{n}} factors extracted', {
                            n: data.n_factors,
                        })
                    );
                    // Invalidate the runs list so the history panel refreshes when the
                    // analyst returns. Then fetch the fresh runId so the caller can route.
                    const runsQueryKey =
                        getListAnalysisRunsApiAdminStudiesSlugAnalysisRunsGetQueryKey(slug);
                    queryClient.invalidateQueries({ queryKey: runsQueryKey });
                    try {
                        const runs = await listAnalysisRunsApiAdminStudiesSlugAnalysisRunsGet(slug);
                        const fresh = runs.length > 0 ? (runs[0] ?? null) : null;
                        if (fresh) onCommit(fresh.id);
                    } catch {
                        // Non-fatal: the analyst can navigate via history.
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
        manualRotations,
        bootstrapEnabled,
        bootstrapIterations,
        analysisMutation,
        t,
        queryClient,
        onCommit,
    ]);

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

    const isJudgmentalWithoutRotations = rotation === 'judgmental' && manualRotations.length === 0;

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
        manualRotations,
        addManualRotation,
        updateManualRotation,
        removeManualRotation,
        isJudgmentalWithoutRotations,
        bootstrapEnabled,
        setBootstrapEnabled,
        bootstrapIterations,
        setBootstrapIterations,
        maxFactors,
        hasEigenvalues,
        isTooFewParticipants,
        isEigenvalueError,
        eigenvaluesIsLoading: eigenvaluesQuery.isLoading,
        eigenvalues: eigenvaluesQuery.data?.eigenvalues,
        suggestedNFactors: eigenvaluesQuery.data?.suggested_n_factors,
        handleRefetchEigenvalues,
        isRunning,
        handleRunAnalysis,
    };
}
