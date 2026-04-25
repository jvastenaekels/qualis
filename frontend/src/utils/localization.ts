/*
 * Libre-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

/**
 * Localization Utilities
 */

/**
 * Extracts localized text from a record or string.
 * Fallback order: Requested language -> English -> First available language -> Fallback string.
 *
 * @param text - The localized text object or string
 * @param language - The desired language code
 * @param fallback - String to return if no translation is found
 * @returns The localized string
 */
export const getLocalizedText = (
    text: string | Record<string, string> | undefined | null,
    language: string,
    fallback: string = ''
): string => {
    if (!text) return fallback;
    if (typeof text === 'string') return text;

    // 1. Exact match
    if (text[language]) return text[language];

    // 2. English fallback
    if (text.en) return text.en;

    // 3. First available
    const firstLang = Object.keys(text)[0];
    if (firstLang !== undefined) return text[firstLang] ?? fallback;

    return fallback;
};
