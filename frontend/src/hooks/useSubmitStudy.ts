/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { useCallback, useRef, useState } from 'react';
import { useSubmitStudyApiSubmitPost } from '../api/generated';
import type { SubmissionInput } from '../api/model';
import type { StudyConfig } from '../schemas/study';
import { useConfigStore } from '../store/useConfigStore';
import { useResponseStore } from '../store/useResponseStore';
import { useSessionStore } from '../store/useSessionStore';

const MAX_RETRIES = 3;
const INITIAL_DELAY_MS = 1000;

type SubmitStatus = 'started' | 'completed';

interface QSortItem {
    statementId: number;
    col: number;
    row: number;
}

/** Returns true if the error looks like a transient network/server issue worth retrying. */
const isRetryableError = (err: unknown): boolean => {
    if (err instanceof Error && err.message === 'Failed to fetch') return true;
    if (typeof err === 'object' && err !== null && 'status' in err) {
        const status = (err as { status: number }).status;
        return status >= 500 || status === 0 || status === 429;
    }
    return false;
};

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function buildPayload(args: {
    config: StudyConfig;
    sessionToken: string | null;
    sessionLanguage: string | null;
    status: SubmitStatus;
    presort: Record<string, string | number | boolean>;
    qsort: QSortItem[];
    postsort: { card_comments: Record<number, string>; [k: string]: unknown };
    linkToken: string | undefined;
}): SubmissionInput {
    const { config, sessionToken, sessionLanguage, status, presort, qsort, postsort, linkToken } =
        args;

    const qsortPayload = qsort.map((item) => {
        const score = config.grid_config?.[item.col]?.score ?? 0;
        return {
            statement_id: item.statementId,
            grid_score: score,
            card_comment: postsort.card_comments[item.statementId] || undefined,
        };
    });

    return {
        session_token: sessionToken || '00000000-0000-0000-0000-000000000000',
        study_slug: config.slug,
        language_used: sessionLanguage || 'en',
        status,
        presort_answers: presort,
        qsort: qsortPayload,
        postsort_answers: { ...postsort },
        link_token: linkToken,
    };
}

/**
 * Run an async operation with exponential-backoff retry on transient failures.
 * Throws the last error if all attempts fail.
 */
async function runWithRetry<T>(operation: () => Promise<T>, maxAttempts: number): Promise<T> {
    let lastError: unknown = null;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
            if (attempt > 0) await delay(INITIAL_DELAY_MS * 2 ** (attempt - 1));
            return await operation();
        } catch (err) {
            lastError = err;
            if (!isRetryableError(err) || attempt === maxAttempts - 1) break;
            console.warn(`Submission attempt ${attempt + 1} failed, retrying...`, err);
        }
    }
    throw lastError;
}

/** Extract the most useful error message from a thrown value. */
function extractErrorMessage(err: unknown): string {
    let message = 'An unexpected error occurred';
    if (err instanceof Error) message = err.message;
    if (
        typeof err === 'object' &&
        err !== null &&
        'response' in err &&
        typeof (err as Record<string, unknown>).response === 'object'
    ) {
        const resp = (err as { response: { data?: { detail?: string } } }).response;
        if (typeof resp.data?.detail === 'string') message = resp.data.detail;
    }
    return message;
}

/** Pull the confirmation code from a backend response, regardless of nesting. */
function extractConfirmationCode(data: unknown): string | undefined {
    // biome-ignore lint/suspicious/noExplicitAny: API types are unknown
    const responseData = data as any;
    return responseData?.confirmation_code || responseData?.data?.confirmation_code;
}

interface SubmissionContext {
    isTestMode: boolean;
    sessionToken: string | null;
    linkToken: string | undefined;
}

function resolveSubmissionContext(
    sessionToken: string | null,
    isPilotMode: boolean
): SubmissionContext {
    const searchParams = new URLSearchParams(window.location.search);
    const isTestMode = searchParams.get('mode') === 'test' || isPilotMode;
    const linkToken = searchParams.get('token') || undefined;
    return { isTestMode, sessionToken, linkToken };
}

function assertReadyToSubmit(
    config: StudyConfig | null,
    ctx: SubmissionContext,
    status: SubmitStatus,
    qsortLength: number
): asserts config is StudyConfig {
    if (!config) throw new Error('Study config is missing');
    if (!ctx.isTestMode && !ctx.sessionToken) throw new Error('No session token');
    if (status === 'completed' && qsortLength !== config.statements.length) {
        throw new Error(
            `Incomplete Q-sort: expected ${config.statements.length} cards, got ${qsortLength}.`
        );
    }
}

export const useSubmitStudy = () => {
    const [isLoading, setIsLoading] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [confirmationCode, setConfirmationCode] = useState<string | null>(null);

    const config = useConfigStore((state) => state.config);
    const sessionToken = useSessionStore((s) => s.token);
    const sessionLanguage = useSessionStore((s) => s.language);
    const isPilotMode = useSessionStore((s) => s.isPilotMode);
    const completeSession = useSessionStore((s) => s.completeSession);
    const setSubmitting = useSessionStore((s) => s.setSubmitting);
    const presort = useResponseStore((s) => s.presort);
    const qsort = useResponseStore((s) => s.qsort);
    const postsort = useResponseStore((s) => s.postsort);
    const resetResponses = useResponseStore((s) => s.resetResponses);

    const { mutateAsync: submitStudyMutation } = useSubmitStudyApiSubmitPost();
    const isSubmittingRef = useRef(false);

    const finalizeCompletion = useCallback(
        (code: string) => {
            setIsSuccess(true);
            setConfirmationCode(code);
            completeSession(code);
            resetResponses();
        },
        [completeSession, resetResponses]
    );

    /**
     * Run the submission flow and return the confirmation code (if any).
     * Throws on validation failure, missing token, or backend rejection.
     */
    const performSubmission = useCallback(
        async (status: SubmitStatus): Promise<string | undefined> => {
            const ctx = resolveSubmissionContext(sessionToken, isPilotMode);
            assertReadyToSubmit(config, ctx, status, qsort.length);

            if (ctx.isTestMode) {
                return status === 'completed'
                    ? `PILOT-${Math.random().toString(36).substring(2, 7).toUpperCase()}`
                    : undefined;
            }

            const payload = buildPayload({
                config,
                sessionToken,
                sessionLanguage,
                status,
                presort,
                qsort,
                postsort,
                linkToken: ctx.linkToken,
            });
            const maxAttempts = status === 'completed' ? MAX_RETRIES : 1;
            const data = await runWithRetry(
                () => submitStudyMutation({ data: payload }),
                maxAttempts
            );
            if (status !== 'completed') return undefined;

            const code = extractConfirmationCode(data);
            if (!code) {
                throw new Error(
                    'Submission may have failed: no confirmation code received. Please try again.'
                );
            }
            return code;
        },
        [
            config,
            sessionToken,
            sessionLanguage,
            qsort,
            postsort,
            presort,
            submitStudyMutation,
            isPilotMode,
        ]
    );

    const submit = useCallback(
        async (status: SubmitStatus = 'completed', options?: { silent?: boolean }) => {
            // Guard against concurrent completed submissions
            if (isSubmittingRef.current && status === 'completed') return;
            if (status === 'completed') {
                isSubmittingRef.current = true;
                setSubmitting(true);
            }
            if (!options?.silent) setIsLoading(true);
            setError(null);

            try {
                const code = await performSubmission(status);
                if (status === 'completed' && code) finalizeCompletion(code);
            } catch (err: unknown) {
                console.error(err);
                setError(extractErrorMessage(err));
            } finally {
                // Only release the concurrency guard for the status that
                // acquired it (completed). A concurrent non-completed autosave
                // finishing mid-completion must NOT reset the guard while the
                // final submission is still in flight — that would re-enable
                // draft-autosave / allow a second completion.
                if (status === 'completed') {
                    isSubmittingRef.current = false;
                    setSubmitting(false);
                }
                if (!options?.silent) setIsLoading(false);
            }
        },
        [performSubmission, setSubmitting, finalizeCompletion]
    );

    return { submit, isLoading, isSuccess, error, confirmationCode };
};
