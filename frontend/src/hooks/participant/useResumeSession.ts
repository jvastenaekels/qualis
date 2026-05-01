/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

/**
 * Resume session hook + pure helpers.
 *
 * Restores a participant session from a resume token: API call → store
 * hydration → navigation. The pure helpers (parseResumeError,
 * validateDraftResponses) are unit-tested without rendering; the hook
 * orchestrates side effects.
 */

import { useEffect, useState } from 'react';
import type { i18n as I18nType } from 'i18next';
import { useTranslation } from 'react-i18next';
import { useNavigate, type NavigateFunction } from 'react-router-dom';
import { toast } from 'sonner';
import type { ResumeResponse } from '../../api/model';
import { customInstance } from '../../api/mutator';
import { STEP_ROUTES } from '../../constants/stepRoutes';
import { initialResponses, useResponseStore } from '../../store/useResponseStore';
import { useSessionStore } from '../../store/useSessionStore';
import { resetAllStores } from '../../utils/sessionReset';

export type ResumeError = 'not_found' | 'study_closed' | 'rate_limited' | 'error';

/**
 * Outcome of inspecting a thrown API error. `error` maps to a user-facing
 * screen; `redirect-completed` is the special case where the backend says the
 * session was already submitted (HTTP 410) and we route to the confirmation
 * screen instead of showing an error.
 */
export type ParsedResumeError =
    | { kind: 'error'; code: ResumeError }
    | { kind: 'redirect-completed' };

export function parseResumeError(err: unknown): ParsedResumeError {
    const status =
        err && typeof err === 'object' && 'status' in err ? (err as { status: number }).status : 0;

    if (status === 404) return { kind: 'error', code: 'not_found' };
    if (status === 410) return { kind: 'redirect-completed' };
    if (status === 403) return { kind: 'error', code: 'study_closed' };
    if (status === 429) return { kind: 'error', code: 'rate_limited' };
    return { kind: 'error', code: 'error' };
}

type DraftLike = Record<string, unknown>;

interface ValidatedDraft {
    presort: typeof initialResponses.presort;
    rough: typeof initialResponses.rough;
    qsort: typeof initialResponses.qsort;
    postsort: typeof initialResponses.postsort;
}

/**
 * Per-key shape validation of a `draft_responses` payload. Each key falls
 * back to `initialResponses.<key>` independently when its shape is wrong, so
 * a corrupted slice cannot poison neighbouring slices.
 *
 * Returns `null` when the draft is empty / missing — caller skips hydration.
 */
export function validateDraftResponses(draft: unknown): ValidatedDraft | null {
    if (!draft || typeof draft !== 'object' || Array.isArray(draft)) return null;
    const d = draft as DraftLike;
    if (Object.keys(d).length === 0) return null;

    const isPresortShape = d.presort && typeof d.presort === 'object' && !Array.isArray(d.presort);

    const roughObj = d.rough as Record<string, unknown> | undefined;
    const isRoughShape =
        roughObj &&
        typeof roughObj === 'object' &&
        Array.isArray(roughObj.agree) &&
        Array.isArray(roughObj.disagree) &&
        Array.isArray(roughObj.neutral) &&
        Array.isArray(roughObj.history);

    const isQsortShape = Array.isArray(d.qsort);

    const isPostsortShape =
        d.postsort && typeof d.postsort === 'object' && !Array.isArray(d.postsort);

    return {
        presort: isPresortShape
            ? (d.presort as typeof initialResponses.presort)
            : initialResponses.presort,
        rough: isRoughShape ? (d.rough as typeof initialResponses.rough) : initialResponses.rough,
        qsort: isQsortShape ? (d.qsort as typeof initialResponses.qsort) : initialResponses.qsort,
        postsort: isPostsortShape
            ? (d.postsort as typeof initialResponses.postsort)
            : initialResponses.postsort,
    };
}

function safeSessionStorage(action: 'set' | 'remove', key: string, value?: string): void {
    try {
        if (action === 'set' && value !== undefined) {
            sessionStorage.setItem(key, value);
        } else if (action === 'remove') {
            sessionStorage.removeItem(key);
        }
    } catch {
        // Ignore storage errors (private mode, full quota, …).
    }
}

async function applyResumeSuccess(
    data: ResumeResponse & { draft_responses: Record<string, unknown> },
    slug: string,
    navigate: NavigateFunction,
    i18n: I18nType
): Promise<void> {
    safeSessionStorage('remove', 'qualis-pilot-mode');

    // Reset all stores — including configStore — so the slug guard in
    // useStudyConfig does not wipe our hydrated session when StudyLayout mounts.
    resetAllStores();

    const session = useSessionStore.getState();
    session.setToken(data.session_token);
    session.setStudySlug(slug);
    session.setConsent(true);
    session.setStep(data.last_step_reached);
    session.setLanguage(data.language);
    if (data.language) {
        await i18n.changeLanguage(data.language);
    }
    if (data.resume_code) {
        session.setResumeCode(data.resume_code);
    }

    const validatedDraft = validateDraftResponses(data.draft_responses);
    if (validatedDraft !== null) {
        useResponseStore.setState(validatedDraft);
    }

    safeSessionStorage('set', 'qualis-resumed-via-link', '1');

    const route = STEP_ROUTES[data.last_step_reached] || 'welcome';
    navigate(`/study/${slug}/${route}`, { replace: true });

    if (STEP_ROUTES[data.last_step_reached]) {
        toast.success(i18n.t('resume.restored', 'Welcome back! Your progress has been restored.'));
    }
}

function handleAlreadyCompleted(slug: string, navigate: NavigateFunction): void {
    const state = useSessionStore.getState();
    state.setStudySlug(slug);
    state.setConsent(true);
    state.completeSession('');
    navigate(`/study/${slug}/post-sort`, { replace: true });
}

export interface UseResumeSessionResult {
    error: ResumeError | null;
}

export function useResumeSession(
    slug: string | undefined,
    token: string | undefined
): UseResumeSessionResult {
    const { i18n } = useTranslation();
    const navigate = useNavigate();
    const [error, setError] = useState<ResumeError | null>(null);

    useEffect(() => {
        if (!slug || !token) {
            setError('not_found');
            return;
        }

        let cancelled = false;

        const run = async () => {
            try {
                const data = await customInstance<
                    ResumeResponse & { draft_responses: Record<string, unknown> }
                >({
                    url: `/api/study/${slug}/resume/${token}`,
                    method: 'GET',
                });
                if (cancelled) return;
                await applyResumeSuccess(data, slug, navigate, i18n);
            } catch (err: unknown) {
                if (cancelled) return;
                const parsed = parseResumeError(err);
                if (parsed.kind === 'redirect-completed') {
                    handleAlreadyCompleted(slug, navigate);
                    return;
                }
                setError(parsed.code);
            }
        };

        run();
        return () => {
            cancelled = true;
        };
    }, [slug, token, navigate, i18n]);

    return { error };
}
