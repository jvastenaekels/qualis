import type { StudyUpdate, StudyTranslationRead } from '../api/model';

/**
 * Projects a full study draft (StudyUpdate) into a localized configuration object
 * that the study components expect (mimics the behavior of the localized Study API).
 */
// biome-ignore lint/suspicious/noExplicitAny: complex study configuration types
export function localizeStudy(draft: StudyUpdate, lang: string): any {
    const translation = draft.translations?.find((t) => t.language_code === lang) as
        | StudyTranslationRead
        | undefined;

    // Use English or the first available translation as fallback for structural fields
    const fallbackTranslation =
        draft.translations?.find((t) => t.language_code === 'en') ||
        (draft.translations?.[0] as StudyTranslationRead | undefined);

    const t = translation || fallbackTranslation;

    return {
        ...draft,
        title: t?.title || draft.slug || 'No Title',
        subtitle: t?.subtitle,
        description: t?.description,
        objective: t?.objective,
        instructions: t?.instructions,
        consent: {
            title: t?.consent_title,
            description: t?.consent_description,
        },
        pre_instruction: t?.pre_instruction,
        condition_of_instruction: t?.condition_of_instruction,

        ui_labels: t?.ui_labels || {},
        process_steps: t?.process_steps || [],
        methodology_tips: t?.methodology_tips || [],
        step_help: t?.step_help || {},
        language: lang,

        statements: (draft.statements || []).map((s: any, index: number) => {
            const st =
                s.translations?.find((st: any) => st.language_code === lang) ||
                s.translations?.find((st: any) => st.language_code === 'en') ||
                s.translations?.[0];
            return {
                id: index + 1, // Stable numerical ID for study flow
                code: s.code,
                text: st?.text || '',
            };
        }),
    };
}
