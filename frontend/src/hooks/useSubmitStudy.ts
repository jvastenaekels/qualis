/*
 * Open-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { useState } from 'react';
import { useStudyStore } from '../store/useStudyStore';
import { post } from '../api/client';

export const useSubmitStudy = () => {
    const [isLoading, setIsLoading] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [confirmationCode, setConfirmationCode] = useState<string | null>(null);

    const { config, session, responses } = useStudyStore();

    const submit = async (status: 'started' | 'completed' = 'completed', options?: { silent?: boolean }) => {
        if (!options?.silent) {
            setIsLoading(true);
        }
        setError(null);

        try {
            if (!config) throw new Error("Study config is missing");
            // ... (rest of validation)
            if (!config) throw new Error('No configuration loaded');
            if (!session.token) throw new Error('No session token');

            // Transform Q-Sort data to match backend schema
            // Frontend: { statementId, col, row }
            // Backend: { statement_id, grid_score, card_comment }
            const qsortPayload = responses.qsort.map((item: { statementId: number; col: number; row: number }) => {
                const colKey = item.col; // col index
                // Grid config is array of { score, capacity } sorted by col index?
                // Or map? The type says { score, capacity }[] in store.
                // Assuming index matches col.
                const score = config.grid_config && config.grid_config[colKey] ? config.grid_config[colKey].score : 0; 
                
                return {
                    statement_id: item.statementId,
                    grid_score: score,
                    card_comment: responses.postsort.card_comments[item.statementId] || null
                };
            });

            const payload = {
                session_token: session.token,
                study_slug: config.slug,
                language_used: session.language,
                status: status, 
                presort_answers: responses.presort,
                qsort: qsortPayload,
                postsort_answers: {
                    ...responses.postsort,
                }
            };
            
            const data = await post<{ confirmation_code: string }>('/api/submit', payload);
            
            if (status === 'completed') {
                setIsSuccess(true);
                setConfirmationCode(data.confirmation_code);
                // Mark session as completed in store
                 useStudyStore.getState().completeSession(data.confirmation_code);
            } else {
                 console.log('Partial save successful');
            }

        } catch (err: unknown) {
            console.error(err);
            setError(err instanceof Error ? err.message : 'An unexpected error occurred');
        } finally {
            if (!options?.silent) {
                setIsLoading(false);
            }
        }
    };

    return { submit, isLoading, isSuccess, error, confirmationCode };
};
