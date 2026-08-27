import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import enParticipant from '../../public/locales/en/participant.json';
import enAdmin from '../../public/locales/en/admin.json';

const resources = {
    en: {
        participant: enParticipant,
        admin: enAdmin,
    },
};

// Check if already initialized (singleton protection)
if (!i18n.isInitialized) {
    i18n.use(initReactI18next).init({
        lng: 'en',
        fallbackLng: 'en',
        ns: ['participant', 'admin'],
        defaultNS: 'participant',
        fallbackNS: 'admin',
        debug: false,
        resources,
        interpolation: {
            escapeValue: false,
        },
        react: {
            useSuspense: false,
        },
    });
} else {
    // If already initialized, ensure resources are loaded
    i18n.addResourceBundle('en', 'participant', enParticipant, true, true);
    i18n.addResourceBundle('en', 'admin', enAdmin, true, true);
}

export default i18n;
