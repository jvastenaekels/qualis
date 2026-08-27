/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { useResponseStore } from './useResponseStore';

describe('Rough Sort Store Logic', () => {
    beforeEach(() => {
        useResponseStore.getState().resetResponses();
    });

    it('categorizes cards correctly', () => {
        useResponseStore.getState().categorizeCard(1, 'agree');

        const state = useResponseStore.getState();
        expect(state.rough.agree).toContain(1);
        expect(state.rough.history).toContain(1);
    });

    it('undoes the last categorization', () => {
        useResponseStore.getState().categorizeCard(1, 'agree');
        useResponseStore.getState().categorizeCard(2, 'disagree');

        let state = useResponseStore.getState();
        expect(state.rough.disagree).toContain(2);
        expect(state.rough.history.length).toBe(2);

        useResponseStore.getState().undoRoughSort();
        state = useResponseStore.getState();

        // Should remove 2 from disagree
        expect(state.rough.disagree).not.toContain(2);
        // Should keep 1 in agree
        expect(state.rough.agree).toContain(1);
        // History should be 1
        expect(state.rough.history.length).toBe(1);
    });
});
