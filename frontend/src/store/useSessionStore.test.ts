import { describe, it, expect, beforeEach } from 'vitest';
import { useSessionStore } from './useSessionStore';

describe('useSessionStore', () => {
    beforeEach(() => {
        useSessionStore.getState().resetSession();
    });

    it('initializes with default values', () => {
        const state = useSessionStore.getState();
        expect(state.token).toBeNull();
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

    it('completes session', () => {
        useSessionStore.getState().completeSession('code-123');
        const state = useSessionStore.getState();
        expect(state.isCompleted).toBe(true);
        expect(state.confirmationCode).toBe('code-123');
    });

    it('resets session', () => {
        const store = useSessionStore.getState();
        store.setToken('token');
        store.setConsent(true);
        store.setStep(3);
        store.completeSession('code');

        store.resetSession();

        const newState = useSessionStore.getState();
        expect(newState.token).toBeNull();
        expect(newState.hasConsented).toBe(false);
        expect(newState.currentStep).toBe(1);
        expect(newState.isCompleted).toBe(false);
        expect(newState.confirmationCode).toBeNull();
    });
});
