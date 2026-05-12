export interface Language {
    code: string;
    label: string;
    flag: string;
}

export const SUPPORTED_LANGUAGES: Language[] = [
    { code: 'en', label: 'English', flag: '🇬🇧' },
    { code: 'fr', label: 'Français', flag: '🇫🇷' },
    { code: 'fi', label: 'Suomi', flag: '🇫🇮' },
    { code: 'de', label: 'Deutsch', flag: '🇩🇪' },
];
