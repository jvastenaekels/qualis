/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { useConfigStore } from './useConfigStore';
import { useResponseStore } from './useResponseStore';

describe('useResponseStore', () => {
    beforeEach(() => {
        useResponseStore.getState().resetResponses();

        // Mock Config Store for Grid Sort tests
        useConfigStore.setState({
            config: {
                slug: 'test',
                title: 'Test',
                description: 'Test',
                instructions: 'Test',
                grid_config: [
                    { score: 0, capacity: 1 },
                    { score: 1, capacity: 1 },
                ],
                statements: [
                    { id: 1, text: 'S1' },
                    { id: 2, text: 'S2' },
                ],
                presort_config: {},
            },
            isLoading: false,
            error: null,
        });
    });

    it('should initialize with empty state', () => {
        const state = useResponseStore.getState();
        expect(state.rough.agree).toEqual([]);
        expect(state.rough.disagree).toEqual([]);
        expect(state.rough.neutral).toEqual([]);
        expect(state.qsort).toEqual([]);
    });

    it('should categorize cards correctly in rough sort', () => {
        const store = useResponseStore.getState();
        store.categorizeCard(1, 'agree');
        store.categorizeCard(2, 'disagree');
        store.categorizeCard(3, 'neutral');

        const state = useResponseStore.getState();
        expect(state.rough.agree).toContain(1);
        expect(state.rough.disagree).toContain(2);
        expect(state.rough.neutral).toContain(3);
    });

    it('should move card between rough sort categories', () => {
        const store = useResponseStore.getState();
        store.categorizeCard(1, 'agree');
        store.categorizeCard(1, 'disagree'); // Move same card

        const state = useResponseStore.getState();
        expect(state.rough.agree).not.toContain(1);
        expect(state.rough.disagree).toContain(1);
    });

    it('should place card in grid', () => {
        const store = useResponseStore.getState();
        store.placeCardInGrid(1, 0, 0);

        const state = useResponseStore.getState();
        expect(state.qsort).toHaveLength(1);
        expect(state.qsort[0]).toEqual({ statementId: 1, col: 0, row: 0 });
    });

    it('should NOT place card if column is full', () => {
        const store = useResponseStore.getState();
        store.placeCardInGrid(1, 0, 0); // Capacity 1
        store.placeCardInGrid(2, 0, 0); // Should fail

        const state = useResponseStore.getState();
        expect(state.qsort).toHaveLength(1);
        expect(state.qsort[0].statementId).toBe(1);
    });

    it('should move card within grid', () => {
        const store = useResponseStore.getState();
        store.placeCardInGrid(1, 0, 0);
        store.moveCardInGrid(1, 1, 0); // Move to col 1 (capacity 1)

        const state = useResponseStore.getState();
        expect(state.qsort).toHaveLength(1);
        expect(state.qsort[0]).toEqual({ statementId: 1, col: 1, row: 0 });
    });

    it('should swap cards in grid', () => {
        const store = useResponseStore.getState();
        // Setup initial state: Card 1 at 0,0; Card 2 at 1,0
        useResponseStore.setState({
            qsort: [
                { statementId: 1, col: 0, row: 0 },
                { statementId: 2, col: 1, row: 0 },
            ],
        });

        store.swapCardsInGrid(1, 2);

        const state = useResponseStore.getState();
        const c1 = state.qsort.find((c) => c.statementId === 1);
        const c2 = state.qsort.find((c) => c.statementId === 2);

        expect(c1).toEqual({ statementId: 1, col: 1, row: 0 });
        expect(c2).toEqual({ statementId: 2, col: 0, row: 0 });
    });

    it('should reset state', () => {
        const store = useResponseStore.getState();
        store.categorizeCard(1, 'agree');
        store.resetResponses();

        const state = useResponseStore.getState();
        expect(state.rough.agree).toHaveLength(0);
    });

    // ── Deck slice (rough_sort_enabled=false / deck mode) ─────────
    describe('deck slice', () => {
        it('initializes deck to an empty array', () => {
            const state = useResponseStore.getState();
            expect(state.deck).toEqual([]);
        });

        it('addToDeck appends a new id to deck', () => {
            const store = useResponseStore.getState();
            store.addToDeck(1);
            expect(useResponseStore.getState().deck).toEqual([1]);
        });

        it('addToDeck is idempotent — repeated calls with the same id do not duplicate', () => {
            const store = useResponseStore.getState();
            store.addToDeck(1);
            store.addToDeck(1);
            store.addToDeck(2);
            expect(useResponseStore.getState().deck).toEqual([1, 2]);
        });

        it('removeFromDeck removes the id from deck', () => {
            const store = useResponseStore.getState();
            store.addToDeck(1);
            store.addToDeck(2);
            store.removeFromDeck(1);
            expect(useResponseStore.getState().deck).toEqual([2]);
        });

        it('removeFromDeck is a no-op when the id is missing', () => {
            const store = useResponseStore.getState();
            store.addToDeck(2);
            store.removeFromDeck(999);
            expect(useResponseStore.getState().deck).toEqual([2]);
        });

        it('resetResponses clears deck', () => {
            const store = useResponseStore.getState();
            store.addToDeck(1);
            store.addToDeck(2);
            store.resetResponses();
            expect(useResponseStore.getState().deck).toEqual([]);
        });
    });
});
