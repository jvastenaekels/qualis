import { hyphenateSync as hyphenateEn } from 'hyphen/en-us';
import { hyphenateSync as hyphenateDe } from 'hyphen/de';
import { hyphenateSync as hyphenateFi } from 'hyphen/fi';
import { hyphenateSync as hyphenateFr } from 'hyphen/fr';

const hyphenators: Record<string, (text: string) => string> = {
    en: hyphenateEn,
    fr: hyphenateFr,
    fi: hyphenateFi,
    de: hyphenateDe,
};

const cache = new Map<string, string>();

/**
 * Hyphenate text by inserting soft hyphens (\u00AD) at valid break points.
 * Uses language-specific patterns for en, fr, and fi.
 * Falls back to returning text unchanged for unsupported languages.
 */
export function hyphenate(text: string, lang: string): string {
    if (!text) return text;

    const normalizedLang = (lang.split('-')[0] ?? lang).toLowerCase();
    const hyphenator = hyphenators[normalizedLang];
    if (!hyphenator) return text;

    const cacheKey = `${normalizedLang}:${text}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    const result = hyphenator(text);
    cache.set(cacheKey, result);
    return result;
}
