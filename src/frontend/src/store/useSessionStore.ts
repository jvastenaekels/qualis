/**
 * Session Store
 *
 * Manages the participant's session state including authentication tokens, current step, and consent status.
 * Persists data to localStorage to allow page reloads.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { resetBaseLocales } from '../utils/i18nOverrides';
import { clearPilotFlag, isPilot } from '../utils/pilotMode';
import { safeLocalStorage } from './safeStorage';

interface SessionState {
    token: string | null;
    studySlug: string | null;
    hasConsented: boolean;
    currentStep: number;
    maxReachedStep: number;
    language: string | null;
    isCompleted: boolean;
    confirmationCode: string | null;
    resumeCode: string | null;
    isSaving: boolean;
    isSubmitting: boolean;
    isPilotMode: boolean;

    setToken: (token: string) => void;
    setStudySlug: (slug: string) => void;
    setConsent: (hasConsented: boolean) => void;
    setStep: (step: number) => void;
    setLanguage: (lang: string) => void;
    completeSession: (code: string) => void;
    setResumeCode: (code: string) => void;
    setSaving: (isSaving: boolean) => void;
    setSubmitting: (isSubmitting: boolean) => void;
    setPilotMode: (isPilot: boolean) => void;
    resetSession: () => void;
}

export const useSessionStore = create<SessionState>()(
    persist(
        (set) => ({
            token: null,
            studySlug: null,
            hasConsented: false,
            currentStep: 1,
            maxReachedStep: 1,
            language: null,
            isCompleted: false,
            confirmationCode: null,
            resumeCode: null,
            isSaving: false,
            isSubmitting: false,
            isPilotMode: isPilot(),

            setToken: (token) => set({ token }),
            setStudySlug: (studySlug) => set({ studySlug }),
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
            setSubmitting: (isSubmitting) => set({ isSubmitting }),
            setPilotMode: (isPilotMode) => set({ isPilotMode }),
            resetSession: () => {
                clearPilotFlag();
                resetBaseLocales();
                set({
                    token: null,
                    studySlug: null,
                    hasConsented: false,
                    currentStep: 1,
                    maxReachedStep: 1,
                    language: null,
                    isCompleted: false,
                    confirmationCode: null,
                    resumeCode: null,
                    isSaving: false,
                    isSubmitting: false,
                    isPilotMode: false,
                });
            },
        }),
        {
            name: isPilot() ? 'qualis-pilot-session' : 'qualis-session',
            version: 2,
            storage: safeLocalStorage,
            partialize: (state) => {
                // Exclude transient flags from persistence
                const { isSubmitting: _isSubmitting, isSaving: _isSaving, ...rest } = state;
                return rest;
            },
            migrate: (persisted: unknown, version: number) => {
                let state = persisted as Record<string, unknown>;
                if (version < 1) {
                    // v0 → v1: added resumeCode field
                    state = { ...state, resumeCode: null, studySlug: null };
                }
                if (version < 2) {
                    // v1 → v2: added studySlug for per-study session isolation
                    state = { ...state, studySlug: state.studySlug ?? null };
                }
                return state as unknown as SessionState;
            },
        }
    )
);
