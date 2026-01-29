export interface Language {
    code: string;
    label: string;
    flag: string;
}

export const SUPPORTED_LANGUAGES: Language[] = [
    { code: 'en', label: 'English', flag: 'EN' },
    { code: 'fr', label: 'Français', flag: 'FR' },
    { code: 'fi', label: 'Suomi', flag: 'FI' },
];
