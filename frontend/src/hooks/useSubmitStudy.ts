/*
 * Libre-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { useCallback, useRef, useState } from 'react';
import { useSubmitStudyApiSubmitPost } from '../api/generated';
import { useConfigStore } from '../store/useConfigStore';
import { useResponseStore } from '../store/useResponseStore';
import { useSessionStore } from '../store/useSessionStore';

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
    const presort = useResponseStore((s) => s.presort);
    const qsort = useResponseStore((s) => s.qsort);
    const postsort = useResponseStore((s) => s.postsort);

    const { mutateAsync: submitStudyMutation } = useSubmitStudyApiSubmitPost();
    const isSubmittingRef = useRef(false);

    const submit = useCallback(
        async (status: 'started' | 'completed' = 'completed', options?: { silent?: boolean }) => {
            // Guard against concurrent submissions
            if (isSubmittingRef.current && status === 'completed') return;
            if (status === 'completed') isSubmittingRef.current = true;

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
                    is_test_run: isTestMode,
                };

                if (isTestMode) {
                    // Pilot mode: skip backend entirely — no data stored
                    if (status === 'completed') {
                        setIsSuccess(true);
                        const code = `PILOT-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
                        setConfirmationCode(code);
                        completeSession(code);
                    }
                    return;
                }

                const data = await submitStudyMutation({ data: payload });

                if (status === 'completed') {
                    setIsSuccess(true);
                    // biome-ignore lint/suspicious/noExplicitAny: API types are unknown
                    const responseData = data as any;
                    const code =
                        responseData?.confirmation_code || responseData?.data?.confirmation_code;

                    if (code) {
                        setConfirmationCode(code);
                        completeSession(code);
                    } else {
                        console.warn('No confirmation code in response:', data);
                        // Mark as complete even if code is missing to show success screen
                        completeSession('SUBMITTED');
                    }
                }
            } catch (err: unknown) {
                console.error(err);
                setError(err instanceof Error ? err.message : 'An unexpected error occurred');
                isSubmittingRef.current = false; // Allow retry after failure
            } finally {
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
            isPilotMode,
        ]
    );

    return { submit, isLoading, isSuccess, error, confirmationCode };
};
