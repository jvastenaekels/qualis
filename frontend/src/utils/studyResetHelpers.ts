import { DEFAULT_STUDY_CONTENT } from '@/constants/studyDefaults';
import { toast } from 'sonner';
import type { TFunction } from 'i18next';

interface ResetOptions {
    confirmMessage?: string;
    successMessage?: string;
    requireConfirmation?: boolean;
}

/**
 * Creates a reusable handler for resetting study fields to their default localized values.
 *
 * @param updateDraft - The updateDraft function from the study designer store
 * @param t - The translation function
 * @param options - Configuration for confirmations and notifications
 * @returns A function that takes a field name and an optional transform function
 */
export const createResetToDefaultHandler = (
    updateDraft: (fn: (draft: any) => void) => void,
    t: TFunction,
    options: ResetOptions = {}
) => {
    return (field: string, transform?: (value: any) => any) => {
        const {
            confirmMessage,
            successMessage = t('common.reset_to_default_success'),
            requireConfirmation = options.requireConfirmation ?? false,
        } = options;

        const doReset = () => {
            updateDraft((d) => {
                if (!d.translations) return;

                for (const trans of d.translations) {
                    const lang = trans.language_code;
                    const defaults = DEFAULT_STUDY_CONTENT[lang] || DEFAULT_STUDY_CONTENT.en;

                    if (defaults && defaults[field] !== undefined) {
                        const defaultValue = defaults[field];
                        const valueToApply = transform ? transform(defaultValue) : defaultValue;

                        // biome-ignore lint/suspicious/noExplicitAny: dynamic field access
                        (trans as any)[field] = JSON.parse(JSON.stringify(valueToApply));
                    }
                }
            });
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
