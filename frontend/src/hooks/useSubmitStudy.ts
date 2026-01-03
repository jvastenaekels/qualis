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
                if (!session.token) throw new Error('No session token');

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
                                responses.postsort.card_comments[item.statementId] || null,
                        };
                    }
                );

                const payload = {
                    session_token: session.token,
                    study_slug: config.slug,
                    language_used: session.language || 'en',
                    status: status,
                    presort_answers: responses.presort,
                    qsort: qsortPayload,
                    postsort_answers: {
                        ...responses.postsort,
                    },
                };

                const data = await submitStudyMutation({ data: payload });

                if (status === 'completed') {
                    setIsSuccess(true);
                    setConfirmationCode((data as { confirmation_code: string }).confirmation_code);
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
        ]
    );

    return { submit, isLoading, isSuccess, error, confirmationCode };
};
