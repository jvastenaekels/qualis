/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import i18n from 'i18next';
import HttpBackend from 'i18next-http-backend';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';

export const SUPPORTED_I18N_LANGUAGES = ['en', 'fr', 'fi', 'de', 'es', 'it', 'nl', 'pt', 'pl'];

i18n
    // load translation using http -> see /public/locales
    // (tip: move them in a JSON file and import them, or even better, load them from a backend)
    .use(HttpBackend)
    // detect user language
    .use(LanguageDetector)
    // pass the i18n instance to react-i18next.
    .use(initReactI18next)
    // init i18next
    // for all options read: https://www.i18next.com/overview/configuration-options
    .init({
        // Namespaces: 'participant' carries the participant flow + public chrome
        // (common, layout, footer, errors, landing, welcome, consent, presort,
        // rough, fine, post, audio, resume, erasure, study); 'admin' carries
        // researcher-facing copy (admin.*, auth.*).
        //
        // Resolution: t('common.next') resolves in defaultNS 'participant'.
        // t('admin.dashboard.title') misses in 'participant' and falls back to
        // 'admin' via fallbackNS. The admin.json file keeps the 'admin.' and
        // 'auth.' top-level prefixes inside it, so the full path resolves
        // without renaming any of the 1320 t(...) call sites in the codebase.
        ns: ['participant', 'admin'],
        defaultNS: 'participant',
        fallbackNS: 'admin',
        fallbackLng: 'en',
        supportedLngs: SUPPORTED_I18N_LANGUAGES, // Allow list
        debug: false,

        interpolation: {
            escapeValue: false, // not needed for react as it escapes by default
        },

        backend: {
            loadPath: '/locales/{{lng}}/{{ns}}.json?v=20260514_v1',
        },

        detection: {
            // `localStorage` must be read (not just written) so an explicit
            // admin language choice survives a reload; without it the detector
            // fell back to `navigator` every boot and the picker looked broken.
            order: ['querystring', 'localStorage', 'navigator', 'htmlTag', 'path', 'subdomain'],
            lookupQuerystring: 'lang',
            caches: ['localStorage'],
        },
    });

// Keep <html lang> in step with the active language for accessibility and
// correct hyphenation; the detector only reads the tag, it never updates it.
const syncHtmlLang = (lng: string): void => {
    if (typeof document !== 'undefined') {
        document.documentElement.lang = lng;
    }
};
syncHtmlLang(i18n.language);
i18n.on('languageChanged', syncHtmlLang);

export default i18n;
