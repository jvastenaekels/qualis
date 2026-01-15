/*
 * Open-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { useCallback, useState } from 'react';
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
    const session = useSessionStore();
    const responses = useResponseStore();

    const { mutateAsync: submitStudyMutation } = useSubmitStudyApiSubmitPost();

    const submit = useCallback(
        async (status: 'started' | 'completed' = 'completed', options?: { silent?: boolean }) => {
            if (!options?.silent) {
                setIsLoading(true);
            }
            setError(null);

            try {
                if (!config) throw new Error('Study config is missing');

                const searchParams = new URLSearchParams(window.location.search);
                const isTestMode = searchParams.get('mode') === 'test';

                if (!isTestMode && !session.token) throw new Error('No session token');

                const qsortPayload = responses.qsort.map(
                    (item: { statementId: number; col: number; row: number }) => {
                        const colKey = item.col;
                        const score = config.grid_config?.[colKey]
                            ? config.grid_config[colKey].score
                            : 0;

                        return {
                            statement_id: item.statementId,
                            grid_score: score,
                            card_comment:
                                responses.postsort.card_comments[item.statementId] || undefined,
                        };
                    }
                );

                const payload = {
                    session_token: session.token || '00000000-0000-0000-0000-000000000000',
                    study_slug: config.slug,
                    language_used: session.language || 'en',
                    status: status,
                    presort_answers: responses.presort,
                    qsort: qsortPayload,
                    postsort_answers: {
                        ...responses.postsort,
                    },
                };

                if (isTestMode) {
                    console.log('PILOT SUBMISSION (Simulated):', payload);
                    if (status === 'completed') {
                        setIsSuccess(true);
                        const code = `PILOT-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
                        setConfirmationCode(code);
                        session.completeSession(code);
                    }
                    return;
                }

                const data = await submitStudyMutation({ data: payload });

                if (status === 'completed') {
                    setIsSuccess(true);
                    const code = (data as { confirmation_code: string }).confirmation_code;
                    setConfirmationCode(code);
                    session.completeSession(code);
                }
            } catch (err: unknown) {
                console.error(err);
                setError(err instanceof Error ? err.message : 'An unexpected error occurred');
            } finally {
                if (!options?.silent) {
                    setIsLoading(false);
                }
            }
        },
        [
            config,
            session.token,
            session.language,
            responses.qsort,
            responses.postsort,
            responses.presort,
            submitStudyMutation,
            session.completeSession,
        ]
    );

    return { submit, isLoading, isSuccess, error, confirmationCode };
};
