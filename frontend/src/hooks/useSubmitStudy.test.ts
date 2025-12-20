/*
 * Open-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSubmitStudy } from './useSubmitStudy';
import { useStudyStore } from '../store/useStudyStore';

// Mock the API client
const mockPost = vi.fn();
vi.mock('../api/client', () => ({
    post: (...args: any[]) => mockPost(...args)
}));

describe('useSubmitStudy', () => {
    beforeEach(() => {
        useStudyStore.getState().resetSession();
        mockPost.mockReset();
        // Setup minimal store state
        useStudyStore.setState({
            config: {
                slug: 'test',
                title: 'Test',
                description: '',
                instructions: '',
                presort_config: {},
                grid_config: [{ score: -4, capacity: 1 }, { score: 4, capacity: 1 }],
                statements: [{ id: 1, text: 'S1' }, { id: 2, text: 'S2' }]
            },
            session: {
                token: 'test-token',
                hasConsented: true,
                currentStep: 5,
                language: 'en',
                maxReachedStep: 5,
                isCompleted: false,
                confirmationCode: null,
                isSaving: false
            },
            responses: {
                presort: { age: 30 },
                rough: { agree: [], disagree: [], neutral: [], history: [] },
                qsort: [
                    { statementId: 1, col: 0, row: 0 }, // Score -4
                    { statementId: 2, col: 1, row: 0 }  // Score 4
                ],
                postsort: {
                    card_comments: { 1: "Why -4", 2: "Why 4" },
                    missing_statement: "Missed this",
                    general_comment: "Good study"
                }
            }
        });
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('submits correctly transformed payload on success', async () => {
        mockPost.mockResolvedValueOnce({ success: true });

        const { result } = renderHook(() => useSubmitStudy());

        await act(async () => {
            await result.current.submit();
        });

        expect(result.current.isLoading).toBe(false);
        expect(result.current.isSuccess).toBe(true);
        expect(result.current.error).toBeNull();

        expect(mockPost).toHaveBeenCalledTimes(1);
        const [url, payload] = mockPost.mock.calls[0];
        
        expect(url).toBe('/api/submit');
        expect(payload).toEqual({
            session_token: 'test-token',
            study_slug: 'test',
            status: 'completed',
            language_used: 'en',
            presort_answers: { age: 30 },
            qsort: [
                { statement_id: 1, grid_score: -4, card_comment: "Why -4" },
                { statement_id: 2, grid_score: 4, card_comment: "Why 4" }
            ],
            postsort_answers: {
                card_comments: { 1: "Why -4", 2: "Why 4" },
                missing_statement: "Missed this",
                general_comment: "Good study"
            }
        });
    });

    it('handles API errors', async () => {
        mockPost.mockRejectedValueOnce(new Error('API Failure'));

        const { result } = renderHook(() => useSubmitStudy());

        await act(async () => {
            await result.current.submit();
        });

        expect(result.current.isLoading).toBe(false);
        expect(result.current.isSuccess).toBe(false);
        expect(result.current.error).toBe('API Failure');
    });
});
