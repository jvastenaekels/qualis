/**
 * Session Store
 *
 * Manages the participant's session state including authentication tokens, current step, and consent status.
 * Persists data to localStorage to allow page reloads.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { resetBaseLocales } from '../utils/i18nOverrides';
import { safeLocalStorage } from './safeStorage';

interface SessionState {
    token: string | null;
    hasConsented: boolean;
    currentStep: number;
    maxReachedStep: number;
    language: string | null;
    isCompleted: boolean;
    confirmationCode: string | null;
    resumeCode: string | null;
    isSaving: boolean;
    isPilotMode: boolean;

    setToken: (token: string) => void;
    setConsent: (hasConsented: boolean) => void;
    setStep: (step: number) => void;
    setLanguage: (lang: string) => void;
    completeSession: (code: string) => void;
    setResumeCode: (code: string) => void;
    setSaving: (isSaving: boolean) => void;
    setPilotMode: (isPilot: boolean) => void;
    resetSession: () => void;
}

const isPilot = () => {
    try {
        const params = new URLSearchParams(window.location.search);
        if (params.get('mode') === 'test') {
            sessionStorage.setItem('libre-q-pilot-mode', 'true');
            return true;
        }
        return sessionStorage.getItem('libre-q-pilot-mode') === 'true';
    } catch {
        return false;
    }
};

export const useSessionStore = create<SessionState>()(
    persist(
        (set) => ({
            token: null,
            hasConsented: false,
            currentStep: 1,
            maxReachedStep: 1,
            language: null,
            isCompleted: false,
            confirmationCode: null,
            resumeCode: null,
            isSaving: false,
            isPilotMode: isPilot(),

            setToken: (token) => set({ token }),
            setConsent: (hasConsented) => set({ hasConsented }),
            setStep: (step) =>
                set((state) => ({
                    currentStep: step,
                    maxReachedStep: Math.max(state.maxReachedStep, step),
                })),
            setLanguage: (language) =>
                set((state) => {
                    if (state.language === language) return state;
                    return { language };
                }),
            completeSession: (confirmationCode) => set({ isCompleted: true, confirmationCode }),
            setResumeCode: (resumeCode) => set({ resumeCode }),
            setSaving: (isSaving) => set({ isSaving }),
            setPilotMode: (isPilotMode) => set({ isPilotMode }),
            resetSession: () => {
                resetBaseLocales();
                set({
                    token: null,
                    hasConsented: false,
                    currentStep: 1,
                    maxReachedStep: 1,
                    language: null,
                    isCompleted: false,
                    confirmationCode: null,
                    resumeCode: null,
                    isSaving: false,
                    isPilotMode: false,
                });
            },
        }),
        {
            name: isPilot() ? 'libre-q-pilot-session' : 'libre-q-session',
            version: 1,
            storage: safeLocalStorage,
            migrate: (persisted: unknown, version: number) => {
                if (version === 0) {
                    // v0 → v1: added resumeCode field
                    return { ...(persisted as Record<string, unknown>), resumeCode: null };
                }
                return persisted as SessionState;
            },
        }
    )
);
