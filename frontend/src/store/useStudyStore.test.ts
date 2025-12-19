/*
 * Open-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useStudyStore } from './useStudyStore';

describe('useStudyStore', () => {
    beforeEach(() => {
        useStudyStore.getState().resetSession();
        localStorage.clear();
    });

    it('initializes with default values', () => {
        const state = useStudyStore.getState();
        expect(state.config).toBeNull();
        expect(state.session.hasConsented).toBe(false);
        expect(state.session.currentStep).toBe(1);
    });

    it('updates consent and generates token', () => {
        const store = useStudyStore.getState();
        
        store.setConsent(true);
        expect(useStudyStore.getState().session.hasConsented).toBe(true);
        
        const token = 'test-token-123';
        store.setToken(token);
        expect(useStudyStore.getState().session.token).toBe(token);
    });

    it('persists state to localStorage', () => {
        const store = useStudyStore.getState();
        store.setConsent(true);
        
        // Manually trigger persist hydrate if needed, or assume zustand sync
        // In JSDOM, localstorage is synchronous.
        const storageValue = JSON.parse(localStorage.getItem('q-method-storage') || '{}');
        expect(storageValue.state.session.hasConsented).toBe(true);
    });

    it('updates steps correctly', () => {
        const store = useStudyStore.getState();
        store.setStep(2);
        expect(useStudyStore.getState().session.currentStep).toBe(2);
    });

    it('stores presort responses', () => {
        const store = useStudyStore.getState();
        const response = { age: 25, role: 'Developer' };
        store.setPresortResponse(response);
        
        expect(useStudyStore.getState().responses.presort).toEqual(response);
    });
});
