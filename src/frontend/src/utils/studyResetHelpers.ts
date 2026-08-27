import { DEFAULT_STUDY_CONTENT } from '@/constants/studyDefaults';
import { toast } from 'sonner';
import type { TFunction } from 'i18next';

interface ResetOptions {
    confirmMessage?: string;
    successMessage?: string;
    requireConfirmation?: boolean;
}

/**
 * Apply the localized default for `field` to every translation on the draft.
 * Mutates `draft` in place. Falls back to EN defaults when a language is not
 * in DEFAULT_STUDY_CONTENT. Optionally transforms the default value.
 */
export function applyDefaultsToTranslations(
    // biome-ignore lint/suspicious/noExplicitAny: draft requires dynamic property access
    draft: any,
    field: string,
    // biome-ignore lint/suspicious/noExplicitAny: transform handles various value types
    transform?: (value: any) => any
): void {
    if (!draft.translations) return;

    for (const trans of draft.translations) {
        const lang = trans.language_code;
        const defaults = DEFAULT_STUDY_CONTENT[lang] || DEFAULT_STUDY_CONTENT.en;

        if (defaults && defaults[field] !== undefined) {
            const defaultValue = defaults[field];
            const valueToApply = transform ? transform(defaultValue) : defaultValue;
            trans[field] = JSON.parse(JSON.stringify(valueToApply));
        }
    }
}

export const createResetToDefaultHandler = (
    // biome-ignore lint/suspicious/noExplicitAny: draft requires dynamic property access
    updateDraft: (fn: (draft: any) => void) => void,
    t: TFunction,
    options: ResetOptions = {}
) => {
    // biome-ignore lint/suspicious/noExplicitAny: transform function needs to handle various value types
    return (field: string, transform?: (value: any) => any) => {
        const {
            confirmMessage,
            successMessage = t('common.reset_to_default_success'),
            requireConfirmation = options.requireConfirmation ?? false,
        } = options;

        const doReset = () => {
            updateDraft((d) => applyDefaultsToTranslations(d, field, transform));
            toast.success(successMessage);
        };

        if (requireConfirmation && confirmMessage) {
            if (window.confirm(confirmMessage)) {
                doReset();
            }
        } else {
            doReset();
        }
    };
};
