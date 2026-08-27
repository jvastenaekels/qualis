/**
 * Pure copy helpers for QuestionBuilder's "copy translations from another
 * language" action. The question shapes (label/placeholder/options) accept
 * BOTH legacy single-string values and the new multilang Record<string, string>
 * shape, so each helper handles both. Tests pin the migration semantics.
 */

type MultilangField = string | Record<string, string>;
type QuestionOption = string | { label: Record<string, string>; value: string };

/**
 * Copy a value from `sourceLang` into `activeLocale`. The output is always
 * the multilang record shape (the migration direction is single-string →
 * record map). When the input is already a record, we preserve all other
 * languages and only overwrite `activeLocale`.
 */
export function copyMultilangField(
    field: MultilangField | undefined,
    sourceLang: string,
    activeLocale: string
): Record<string, string> {
    if (typeof field === 'object' && field !== null) {
        const sourceValue = field[sourceLang] ?? '';
        return { ...field, [activeLocale]: sourceValue };
    }
    const legacy = field ?? '';
    return { en: legacy, [activeLocale]: legacy };
}

/**
 * Copy the source-language label of each option into the active-locale
 * label. String options are migrated to the object shape (with both `en`
 * and the active locale set to the original string).
 */
export function copyOptions(
    options: QuestionOption[],
    sourceLang: string,
    activeLocale: string
): { label: Record<string, string>; value: string }[] {
    return options.map((opt) => {
        if (typeof opt === 'string') {
            return {
                label: { en: opt, [activeLocale]: opt },
                value: opt,
            };
        }
        const sourceLabel = opt.label[sourceLang] ?? '';
        return {
            ...opt,
            label: { ...opt.label, [activeLocale]: sourceLabel },
        };
    });
}
