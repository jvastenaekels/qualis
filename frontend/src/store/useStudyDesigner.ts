import { create } from 'zustand';
import type { StudyRead, StudyUpdate, StudyTranslationRead } from '@/api/model';
import { produce } from 'immer';

export interface StudyDesignerState {
    draft: StudyUpdate | null;
    original: StudyRead | null;
    activeStep:
        | 'intro'
        | 'pre-sort'
        | 'condition'
        | 'q-sort'
        | 'post-sort'
        | 'interface'
        | 'branding';
    activeSubStep?: string;
    activeLocale: string;
    syncStatus: 'synced' | 'saving' | 'error' | 'modified';
    lastSavedAt: Date | null;

    // Actions
    setStudy: (study: StudyRead) => void;
    updateDraft: (fn: (draft: StudyUpdate) => void) => void;
    // biome-ignore lint/suspicious/noExplicitAny: complex translation type
    updateTranslation: (lang: string, fn: (t: any) => void) => void;
    setActiveStep: (
        step: 'intro' | 'pre-sort' | 'condition' | 'q-sort' | 'post-sort' | 'interface' | 'branding'
    ) => void;
    setActiveSubStep: (step: string) => void;
    setActiveLocale: (locale: string) => void;
    resetDraft: () => void;
    setSyncStatus: (status: 'synced' | 'saving' | 'error' | 'modified') => void;
    setLastSavedAt: (date: Date) => void;
    updateOriginal: (study: StudyRead) => void;
}

/**
 * Utility to project a full StudyRead object into a StudyUpdate object,
 * ensuring consistency between server state and designer draft.
 */
export function projectStudyToUpdate(study: StudyRead): StudyUpdate {
    return {
        slug: study.slug,
        state: study.state,
        grid_config: study.grid_config,
        presort_config: study.presort_config,
        postsort_config: study.postsort_config,
        default_language: study.default_language,
        show_statement_codes: study.show_statement_codes,
        randomize_statements: study.randomize_statements,
        branding: study.branding,

        translations: (study.translations || []).map((t) => ({
            language_code: t.language_code,
            title: t.title,
            description: t.description,
            instructions: t.instructions,
            subtitle: t.subtitle,
            objective: t.objective,
            consent_title: t.consent_title,
            consent_description: t.consent_description,
            consent_accept: t.consent_accept,
            consent_decline: t.consent_decline,
            ui_labels: t.ui_labels,
            process_steps: t.process_steps,
            condition_of_instruction: t.condition_of_instruction,
            pre_instruction: t.pre_instruction,
            // biome-ignore lint/suspicious/noExplicitAny: methodology tips missing in generated type
            methodology_tips: (t as any).methodology_tips || [],
            // biome-ignore lint/suspicious/noExplicitAny: step help missing in generated type
            step_help: (t as any).step_help || {},
        })),
        statements: (study.statements || []).map((s) => ({
            code: s.code,
            translations: (s.translations || []).map((st) => ({
                language_code: st.language_code,
                text: st.text,
            })),
        })),
        last_updated_at: study.updated_at,
    };
}

/**
 * Deeply strips internal fields AND sorts keys to ensure deterministic JSON stringification.
 */
// biome-ignore lint/suspicious/noExplicitAny: generic object cleaner
function stripInternalFields(obj: any): any {
    if (Array.isArray(obj)) {
        return obj.map(stripInternalFields);
    }
    if (obj !== null && typeof obj === 'object') {
        // biome-ignore lint/suspicious/noExplicitAny: generic object construction
        const newObj: any = {};
        // Sort keys to ensure deterministic order
        const sortedKeys = Object.keys(obj).sort();

        for (const key of sortedKeys) {
            // Skip underscore-prefixed fields and last_updated_at (changes on every save)
            if (!key.startsWith('_') && key !== 'last_updated_at') {
                newObj[key] = stripInternalFields(obj[key]);
            }
        }
        return newObj;
    }
    return obj;
}

/**
 * Compares two study objects by ignoring internal state fields.
 */
export function areStudiesEqual(a: StudyUpdate | null, b: StudyUpdate | null): boolean {
    if (a === b) return true;
    if (!a || !b) return false;

    // With stripInternalFields sorting keys, JSON.stringify becomes deterministic
    const processedA = stripInternalFields(a);
    const processedB = stripInternalFields(b);

    const jsonA = JSON.stringify(processedA);
    const jsonB = JSON.stringify(processedB);

    if (jsonA !== jsonB) {
        if (process.env.NODE_ENV === 'development') {
            console.log('[areStudiesEqual] Mismatch detected');
            // Logic to log differences if needed
        }
        return false;
    }
    return true;
}

export const useStudyDesigner = create<StudyDesignerState>((set) => ({
    draft: null,
    original: null,
    activeStep: 'intro',
    activeSubStep: 'statements',
    activeLocale: 'en',
    syncStatus: 'synced',
    lastSavedAt: null,

    setStudy: (study: StudyRead) =>
        set({
            original: study,
            draft: projectStudyToUpdate(study),
        }),

    updateDraft: (fn: (d: StudyUpdate) => void) =>
        set((state: StudyDesignerState) => {
            if (!state.draft) return state;
            return { draft: produce(state.draft, fn) };
        }),

    // biome-ignore lint/suspicious/noExplicitAny: complex translation type
    updateTranslation: (lang: string, fn: (t: any) => void) =>
        set((state: StudyDesignerState) => {
            if (!state.draft) return state;
            return {
                draft: produce(state.draft, (draft: StudyUpdate) => {
                    let translation = draft.translations?.find((t) => t.language_code === lang);
                    if (!translation) {
                        translation = {
                            language_code: lang,
                            title: '',
                            subtitle: '',
                            description: '',
                            instructions: '',
                            condition_of_instruction: '',
                            pre_instruction: null,
                        } as StudyTranslationRead;
                        draft.translations?.push(translation);
                    }
                    fn(translation);
                    // Clear copy flag on any edit
                    // biome-ignore lint/suspicious/noExplicitAny: custom property
                    (translation as any)._is_copy = false;
                }),
            };
        }),

    setActiveStep: (
        step: 'intro' | 'pre-sort' | 'condition' | 'q-sort' | 'post-sort' | 'interface' | 'branding'
    ) => set({ activeStep: step }),
    setActiveSubStep: (step: string) => set({ activeSubStep: step }),
    setActiveLocale: (locale: string) => set({ activeLocale: locale }),

    resetDraft: () =>
        set((state: StudyDesignerState) => ({
            draft: state.original ? ({ ...state.original } as StudyUpdate) : null,
        })),
    setSyncStatus: (status) => set({ syncStatus: status }),
    setLastSavedAt: (date) => set({ lastSavedAt: date }),
    updateOriginal: (study) => set({ original: study }),
}));
