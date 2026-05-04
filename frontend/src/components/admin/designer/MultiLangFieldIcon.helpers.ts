import { SUPPORTED_LANGUAGES } from '@/constants/languages';

export interface OtherTranslationEntry {
    code: string;
    value: string;
    label: string;
    flag: string;
}

type TranslationsInput =
    | Record<string, string>
    | { language_code: string; value?: string; text?: string }[];

function getLangInfo(code: string): { label: string; flag: string } {
    const lang = SUPPORTED_LANGUAGES.find((l) => l.code === code);
    return {
        label: lang?.label || code,
        flag: lang?.flag || '🌐',
    };
}

/** Normalise the two supported input shapes into a uniform `[code, value][]`. */
function normaliseToEntries(input: TranslationsInput): [string, string][] {
    if (Array.isArray(input)) {
        return input.map((item) => [item.language_code, item.text ?? item.value ?? '']);
    }
    return Object.entries(input);
}

/**
 * Build the list of non-active-locale translations with non-empty values,
 * normalising the two possible input shapes (array of translation objects
 * or record map) to a uniform `OtherTranslationEntry[]`.
 */
export function buildOtherTranslations(
    translations: TranslationsInput,
    activeLocale: string
): OtherTranslationEntry[] {
    return normaliseToEntries(translations)
        .filter(([code, value]) => code !== activeLocale && !!value && value.trim() !== '')
        .map(([code, value]) => ({ code, value, ...getLangInfo(code) }));
}
