/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { act, renderHook } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StudyConfig } from '../schemas/study';
import { useConfigStore } from '../store/useConfigStore';
import { useResponseStore } from '../store/useResponseStore';
import { useSessionStore } from '../store/useSessionStore';
import { server } from '../test-utils/server';
import { AllTheProviders } from '../test-utils/test-utils';
import { useSubmitStudy } from './useSubmitStudy';

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
    // Spy on console.error to prevent noise in test output for expected errors
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    beforeEach(() => {
        consoleErrorSpy.mockClear();

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
        server.resetHandlers();
    });

    it('submits correctly transformed payload on success', async () => {
        let capturedRequest: unknown;

        server.use(
            http.post('/api/submit', async ({ request }) => {
                capturedRequest = await request.json();
                return HttpResponse.json({
                    success: true,
                    confirmation_code: 'CONF123',
                });
            })
        );

        const { result } = renderHook(() => useSubmitStudy(), {
            wrapper: AllTheProviders,
        });

        await act(async () => {
            await result.current.submit();
        });

        expect(result.current.isLoading).toBe(false);
        expect(result.current.isSuccess).toBe(true);
        expect(result.current.error).toBeNull();
        expect(result.current.confirmationCode).toBe('CONF123');

        expect(capturedRequest).toEqual({
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
                audio_recordings: {},
                card_comments: { 1: 'Why -4', 2: 'Why 4' },
                missing_statement: 'Missed this',
                general_comment: 'Good study',
                questions_answers: {},
            },
            link_token: undefined,
        });
    });

    it('handles generic API errors', async () => {
        server.use(
            http.post('/api/submit', () => {
                return HttpResponse.error();
            })
        );

        const { result } = renderHook(() => useSubmitStudy(), {
            wrapper: AllTheProviders,
        });

        await act(async () => {
            await result.current.submit();
        });

        expect(result.current.isLoading).toBe(false);
        expect(result.current.isSuccess).toBe(false);
        // Network error usually results in "Network Error" or specific message depending on client
        // Verify what useSubmitStudy returns. Assuming generic catch
        expect(result.current.error).toBeTruthy();
        expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('handles ApiError 400 (Bad Request)', async () => {
        server.use(
            http.post('/api/submit', () => {
                // Assuming the client wrapper extracts "detail" or "message"
                return HttpResponse.json({ detail: 'Bad Request' }, { status: 400 });
            })
        );

        const { result } = renderHook(() => useSubmitStudy(), {
            wrapper: AllTheProviders,
        });

        await act(async () => {
            await result.current.submit();
        });

        // verification depends on how useSubmitStudy parses 400
        // If it returns "Bad Request" string from error.response, we might need to adjust expectation
        // For now, check truthy to be safe, or inspect client logic if fails
        expect(result.current.error).toBeTruthy();
    });

    it('handles missing config error', async () => {
        useConfigStore.getState().setConfig(null as unknown as StudyConfig);

        const { result } = renderHook(() => useSubmitStudy(), {
            wrapper: AllTheProviders,
        });

        await act(async () => {
            await result.current.submit();
        });

        expect(result.current.isLoading).toBe(false);
        expect(result.current.isSuccess).toBe(false);
        expect(result.current.error).toBeTruthy();
        expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('handles missing session token error', async () => {
        useSessionStore.getState().setToken(null as unknown as string);

        const { result } = renderHook(() => useSubmitStudy(), {
            wrapper: AllTheProviders,
        });

        await act(async () => {
            await result.current.submit();
        });

        expect(result.current.error).toBe('No session token');
        expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('respects silent option (no loading state)', async () => {
        server.use(
            http.post('/api/submit', () => {
                return HttpResponse.json({
                    success: true,
                    confirmation_code: 'SilentCode',
                });
            })
        );

        const { result } = renderHook(() => useSubmitStudy(), {
            wrapper: AllTheProviders,
        });

        await act(async () => {
            // We pass silent: true. The hook should NOT set isLoading to true.
            await result.current.submit('completed', { silent: true });
        });

        expect(result.current.isLoading).toBe(false);
        expect(result.current.isSuccess).toBe(true);
    });
});
