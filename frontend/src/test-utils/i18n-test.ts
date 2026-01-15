import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import enTranslation from '../../public/locales/en/translation.json';

// Use singleton to ensure compatibility

const resources = {
    en: {
        translation: enTranslation,
    },
};

// Check if already initialized (singleton protection)
if (!i18n.isInitialized) {
    i18n.use(initReactI18next).init({
        lng: 'en',
        fallbackLng: 'en',
        ns: ['translation'],
        defaultNS: 'translation',
        debug: false,
        resources,
        interpolation: {
            escapeValue: false,
        },
        react: {
            useSuspense: false,
        },
        initImmediate: true, // Ensure synchronous initialization
    });
} else {
    // If already initialized, ensure resources are loaded
    i18n.addResourceBundle('en', 'translation', enTranslation, true, true);
}

export default i18n;
