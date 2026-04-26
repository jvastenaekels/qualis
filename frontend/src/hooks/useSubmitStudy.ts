/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { useCallback, useRef, useState } from 'react';
import { useSubmitStudyApiSubmitPost } from '../api/generated';
import { useConfigStore } from '../store/useConfigStore';
import { useResponseStore } from '../store/useResponseStore';
import { useSessionStore } from '../store/useSessionStore';

const MAX_RETRIES = 3;
const INITIAL_DELAY_MS = 1000;

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

    const submit = useCallback(
        async (status: 'started' | 'completed' = 'completed', options?: { silent?: boolean }) => {
            // Guard against concurrent submissions
            if (isSubmittingRef.current && status === 'completed') return;
            if (status === 'completed') {
                isSubmittingRef.current = true;
                setSubmitting(true);
            }

            if (!options?.silent) {
                setIsLoading(true);
            }
            setError(null);

            try {
                if (!config) throw new Error('Study config is missing');

                const searchParams = new URLSearchParams(window.location.search);
                const isTestMode = searchParams.get('mode') === 'test' || isPilotMode;
                const linkToken = searchParams.get('token') || undefined;

                if (!isTestMode && !sessionToken) throw new Error('No session token');

                // Validate Q-sort completeness before final submission
                if (status === 'completed' && qsort.length !== config.statements.length) {
                    throw new Error(
                        `Incomplete Q-sort: expected ${config.statements.length} cards, got ${qsort.length}.`
                    );
                }

                const qsortPayload = qsort.map(
                    (item: { statementId: number; col: number; row: number }) => {
                        const colKey = item.col;
                        const score = config.grid_config?.[colKey]
                            ? config.grid_config[colKey].score
                            : 0;

                        return {
                            statement_id: item.statementId,
                            grid_score: score,
                            card_comment: postsort.card_comments[item.statementId] || undefined,
                        };
                    }
                );

                const payload = {
                    session_token: sessionToken || '00000000-0000-0000-0000-000000000000',
                    study_slug: config.slug,
                    language_used: sessionLanguage || 'en',
                    status: status,
                    presort_answers: presort,
                    qsort: qsortPayload,
                    postsort_answers: {
                        ...postsort,
                    },
                    link_token: linkToken,
                };

                if (isTestMode) {
                    // Pilot mode: skip backend entirely — no data stored
                    if (status === 'completed') {
                        setIsSuccess(true);
                        const code = `PILOT-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
                        setConfirmationCode(code);
                        completeSession(code);
                        resetResponses();
                    }
                    return;
                }

                // Submit with exponential backoff retry for transient errors
                let lastError: unknown = null;
                let data: unknown;
                const maxAttempts = status === 'completed' ? MAX_RETRIES : 1;
                for (let attempt = 0; attempt < maxAttempts; attempt++) {
                    try {
                        if (attempt > 0) {
                            await delay(INITIAL_DELAY_MS * 2 ** (attempt - 1));
                        }
                        data = await submitStudyMutation({ data: payload });
                        lastError = null;
                        break;
                    } catch (err: unknown) {
                        lastError = err;
                        if (!isRetryableError(err) || attempt === maxAttempts - 1) break;
                        console.warn(`Submission attempt ${attempt + 1} failed, retrying...`, err);
                    }
                }

                if (lastError) throw lastError;

                if (status === 'completed') {
                    // biome-ignore lint/suspicious/noExplicitAny: API types are unknown
                    const responseData = data as any;
                    const code =
                        responseData?.confirmation_code || responseData?.data?.confirmation_code;

                    if (!code) {
                        throw new Error(
                            'Submission may have failed: no confirmation code received. Please try again.'
                        );
                    }

                    setIsSuccess(true);
                    setConfirmationCode(code);
                    completeSession(code);
                    resetResponses();
                }
            } catch (err: unknown) {
                console.error(err);
                // Extract the most useful error message
                let message = 'An unexpected error occurred';
                if (err instanceof Error) {
                    message = err.message;
                }
                // Axios-style error with response.data.detail
                if (
                    typeof err === 'object' &&
                    err !== null &&
                    'response' in err &&
                    typeof (err as Record<string, unknown>).response === 'object'
                ) {
                    const resp = (err as { response: { data?: { detail?: string } } }).response;
                    if (typeof resp.data?.detail === 'string') {
                        message = resp.data.detail;
                    }
                }
                setError(message);
            } finally {
                isSubmittingRef.current = false; // Allow retry after failure or re-submission
                setSubmitting(false);
                if (!options?.silent) {
                    setIsLoading(false);
                }
            }
        },
        [
            config,
            sessionToken,
            sessionLanguage,
            qsort,
            postsort,
            presort,
            submitStudyMutation,
            completeSession,
            setSubmitting,
            resetResponses,
            isPilotMode,
        ]
    );

    return { submit, isLoading, isSuccess, error, confirmationCode };
};
