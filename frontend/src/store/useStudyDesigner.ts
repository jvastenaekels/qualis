import { create } from 'zustand';
import type { StudyRead, StudyUpdate, StudyTranslationRead } from '@/api/model';
import { produce } from 'immer';

interface StudyDesignerState {
    draft: StudyUpdate | null;
    original: StudyRead | null;
    activeStep: 'intro' | 'pre-sort' | 'q-sort' | 'post-sort' | 'interface' | 'branding';
    activeSubStep?: string;
    activeLocale: string;

    // Actions
    setStudy: (study: StudyRead) => void;
    updateDraft: (fn: (draft: StudyUpdate) => void) => void;
    // biome-ignore lint/suspicious/noExplicitAny: complex translation type
    updateTranslation: (lang: string, fn: (t: any) => void) => void;
    setActiveStep: (
        step: 'intro' | 'pre-sort' | 'q-sort' | 'post-sort' | 'interface' | 'branding'
    ) => void;
    setActiveSubStep: (step: string) => void;
    setActiveLocale: (locale: string) => void;
    resetDraft: () => void;
}

export const useStudyDesigner = create<StudyDesignerState>((set) => ({
    draft: null,
    original: null,
    activeStep: 'intro',
    activeSubStep: 'statements',
    activeLocale: 'en',

    setStudy: (study: StudyRead) =>
        set({
            original: study,
            draft: {
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
                })),
                statements: (study.statements || []).map((s) => ({
                    code: s.code,
                    translations: (s.translations || []).map((st) => ({
                        language_code: st.language_code,
                        text: st.text,
                    })),
                })),
            },
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
        step: 'intro' | 'pre-sort' | 'q-sort' | 'post-sort' | 'interface' | 'branding'
    ) => set({ activeStep: step }),
    setActiveSubStep: (step: string) => set({ activeSubStep: step }),
    setActiveLocale: (locale: string) => set({ activeLocale: locale }),

    resetDraft: () =>
        set((state: StudyDesignerState) => ({
            draft: state.original ? ({ ...state.original } as StudyUpdate) : null,
        })),
}));
