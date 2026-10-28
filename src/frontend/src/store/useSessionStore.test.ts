import { beforeEach, describe, expect, it } from 'vitest';
import { useSessionStore } from './useSessionStore';

describe('useSessionStore', () => {
    beforeEach(() => {
        useSessionStore.getState().resetSession();
    });

    it('initializes with default values', () => {
        const state = useSessionStore.getState();
        expect(state.token).toBeNull();
        expect(state.studySlug).toBeNull();
        expect(state.hasConsented).toBe(false);
        expect(state.currentStep).toBe(1);
        expect(state.maxReachedStep).toBe(1);
        expect(state.isCompleted).toBe(false);
    });

    it('updates consent', () => {
        useSessionStore.getState().setConsent(true);
        expect(useSessionStore.getState().hasConsented).toBe(true);
    });

    it('updates current step and max reached step', () => {
        const store = useSessionStore.getState();

        // Advance to step 2
        store.setStep(2);
        expect(useSessionStore.getState().currentStep).toBe(2);
        expect(useSessionStore.getState().maxReachedStep).toBe(2);

        // Advance to step 3
        store.setStep(3);
        expect(useSessionStore.getState().currentStep).toBe(3);
        expect(useSessionStore.getState().maxReachedStep).toBe(3);

        // Go back to step 2
        store.setStep(2);
        expect(useSessionStore.getState().currentStep).toBe(2);
        // Max reached should stay 3
        expect(useSessionStore.getState().maxReachedStep).toBe(3);
    });

    it('sets token', () => {
        useSessionStore.getState().setToken('test-token');
        expect(useSessionStore.getState().token).toBe('test-token');
    });

    it('sets study slug', () => {
        useSessionStore.getState().setStudySlug('my-study');
        expect(useSessionStore.getState().studySlug).toBe('my-study');
    });

    it('does not persist the session token once the session is completed', () => {
        const store = useSessionStore.getState();
        store.setStudySlug('demo');
        store.setToken('t');
        store.setResumeCode('RES');
        store.setConsent(true);
        store.setStep(4);
        store.completeSession('ABC');

        const persisted = JSON.parse(localStorage.getItem('qualis-session') ?? '{}').state;
        expect(persisted).toEqual({
            studySlug: 'demo',
            isCompleted: true,
            confirmationCode: 'ABC',
            language: null,
        });
        // In memory the token lives on until reload (the erase button needs it).
        expect(useSessionStore.getState().token).toBe('t');
    });

    it('keeps persisting the token and excluding the study password during a live session', () => {
        const store = useSessionStore.getState();
        store.setToken('t');
        store.setStudyPassword('secret');

        const persisted = JSON.parse(localStorage.getItem('qualis-session') ?? '{}').state;
        expect(persisted.token).toBe('t');
        expect(persisted).not.toHaveProperty('studyPassword');
    });

    it('completes session', () => {
        useSessionStore.getState().completeSession('code-123');
        const state = useSessionStore.getState();
        expect(state.isCompleted).toBe(true);
        expect(state.confirmationCode).toBe('code-123');
    });

    it('resets session', () => {
        const store = useSessionStore.getState();
        store.setToken('token');
        store.setStudySlug('my-study');
        store.setConsent(true);
        store.setStep(3);
        store.completeSession('code');

        store.resetSession();

        const newState = useSessionStore.getState();
        expect(newState.token).toBeNull();
        expect(newState.studySlug).toBeNull();
        expect(newState.hasConsented).toBe(false);
        expect(newState.currentStep).toBe(1);
        expect(newState.isCompleted).toBe(false);
        expect(newState.confirmationCode).toBeNull();
    });
});
