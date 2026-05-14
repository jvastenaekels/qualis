export interface Language {
    code: string;
    label: string;
    flag: string;
    /**
     * True when the locale ships an `admin.json` translation file. When false,
     * the language is only offered in participant-facing selectors (study
     * design, concourse, intro) and is hidden from the admin sidebar selector
     * so researchers don't pick a locale that renders mostly via the English
     * fallback chain.
     */
    hasAdmin: boolean;
}

export const SUPPORTED_LANGUAGES: Language[] = [
    { code: 'en', label: 'English', flag: '🇬🇧', hasAdmin: true },
    { code: 'fr', label: 'Français', flag: '🇫🇷', hasAdmin: true },
    { code: 'fi', label: 'Suomi', flag: '🇫🇮', hasAdmin: true },
    { code: 'de', label: 'Deutsch', flag: '🇩🇪', hasAdmin: true },
];

/**
 * Returns the subset of supported languages that ship a full admin translation.
 * Use for the admin chrome language switcher; participant-domain selectors
 * (study creation, concourse, intro editor) should consume `SUPPORTED_LANGUAGES`
 * directly since `participant.json` is mandatory for every declared language.
 */
export const getAdminLanguages = (): Language[] => SUPPORTED_LANGUAGES.filter((l) => l.hasAdmin);
