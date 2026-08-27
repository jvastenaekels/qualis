import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { hyphenate } from '@/utils/hyphenation';

/**
 * Returns a function that inserts soft hyphens into text
 * based on the current i18n language.
 */
export function useHyphenation(): (text: string) => string {
    const { i18n } = useTranslation();
    const lang = i18n.language;

    return useCallback((text: string) => hyphenate(text, lang), [lang]);
}
