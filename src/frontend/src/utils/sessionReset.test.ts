import { describe, it, expect, beforeEach } from 'vitest';
import { resetAllStores } from './sessionReset';
import { useSessionStore } from '../store/useSessionStore';
import { useConfigStore } from '../store/useConfigStore';
import { useResponseStore } from '../store/useResponseStore';
import { useUIStore } from '../store/useUIStore';

describe('resetAllStores', () => {
    beforeEach(() => {
        // Set up some state in each store
        useSessionStore.setState({
            token: 'test-token',
            hasConsented: true,
            currentStep: 3,
            maxReachedStep: 3,
            language: 'fr',
        });
        useResponseStore.setState({
            presort: { q1: 'answer' },
            rough: { agree: [1, 2], disagree: [3], neutral: [4], history: [1, 2, 3, 4] },
            qsort: [{ statementId: 1, col: 0, row: 0 }],
        });
        useUIStore.setState({
            hoveredCard: { id: 1, text: 'test' },
            activeCard: { id: 2, text: 'test2' },
            selectedCard: { id: 3, text: 'test3' },
        });
    });

    it('resets all stores to initial state', () => {
        resetAllStores();

        const session = useSessionStore.getState();
        expect(session.token).toBeNull();
        expect(session.hasConsented).toBe(false);
        expect(session.currentStep).toBe(1);

        const responses = useResponseStore.getState();
        expect(responses.presort).toEqual({});
        expect(responses.rough.agree).toEqual([]);
        expect(responses.qsort).toEqual([]);

        const ui = useUIStore.getState();
        expect(ui.hoveredCard).toBeNull();
        expect(ui.activeCard).toBeNull();
        expect(ui.selectedCard).toBeNull();
    });

    it('skips config reset when skipConfig is true', () => {
        const mockConfig = {
            slug: 'test',
            title: 'Test',
            description: 'Test study',
            statements: [],
            grid_config: [],
        };
        useConfigStore.getState().setConfig(mockConfig as import('../schemas/study').StudyConfig);

        resetAllStores({ skipConfig: true });

        // Config should be preserved
        expect(useConfigStore.getState().config).not.toBeNull();

        // Other stores should still be reset
        expect(useSessionStore.getState().token).toBeNull();
        expect(useResponseStore.getState().qsort).toEqual([]);
        expect(useUIStore.getState().hoveredCard).toBeNull();
    });
});
