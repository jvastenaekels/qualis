/*
 * Open-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSubmitStudy } from './useSubmitStudy';
import { useConfigStore } from '../store/useConfigStore';
import { useSessionStore } from '../store/useSessionStore';
import { useResponseStore } from '../store/useResponseStore';
import type { StudyConfig } from '../schemas/study';

// Mock the API client
const mockPost = vi.fn();
vi.mock('../api/client', () => ({
    post: (...args: unknown[]) => mockPost(...args),
}));

const mockConfig = {
    slug: 'test',
    title: 'Test',
    description: '',
    instructions: '',
    presort_config: {},
    grid_config: [
        { score: -4, capacity: 1 },
        { score: 4, capacity: 1 },
    ],
    statements: [
        { id: 1, text: 'S1' },
        { id: 2, text: 'S2' },
    ],
};

describe('useSubmitStudy', () => {
    beforeEach(() => {
        mockPost.mockReset();

        // Setup stores
        useConfigStore.getState().setConfig(mockConfig as unknown as StudyConfig);

        useSessionStore.getState().resetSession();
        useSessionStore.getState().setToken('test-token');
        useSessionStore.getState().setConsent(true);
        useSessionStore.getState().setLanguage('en');
        useSessionStore.getState().setStep(5);

        useResponseStore.getState().resetResponses();
        useResponseStore.getState().setPresortResponse({ age: 30 });
        useResponseStore.getState().placeCardInGrid(1, 0, 0); // Score -4
        useResponseStore.getState().placeCardInGrid(2, 1, 0); // Score 4
        useResponseStore
            .getState()
            .setPostSortResponse('card_comments', { 1: 'Why -4', 2: 'Why 4' });
        useResponseStore.getState().setPostSortResponse('missing_statement', 'Missed this');
        useResponseStore.getState().setPostSortResponse('general_comment', 'Good study');
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
                { statement_id: 1, grid_score: -4, card_comment: 'Why -4' },
                { statement_id: 2, grid_score: 4, card_comment: 'Why 4' },
            ],
            postsort_answers: {
                card_comments: { 1: 'Why -4', 2: 'Why 4' },
                missing_statement: 'Missed this',
                general_comment: 'Good study',
            },
        });
    });

    it('handles generic API errors', async () => {
        mockPost.mockRejectedValueOnce(new Error('API Failure'));

        const { result } = renderHook(() => useSubmitStudy());

        await act(async () => {
            await result.current.submit();
        });

        expect(result.current.isLoading).toBe(false);
        expect(result.current.isSuccess).toBe(false);
        expect(result.current.error).toBe('API Failure');
    });

    it('handles ApiError 400 (Bad Request)', async () => {
        const apiError = new Error('Bad Request');
        (apiError as any).status = 400;
        mockPost.mockRejectedValueOnce(apiError);

        const { result } = renderHook(() => useSubmitStudy());

        await act(async () => {
            await result.current.submit();
        });

        expect(result.current.error).toBe('Bad Request');
    });

    it('handles ApiError 429 (Rate Limit)', async () => {
        const apiError = new Error('Too many requests');
        (apiError as any).status = 429;
        mockPost.mockRejectedValueOnce(apiError);

        const { result } = renderHook(() => useSubmitStudy());

        await act(async () => {
            await result.current.submit();
        });

        expect(result.current.error).toBe('Too many requests');
    });
});
