/*
 * Open-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useStudyStore } from './useStudyStore';

describe('Rough Sort Store Logic', () => {
    beforeEach(() => {
        useStudyStore.getState().resetSession();
    });

    it('categorizes cards correcty', () => {
        const store = useStudyStore.getState();
        store.categorizeCard(1, 'agree');
        
        const state = useStudyStore.getState();
        expect(state.responses.rough.agree).toContain(1);
        expect(state.responses.rough.history).toContain(1);
    });

    it('undoes the last categorization', () => {
        const store = useStudyStore.getState();
        store.categorizeCard(1, 'agree');
        store.categorizeCard(2, 'disagree');
        
        let state = useStudyStore.getState();
        expect(state.responses.rough.disagree).toContain(2);
        expect(state.responses.rough.history.length).toBe(2);

        store.undoRoughSort();
        state = useStudyStore.getState();
        
        // Should remove 2 from disagree
        expect(state.responses.rough.disagree).not.toContain(2);
        // Should keep 1 in agree
        expect(state.responses.rough.agree).toContain(1);
        // History should be 1
        expect(state.responses.rough.history.length).toBe(1);
    });
});
