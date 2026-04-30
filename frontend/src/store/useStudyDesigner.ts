import { create } from 'zustand';
import type {
    StudyRead,
    StudyUpdate,
    StudyTranslationRead,
    StudyTranslationCreate,
} from '@/api/model';
import { produce } from 'immer';

/**
 * Draft-augmented translation type used inside the Zustand store.
 * Extends the API create schema with `_is_copy`, a transient flag set by
 * the language-copy action and cleared on the first edit. Using a typed
 * intersection here (rather than a discriminated union) is the right call
 * because every call site mutates the same flat record — there is no
 * branching on payload kind.
 */
export type DraftTranslation = StudyTranslationCreate & { _is_copy?: boolean };

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
    updateTranslation: (lang: string, fn: (t: DraftTranslation) => void) => void;
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
        // Default to true for legacy studies missing the rough_sort_enabled
        // column — mirrors the runtime fallback in `isRoughSortEnabled`.
        rough_sort_enabled: study.rough_sort_enabled ?? true,
        distribution_mode: study.distribution_mode,
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

            methodology_tips: t.methodology_tips ?? [],
            step_help: t.step_help ?? {},
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
    if (typeof field === 'string') {
        const result: Record<string, string> = {};
        for (const lang of availableLanguages) result[lang] = field;
        if (!result[defaultLang]) result[defaultLang] = field;
        return result;
    }
    if (field && typeof field === 'object') {
        const sourceVal = field[defaultLang] || Object.values(field)[0] || '';
        const result: Record<string, string> = {};
        for (const lang of availableLanguages) {
            result[lang] = field[lang] || sourceVal;
        }
        return result;
    }
    // Empty / null / undefined / non-object input
    const result: Record<string, string> = {};
    for (const lang of availableLanguages) result[lang] = '';
    return result;
}

/** Normalize a single question option (string or object form). */
function normalizeOption(
    // biome-ignore lint/suspicious/noExplicitAny: options can be strings or objects
    opt: any,
    availableLanguages: string[],
    defaultLang: string
    // biome-ignore lint/suspicious/noExplicitAny: dynamic option shape
): any {
    if (typeof opt === 'string') {
        return {
            label: normalizeLocalizedField(opt, availableLanguages, defaultLang),
            value: opt,
        };
    }
    if (opt?.label) {
        return {
            ...opt,
            label: normalizeLocalizedField(opt.label, availableLanguages, defaultLang),
        };
    }
    return opt;
}

/** Normalize the label / placeholder / options of a single question. */
function normalizeQuestion(
    // biome-ignore lint/suspicious/noExplicitAny: dynamic question shape
    q: any,
    availableLanguages: string[],
    defaultLang: string
): void {
    q.label = normalizeLocalizedField(q.label, availableLanguages, defaultLang);
    if (q.placeholder) {
        q.placeholder = normalizeLocalizedField(q.placeholder, availableLanguages, defaultLang);
    }
    if (Array.isArray(q.options)) {
        q.options = q.options.map(
            // biome-ignore lint/suspicious/noExplicitAny: dynamic option shape
            (opt: any) => normalizeOption(opt, availableLanguages, defaultLang)
        );
    }
}

/** Iterate a question-id keyed map and normalize each entry. */
function normalizeQuestionMap(
    // biome-ignore lint/suspicious/noExplicitAny: legacy map of questions
    questions: Record<string, any> | undefined,
    availableLanguages: string[],
    defaultLang: string
): void {
    if (!questions) return;
    for (const qId in questions) {
        normalizeQuestion(questions[qId], availableLanguages, defaultLang);
    }
}

/**
 * Traverses study configuration to normalize all recursive question fields.
 */
function normalizeStudyData(draft: StudyUpdate) {
    const availableLanguages = (draft.translations || []).map((t) => t.language_code);
    const defaultLang = draft.default_language || draft.translations?.[0]?.language_code || 'en';

    if (!availableLanguages.includes(defaultLang)) {
        availableLanguages.push(defaultLang);
    }

    // --- Normalize Pre-Sort ---
    if (draft.presort_config) {
        // If it's a legacy structure (no 'enabled' flag), migrate it
        if (!('enabled' in draft.presort_config)) {
            draft.presort_config = {
                enabled: true,
                // biome-ignore lint/suspicious/noExplicitAny: legacy migration
                fields: draft.presort_config as any,
            };
        }
        // biome-ignore lint/suspicious/noExplicitAny: legacy migration
        const fields = (draft.presort_config as any).fields;
        normalizeQuestionMap(fields, availableLanguages, defaultLang);
    }

    // --- Normalize Post-Sort ---
    if (draft.postsort_config) {
        // biome-ignore lint/suspicious/noExplicitAny: config traversal
        const questions = (draft.postsort_config as any).questions;
        normalizeQuestionMap(questions, availableLanguages, defaultLang);
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
        const firstLang = study.default_language || study.translations?.[0]?.language_code || 'en';
        set({
            original: study,
            draft,
            activeLocale: firstLang,
        });
    },

    updateDraft: (fn: (d: StudyUpdate) => void) =>
        set((state: StudyDesignerState) => {
            if (!state.draft) return state;
            const newDraft = produce(state.draft, (d) => {
                fn(d);
                normalizeStudyData(d);
            });
            return { draft: newDraft };
        }),

    updateTranslation: (lang: string, fn: (t: DraftTranslation) => void) =>
        set((state: StudyDesignerState) => {
            if (!state.draft) return state;
            return {
                draft: produce(state.draft, (draft: StudyUpdate) => {
                    let translation = draft.translations?.find((t) => t.language_code === lang) as
                        | DraftTranslation
                        | undefined;
                    if (!translation) {
                        const newTranslation: DraftTranslation = {
                            language_code: lang,
                            title: '',
                        };
                        draft.translations?.push(newTranslation as StudyTranslationRead);
                        translation = newTranslation;
                    }
                    fn(translation);
                    // Clear copy flag on any edit
                    translation._is_copy = false;
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
                const studyData = config.study || config; // wrapped or unwrapped
                applyImportedSimpleFields(state.draft, studyData);
                applyImportedStructuralFields(state.draft, studyData);
                applyImportedMergedConfigs(state.draft, studyData);
                applyImportedTranslations(state.draft, studyData);
                normalizeStudyData(state.draft);
                state.syncStatus = 'modified';
            })
        ),
}));

// biome-ignore lint/suspicious/noExplicitAny: imported config has dynamic shape
function applyImportedSimpleFields(draft: StudyUpdate, studyData: any): void {
    const keys = [
        'default_language',
        'show_statement_codes',
        'randomize_statement_order',
        'symmetry_lock',
        'rough_sort_enabled',
        'distribution_mode',
    ] as const;
    for (const key of keys) {
        if (studyData[key] !== undefined) {
            draft[key] = studyData[key];
        }
    }
}

// biome-ignore lint/suspicious/noExplicitAny: imported config has dynamic shape
function applyImportedStructuralFields(draft: StudyUpdate, studyData: any): void {
    if (studyData.grid_config) draft.grid_config = studyData.grid_config;
    if (studyData.statements) draft.statements = studyData.statements;
}

// biome-ignore lint/suspicious/noExplicitAny: imported config has dynamic shape
function applyImportedMergedConfigs(draft: StudyUpdate, studyData: any): void {
    if (studyData.branding) {
        draft.branding = { ...(draft.branding || {}), ...studyData.branding };
    }
    if (studyData.presort_config) {
        draft.presort_config = {
            ...(draft.presort_config || {}),
            ...studyData.presort_config,
        };
    }
    if (studyData.postsort_config) {
        draft.postsort_config = {
            ...(draft.postsort_config || {}),
            ...studyData.postsort_config,
        };
    }
}

// biome-ignore lint/suspicious/noExplicitAny: imported config has dynamic shape
function applyImportedTranslations(draft: StudyUpdate, studyData: any): void {
    if (!Array.isArray(studyData.translations)) return;
    if (!draft.translations) draft.translations = [];
    for (const tIn of studyData.translations) {
        const existingIdx = draft.translations.findIndex(
            (tr) => tr.language_code === tIn.language_code
        );
        if (existingIdx !== -1) {
            draft.translations[existingIdx] = {
                ...draft.translations[existingIdx],
                ...tIn,
            };
        } else {
            draft.translations.push(tIn);
        }
    }
}
