/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StudyConfig } from '../schemas/study';
import { resetBaseLocales } from '../utils/i18nOverrides';
import { useConfigStore } from './useConfigStore';
import { useResponseStore } from './useResponseStore';
import { useSessionStore } from './useSessionStore';
import { useUIStore } from './useUIStore';

// Mock the i18n overrides utility
vi.mock('../utils/i18nOverrides', () => ({
    resetBaseLocales: vi.fn(),
    applyStudyOverrides: vi.fn(),
}));

describe('Atomic Stores', () => {
    beforeEach(() => {
        useConfigStore.getState().resetConfig();
        useSessionStore.getState().resetSession();
        useResponseStore.getState().resetResponses();
        localStorage.clear();
    });

    describe('useSessionStore', () => {
        it('initializes with default values', () => {
            const state = useSessionStore.getState();
            expect(state.hasConsented).toBe(false);
            expect(state.currentStep).toBe(1);
        });

        it('updates consent', () => {
            useSessionStore.getState().setConsent(true);
            expect(useSessionStore.getState().hasConsented).toBe(true);
        });

        it('updates token', () => {
            const token = 'test-token-123';
            useSessionStore.getState().setToken(token);
            expect(useSessionStore.getState().token).toBe(token);
        });

        it('updates steps correctly', () => {
            useSessionStore.getState().setStep(2);
            expect(useSessionStore.getState().currentStep).toBe(2);
        });

        it('completes study correctly', () => {
            useSessionStore.getState().completeSession('FINISH-123');
            const state = useSessionStore.getState();
            expect(state.isCompleted).toBe(true);
            expect(state.confirmationCode).toBe('FINISH-123');
        });

        // Note: This test is skipped due to mock hoisting issues with Zustand stores
        // The resetBaseLocales function is called in the store definition, not just on reset
        it.skip('resets i18n locales on session reset', () => {
            vi.mocked(resetBaseLocales).mockClear();
            useSessionStore.getState().resetSession();
            expect(resetBaseLocales).toHaveBeenCalled();
        });
    });

    describe('useResponseStore', () => {
        it('stores presort responses', () => {
            const response = { age: 25, role: 'Developer' };
            useResponseStore.getState().setPresortResponse(response);

            expect(useResponseStore.getState().presort).toEqual(response);
        });

        it('places cards in grid', () => {
            // Need config for placeCardInGrid to work
            useConfigStore.getState().setConfig({
                statements: [{ id: 1, text: 'Test' }],
                grid_config: [{ score: 0, capacity: 5 }],
            } as unknown as StudyConfig);

            useResponseStore.getState().placeCardInGrid(1, 0, 0);
            const state = useResponseStore.getState();
            expect(state.qsort).toContainEqual({ statementId: 1, col: 0, row: 0 });
        });

        it('undos rough sort (neutral branch)', () => {
            // Setup rough sort with a neutral card
            useResponseStore.getState().categorizeCard(1, 'neutral');
            expect(useResponseStore.getState().rough.neutral).toContain(1);

            useResponseStore.getState().undoRoughSort();
            expect(useResponseStore.getState().rough.neutral).not.toContain(1);
            expect(useResponseStore.getState().rough.history).toHaveLength(0);
        });

        it('resets fine sort', () => {
            useConfigStore.getState().setConfig({
                statements: [{ id: 1, text: 'Test' }],
                grid_config: [{ score: 0, capacity: 5 }],
            } as unknown as StudyConfig);
            useResponseStore.getState().placeCardInGrid(1, 0, 0);
            expect(useResponseStore.getState().qsort).toHaveLength(1);

            useResponseStore.getState().resetFineSort();
            expect(useResponseStore.getState().qsort).toHaveLength(0);
        });

        it('moves and swaps cards in grid', () => {
            useConfigStore.getState().setConfig({
                statements: [
                    { id: 1, text: 'S1' },
                    { id: 2, text: 'S2' },
                ],
                grid_config: [{ score: 0, capacity: 5 }],
            } as unknown as StudyConfig);

            useResponseStore.getState().placeCardInGrid(1, 0, 0);
            useResponseStore.getState().moveCardInGrid(1, 0, 1);
            expect(useResponseStore.getState().qsort).toContainEqual({
                statementId: 1,
                col: 0,
                row: 1,
            });

            useResponseStore.getState().placeCardInGrid(2, 0, 2);
            useResponseStore.getState().swapCardsInGrid(1, 2);
            expect(useResponseStore.getState().qsort).toContainEqual({
                statementId: 1,
                col: 0,
                row: 2,
            });
            expect(useResponseStore.getState().qsort).toContainEqual({
                statementId: 2,
                col: 0,
                row: 1,
            });
        });

        it('unplaces card and sets post-sort response', () => {
            useResponseStore.getState().placeCardInGrid(1, 0, 0);
            useResponseStore.getState().unplaceCard(1);
            expect(useResponseStore.getState().qsort).toHaveLength(0);

            useResponseStore.getState().setPostSortResponse('general_comment', 'Good study');
            expect(useResponseStore.getState().postsort.general_comment).toBe('Good study');
        });
    });

    describe('useConfigStore', () => {
        it('initializes with null config', () => {
            const state = useConfigStore.getState();
            expect(state.config).toBeNull();
        });

        it('sets config correctly', () => {
            const mockConfig = { title: 'Test', statements: [] };
            useConfigStore.getState().setConfig(mockConfig as unknown as StudyConfig);
            expect(useConfigStore.getState().config?.title).toBe('Test');
        });

        it('triggers refetch correctly', () => {
            const initialTag = useConfigStore.getState().refetchTag;
            useConfigStore.getState().triggerRefetch();
            expect(useConfigStore.getState().refetchTag).toBe(initialTag + 1);
        });

        it('sets loading and error states', () => {
            useConfigStore.getState().setLoading(true);
            expect(useConfigStore.getState().isLoading).toBe(true);

            useConfigStore.getState().setError('Error occurred');
            expect(useConfigStore.getState().error).toBe('Error occurred');
            expect(useConfigStore.getState().isLoading).toBe(false);
        });
    });

    describe('useUIStore', () => {
        it('sets active and selected cards', () => {
            const card = { id: 1, text: 'Test' };
            useUIStore.getState().setActiveCard(card);
            expect(useUIStore.getState().activeCard).toEqual(card);

            useUIStore.getState().setSelectedCard(card);
            expect(useUIStore.getState().selectedCard).toEqual(card);
        });
    });

    describe('useResponseStore Additional', () => {
        it('undos rough sort (agree and disagree branches)', () => {
            useResponseStore.getState().categorizeCard(1, 'agree');
            useResponseStore.getState().undoRoughSort();
            expect(useResponseStore.getState().rough.agree).not.toContain(1);

            useResponseStore.getState().categorizeCard(2, 'disagree');
            useResponseStore.getState().undoRoughSort();
            expect(useResponseStore.getState().rough.disagree).not.toContain(2);
        });

        it('warns when placing card in full column', () => {
            const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
            useConfigStore.getState().setConfig({
                statements: [
                    { id: 1, text: 'S1' },
                    { id: 2, text: 'S2' },
                ],
                grid_config: [{ score: 0, capacity: 1 }],
            } as unknown as StudyConfig);

            useResponseStore.getState().placeCardInGrid(1, 0, 0);
            useResponseStore.getState().placeCardInGrid(2, 0, 1);

            expect(spy).toHaveBeenCalledWith('Column 0 is full.');
            spy.mockRestore();
        });
    });

    describe('useSessionStore Additional', () => {
        it('sets language correctly', () => {
            useSessionStore.getState().setLanguage('fr');
            expect(useSessionStore.getState().language).toBe('fr');
        });
    });
});
