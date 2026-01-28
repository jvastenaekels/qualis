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
    // biome-ignore lint/suspicious/noExplicitAny: flexible study configuration import
    importConfig: (config: any) => void;
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
        randomize_statement_order: study.randomize_statement_order,
        symmetry_lock: study.symmetry_lock,
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
 * Normalizes a localized field (label, placeholder, etc.) from a legacy string
 * or partially populated object to a fully populated localized object.
 */
function normalizeLocalizedField(
    // biome-ignore lint/suspicious/noExplicitAny: can be string or object
    field: any,
    availableLanguages: string[],
    defaultLang = 'en'
): Record<string, string> {
    const result: Record<string, string> = {};

    if (typeof field === 'string') {
        // Legacy format: convert string to object for all languages
        for (const lang of availableLanguages) {
            result[lang] = field;
        }
        // Ensure default language is set if not in available
        if (!result[defaultLang]) result[defaultLang] = field;
    } else if (field && typeof field === 'object') {
        const sourceVal = field[defaultLang] || Object.values(field)[0] || '';
        for (const lang of availableLanguages) {
            result[lang] = field[lang] !== undefined ? field[lang] : sourceVal;
        }
    } else {
        // Empty case
        for (const lang of availableLanguages) {
            result[lang] = '';
        }
    }

    return result;
}

/**
 * Traverses study configuration to normalize all recursive question fields.
 */
function normalizeStudyData(draft: StudyUpdate) {
    const availableLanguages = (draft.translations || []).map((t) => t.language_code);
    const defaultLang = draft.default_language || 'en';

    if (!availableLanguages.includes(defaultLang)) {
        availableLanguages.push(defaultLang);
    }

    // --- Normalize Pre-Sort ---
    if (draft.presort_config) {
        // biome-ignore lint/suspicious/noExplicitAny: config traversal
        const fields = (draft.presort_config as any).fields || {};
        for (const qId in fields) {
            const q = fields[qId];
            q.label = normalizeLocalizedField(q.label, availableLanguages, defaultLang);
            if (q.placeholder) {
                q.placeholder = normalizeLocalizedField(
                    q.placeholder,
                    availableLanguages,
                    defaultLang
                );
            }
            if (Array.isArray(q.options)) {
                // biome-ignore lint/suspicious/noExplicitAny: options can be strings or objects
                q.options = q.options.map((opt: any) => {
                    if (typeof opt === 'string') {
                        return {
                            label: normalizeLocalizedField(opt, availableLanguages, defaultLang),
                            value: opt,
                        };
                    }
                    if (opt?.label) {
                        opt.label = normalizeLocalizedField(
                            opt.label,
                            availableLanguages,
                            defaultLang
                        );
                    }
                    return opt;
                });
            }
        }
    }

    // --- Normalize Post-Sort ---
    if (draft.postsort_config) {
        // biome-ignore lint/suspicious/noExplicitAny: config traversal
        const questions = (draft.postsort_config as any).questions || {};
        for (const qId in questions) {
            const q = questions[qId];
            q.label = normalizeLocalizedField(q.label, availableLanguages, defaultLang);
            if (q.placeholder) {
                q.placeholder = normalizeLocalizedField(
                    q.placeholder,
                    availableLanguages,
                    defaultLang
                );
            }
            if (Array.isArray(q.options)) {
                // biome-ignore lint/suspicious/noExplicitAny: options can be strings or objects
                q.options = q.options.map((opt: any) => {
                    if (typeof opt === 'string') {
                        return {
                            label: normalizeLocalizedField(opt, availableLanguages, defaultLang),
                            value: opt,
                        };
                    }
                    if (opt?.label) {
                        opt.label = normalizeLocalizedField(
                            opt.label,
                            availableLanguages,
                            defaultLang
                        );
                    }
                    return opt;
                });
            }
        }
    }
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
            console.log('Draft:', jsonA);
            console.log('Original:', jsonB);

            // Helpful if you want to see where it breaks
            // console.log('A:', processedA);
            // console.log('B:', processedB);
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

    setStudy: (study: StudyRead) => {
        const draft = projectStudyToUpdate(study);
        normalizeStudyData(draft);
        set({
            original: study,
            draft,
        });
    },

    updateDraft: (fn: (d: StudyUpdate) => void) =>
        set((state: StudyDesignerState) => {
            if (!state.draft) return state;
            const newDraft = produce(state.draft, fn);
            normalizeStudyData(newDraft);
            return { draft: newDraft };
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
    // biome-ignore lint/suspicious/noExplicitAny: flexible study configuration import
    importConfig: (config: any) =>
        set(
            produce((state: StudyDesignerState) => {
                if (!state.draft) return;

                // Handle both wrapped and unwrapped configs
                const studyData = config.study || config;

                // --- Top-level simple fields ---
                if (studyData.default_language)
                    state.draft.default_language = studyData.default_language;
                if (studyData.show_statement_codes !== undefined)
                    state.draft.show_statement_codes = studyData.show_statement_codes;
                if (studyData.randomize_statement_order !== undefined)
                    state.draft.randomize_statement_order = studyData.randomize_statement_order;
                if (studyData.symmetry_lock !== undefined)
                    state.draft.symmetry_lock = studyData.symmetry_lock;

                // --- Structural fields (Replace entirely) ---
                if (studyData.grid_config) state.draft.grid_config = studyData.grid_config;
                if (studyData.statements) state.draft.statements = studyData.statements;

                // --- Config Objects (Merge) ---
                if (studyData.branding) {
                    state.draft.branding = {
                        ...(state.draft.branding || {}),
                        ...studyData.branding,
                    };
                }
                if (studyData.presort_config) {
                    state.draft.presort_config = {
                        ...(state.draft.presort_config || {}),
                        ...studyData.presort_config,
                    };
                }
                if (studyData.postsort_config) {
                    state.draft.postsort_config = {
                        ...(state.draft.postsort_config || {}),
                        ...studyData.postsort_config,
                    };
                }

                if (Array.isArray(studyData.translations)) {
                    if (!state.draft.translations) state.draft.translations = [];
                    for (const tIn of studyData.translations) {
                        const existingIdx = state.draft.translations.findIndex(
                            (tr) => tr.language_code === tIn.language_code
                        );

                        if (existingIdx !== -1) {
                            // Merge into existing translation
                            state.draft.translations[existingIdx] = {
                                ...state.draft.translations[existingIdx],
                                ...tIn,
                            };
                        } else {
                            // Add new translation
                            state.draft.translations.push(tIn);
                        }
                    }
                }

                normalizeStudyData(state.draft);
                state.syncStatus = 'modified';
            })
        ),
}));
