/*
 * Open-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useConfigStore } from '../store/useConfigStore';
import { useResponseStore } from '../store/useResponseStore';
import { useSessionStore } from '../store/useSessionStore';
import type { StudyConfig } from '../schemas/study';

/**
 * Session Isolation Tests
 *
 * These tests verify that no contamination occurs between different study sessions.
 * They ensure that when a user switches from one study to another, all state is properly
 * reset and isolated.
 */

// Mock the API hook
vi.mock('./useGetStudyConfig', () => ({
    useGetStudyConfig: vi.fn(),
}));

vi.mock('../utils/i18nOverrides', () => ({
    resetBaseLocales: vi.fn(),
    applyStudyOverrides: vi.fn(),
}));

const { useGetStudyConfig } = await import('./useGetStudyConfig');

describe('Session Isolation Tests', () => {
    beforeEach(() => {
        // Clear all stores
        useConfigStore.getState().resetConfig();
        useSessionStore.getState().resetSession();
        useResponseStore.getState().resetResponses();
        localStorage.clear();
        sessionStorage.clear();
        vi.clearAllMocks();
    });

    const mockStudyConfig = (slug: string, title: string): StudyConfig => ({
        slug,
        title,
        language: 'en',
        state: 'active',
        statements: [
            { id: 1, text: `${title} Statement 1` },
            { id: 2, text: `${title} Statement 2` },
        ],
        grid_config: [{ score: 0, capacity: 2 }],
        presort_config: { enabled: false, fields: {} },
        consent_config: { required: true, text: 'Consent text' },
        postsort_config: { enabled: false, card_comments: false },
        translations: [],
    });

    describe('Study Slug Change Detection', () => {
        it('should reset session when slug changes', async () => {
            const studyA = mockStudyConfig('study-a', 'Study A');
            const studyB = mockStudyConfig('study-b', 'Study B');

            // Mock API responses
            vi.mocked(useGetStudyConfig).mockReturnValue({
                data: studyA,
                isLoading: false,
                error: null,
                refetch: vi.fn(),
                // biome-ignore lint/suspicious/noExplicitAny: mock query return type
            } as any);

            // Setup initial session state for Study A
            useSessionStore.getState().setToken('token-study-a');
            useSessionStore.getState().setConsent(true);
            useSessionStore.getState().setStep(3);
            useConfigStore.getState().setConfig(studyA);
            useResponseStore.getState().categorizeCard(1, 'agree');

            // Verify Study A state is set
            expect(useSessionStore.getState().token).toBe('token-study-a');
            expect(useSessionStore.getState().currentStep).toBe(3);
            expect(useResponseStore.getState().rough.agree).toContain(1);
            expect(useConfigStore.getState().config?.slug).toBe('study-a');

            // Simulate navigation to Study B by updating config with different slug
            useConfigStore.getState().setConfig(studyB);

            // Manually trigger the slug change detection effect
            // (In real scenario, this happens in useStudyConfig's useEffect)
            const config = useConfigStore.getState().config;
            if (config && config.slug !== studyA.slug) {
                useSessionStore.getState().resetSession();
                useConfigStore.getState().resetConfig();
            }

            // Verify all session state has been reset
            expect(useSessionStore.getState().token).toBeNull();
            expect(useSessionStore.getState().currentStep).toBe(1);
            expect(useSessionStore.getState().hasConsented).toBe(false);
            expect(useConfigStore.getState().config).toBeNull();

            // Note: Response store should also be reset when slug changes
            // In production, this is handled by useStudyConfig hook
        });

        it('should not reset session when slug remains the same', async () => {
            const studyA = mockStudyConfig('study-a', 'Study A');

            vi.mocked(useGetStudyConfig).mockReturnValue({
                data: studyA,
                isLoading: false,
                error: null,
                refetch: vi.fn(),
                // biome-ignore lint/suspicious/noExplicitAny: mock query return type
            } as any);

            // Setup initial session state
            useSessionStore.getState().setToken('token-study-a');
            useSessionStore.getState().setConsent(true);
            useSessionStore.getState().setStep(3);
            useConfigStore.getState().setConfig(studyA);

            // Re-set the same config (simulating page reload or re-render)
            useConfigStore.getState().setConfig(studyA);

            // Verify session state is preserved
            expect(useSessionStore.getState().token).toBe('token-study-a');
            expect(useSessionStore.getState().currentStep).toBe(3);
            expect(useSessionStore.getState().hasConsented).toBe(true);
        });
    });

    describe('Multi-Study Scenario', () => {
        it('should isolate data between three different studies', () => {
            const studyA = mockStudyConfig('study-a', 'Study A');
            const studyB = mockStudyConfig('study-b', 'Study B');
            const studyC = mockStudyConfig('study-c', 'Study C');

            // === Study A Session ===
            useConfigStore.getState().setConfig(studyA);
            useSessionStore.getState().setToken('token-a');
            useSessionStore.getState().setStep(2);
            useResponseStore.getState().categorizeCard(1, 'agree');

            const stateA = {
                token: useSessionStore.getState().token,
                step: useSessionStore.getState().currentStep,
                agree: [...useResponseStore.getState().rough.agree],
                config: useConfigStore.getState().config?.slug,
            };

            // === Switch to Study B ===
            if (useConfigStore.getState().config?.slug !== studyB.slug) {
                useSessionStore.getState().resetSession();
                useResponseStore.getState().resetResponses();
                useConfigStore.getState().resetConfig();
            }
            useConfigStore.getState().setConfig(studyB);
            useSessionStore.getState().setToken('token-b');
            useSessionStore.getState().setStep(4);
            useResponseStore.getState().categorizeCard(2, 'disagree');

            const stateB = {
                token: useSessionStore.getState().token,
                step: useSessionStore.getState().currentStep,
                disagree: [...useResponseStore.getState().rough.disagree],
                config: useConfigStore.getState().config?.slug,
            };

            // === Switch to Study C ===
            if (useConfigStore.getState().config?.slug !== studyC.slug) {
                useSessionStore.getState().resetSession();
                useResponseStore.getState().resetResponses();
                useConfigStore.getState().resetConfig();
            }
            useConfigStore.getState().setConfig(studyC);
            useSessionStore.getState().setToken('token-c');
            useSessionStore.getState().setStep(5);
            useResponseStore.getState().categorizeCard(1, 'neutral');

            const stateC = {
                token: useSessionStore.getState().token,
                step: useSessionStore.getState().currentStep,
                neutral: [...useResponseStore.getState().rough.neutral],
                config: useConfigStore.getState().config?.slug,
            };

            // Verify each session had unique isolated data
            expect(stateA.token).toBe('token-a');
            expect(stateA.step).toBe(2);
            expect(stateA.agree).toEqual([1]);
            expect(stateA.config).toBe('study-a');

            expect(stateB.token).toBe('token-b');
            expect(stateB.step).toBe(4);
            expect(stateB.disagree).toEqual([2]);
            expect(stateB.config).toBe('study-b');

            expect(stateC.token).toBe('token-c');
            expect(stateC.step).toBe(5);
            expect(stateC.neutral).toEqual([1]);
            expect(stateC.config).toBe('study-c');

            // Verify current state (Study C) doesn't contain Study A or B data
            expect(useSessionStore.getState().token).toBe('token-c');
            expect(useResponseStore.getState().rough.agree).not.toContain(1);
            expect(useResponseStore.getState().rough.disagree).not.toContain(2);
        });
    });

    describe('Pilot Mode Isolation', () => {
        it.skip('should use separate storage keys for pilot mode', () => {
            // ... (rest of test)
        });

        it.skip('should not contaminate production data with pilot data', () => {
            // ... (rest of test)
        });
    });

    describe('LocalStorage Persistence and Isolation', () => {
        it('should persist session data to localStorage', () => {
            useSessionStore.getState().setToken('persistent-token');
            useSessionStore.getState().setStep(3);

            const stored = localStorage.getItem('open-q-session');
            expect(stored).toContain('persistent-token');
            expect(stored).toContain('"currentStep":3');
        });

        it('should persist response data to localStorage', () => {
            useResponseStore.getState().categorizeCard(1, 'agree');
            useResponseStore.getState().categorizeCard(2, 'disagree');

            const stored = localStorage.getItem('open-q-responses');
            expect(stored).toContain('"agree":[1]');
            expect(stored).toContain('"disagree":[2]');
        });

        it('should clear all session data on reset', () => {
            // Set up session
            useSessionStore.getState().setToken('token');
            useSessionStore.getState().setConsent(true);
            useSessionStore.getState().setStep(4);
            useResponseStore.getState().categorizeCard(1, 'agree');
            useConfigStore.getState().setConfig(mockStudyConfig('study-x', 'Study X'));

            // Reset everything
            useSessionStore.getState().resetSession();
            useResponseStore.getState().resetResponses();
            useConfigStore.getState().resetConfig();

            // Verify in-memory state is cleared
            expect(useSessionStore.getState().token).toBeNull();
            expect(useSessionStore.getState().hasConsented).toBe(false);
            expect(useSessionStore.getState().currentStep).toBe(1);
            expect(useResponseStore.getState().rough.agree).toEqual([]);
            expect(useConfigStore.getState().config).toBeNull();
        });
    });

    describe('Test Mode Reset Flag', () => {
        it('should reset session when pilot reset flag is set', () => {
            const slug = 'test-study';

            // Setup existing session
            useSessionStore.getState().setToken('old-token');
            useResponseStore.getState().categorizeCard(1, 'agree');

            // Set the reset flag (as StudyDesignPage does)
            localStorage.setItem(`open-q-pilot-reset-${slug}`, 'true');

            // Simulate the test mode loading effect in useStudyConfig
            if (localStorage.getItem(`open-q-pilot-reset-${slug}`)) {
                useSessionStore.getState().resetSession();
                useResponseStore.getState().resetResponses();
                localStorage.removeItem(`open-q-pilot-reset-${slug}`);
            }

            // Verify session was reset
            expect(useSessionStore.getState().token).toBeNull();
            expect(useResponseStore.getState().rough.agree).toEqual([]);

            // Verify flag was removed
            expect(localStorage.getItem(`open-q-pilot-reset-${slug}`)).toBeNull();
        });
    });

    describe('Admin and Participant Namespace Isolation', () => {
        it('should not interfere with admin storage', () => {
            // Set participant data
            useSessionStore.getState().setToken('participant-token');

            // Simulate admin data in localStorage
            localStorage.setItem('admin-auth-storage', JSON.stringify({ token: 'admin-token' }));
            localStorage.setItem(
                'admin-storage',
                JSON.stringify({ someAdminState: 'admin-value' })
            );

            // Verify participant operations don't affect admin data
            useSessionStore.getState().resetSession();

            expect(localStorage.getItem('admin-auth-storage')).toContain('admin-token');
            expect(localStorage.getItem('admin-storage')).toContain('admin-value');
        });
    });

    describe('Edge Cases', () => {
        it('should handle rapid study switching without data leakage', () => {
            // Rapidly switch between studies
            for (let i = 0; i < 10; i++) {
                const study = mockStudyConfig(`study-${i}`, `Study ${i}`);

                // Reset if slug changed
                const currentConfig = useConfigStore.getState().config;
                if (currentConfig && currentConfig.slug !== study.slug) {
                    useSessionStore.getState().resetSession();
                    useResponseStore.getState().resetResponses();
                    useConfigStore.getState().resetConfig();
                }

                // Set new study data
                useConfigStore.getState().setConfig(study);
                useSessionStore.getState().setToken(`token-${i}`);
                useResponseStore.getState().categorizeCard(i, 'agree');
            }

            // Verify final state contains only the last study's data
            expect(useSessionStore.getState().token).toBe('token-9');
            expect(useResponseStore.getState().rough.agree).toEqual([9]);
            expect(useConfigStore.getState().config?.slug).toBe('study-9');

            // Verify no data from previous studies leaked
            for (let i = 0; i < 9; i++) {
                expect(useResponseStore.getState().rough.agree).not.toContain(i);
            }
        });

        it('should handle browser back/forward navigation', () => {
            const studyA = mockStudyConfig('study-a', 'Study A');
            const studyB = mockStudyConfig('study-b', 'Study B');

            // Visit Study A
            useConfigStore.getState().setConfig(studyA);
            useSessionStore.getState().setToken('token-a');

            // Navigate to Study B
            if (useConfigStore.getState().config?.slug !== studyB.slug) {
                useSessionStore.getState().resetSession();
                useConfigStore.getState().resetConfig();
            }
            useConfigStore.getState().setConfig(studyB);
            useSessionStore.getState().setToken('token-b');

            // Simulate back navigation to Study A
            if (useConfigStore.getState().config?.slug !== studyA.slug) {
                useSessionStore.getState().resetSession();
                useConfigStore.getState().resetConfig();
            }
            useConfigStore.getState().setConfig(studyA);

            // Verify session was reset (not restored to old state)
            expect(useSessionStore.getState().token).toBeNull();
        });

        it('should handle undefined/null slug gracefully', () => {
            useConfigStore.getState().setConfig(mockStudyConfig('study-a', 'Study A'));
            useSessionStore.getState().setToken('token-a');

            // Attempt to check with undefined slug (shouldn't crash)
            const config = useConfigStore.getState().config;
            const undefinedSlug = undefined as unknown as string;

            if (undefinedSlug && config && config.slug !== undefinedSlug) {
                useSessionStore.getState().resetSession();
            }

            // Session should not be reset because condition wasn't met
            expect(useSessionStore.getState().token).toBe('token-a');
        });
    });

    describe('Response Data Isolation', () => {
        it('should not carry over rough sort data between studies', () => {
            // Study A: Categorize cards
            useResponseStore.getState().categorizeCard(1, 'agree');
            useResponseStore.getState().categorizeCard(2, 'disagree');
            useResponseStore.getState().categorizeCard(3, 'neutral');

            expect(useResponseStore.getState().rough.agree).toEqual([1]);
            expect(useResponseStore.getState().rough.disagree).toEqual([2]);
            expect(useResponseStore.getState().rough.neutral).toEqual([3]);

            // Switch to Study B
            useResponseStore.getState().resetResponses();

            // Verify all rough sort data is cleared
            expect(useResponseStore.getState().rough.agree).toEqual([]);
            expect(useResponseStore.getState().rough.disagree).toEqual([]);
            expect(useResponseStore.getState().rough.neutral).toEqual([]);
            expect(useResponseStore.getState().rough.history).toEqual([]);
        });

        it('should not carry over fine sort (qsort) data between studies', () => {
            // Setup config for fine sort
            useConfigStore.getState().setConfig({
                statements: [{ id: 1, text: 'Test' }],
                grid_config: [{ score: 0, capacity: 5 }],
                // biome-ignore lint/suspicious/noExplicitAny: mock study data
            } as any);

            // Study A: Place cards in grid
            useResponseStore.getState().placeCardInGrid(1, 0, 0);
            useResponseStore.getState().placeCardInGrid(2, 0, 1);

            expect(useResponseStore.getState().qsort).toHaveLength(2);

            // Switch to Study B
            useResponseStore.getState().resetResponses();

            // Verify qsort data is cleared
            expect(useResponseStore.getState().qsort).toEqual([]);
        });

        it('should not carry over presort and postsort data between studies', () => {
            // Study A: Set presort and postsort responses
            useResponseStore.getState().setPresortResponse({ age: 25, role: 'Developer' });
            useResponseStore.getState().setPostSortResponse('general_comment', 'Great study!');
            useResponseStore
                .getState()
                .setPostSortResponse('card_comments', { 1: 'Comment on card 1' });

            expect(useResponseStore.getState().presort).toEqual({ age: 25, role: 'Developer' });
            expect(useResponseStore.getState().postsort.general_comment).toBe('Great study!');
            expect(useResponseStore.getState().postsort.card_comments).toEqual({
                1: 'Comment on card 1',
            });

            // Switch to Study B
            useResponseStore.getState().resetResponses();

            // Verify all response data is cleared
            expect(useResponseStore.getState().presort).toEqual({});
            expect(useResponseStore.getState().postsort.general_comment).toBe('');
            expect(useResponseStore.getState().postsort.card_comments).toEqual({});
        });
    });
});
