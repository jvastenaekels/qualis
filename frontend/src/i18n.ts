/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import i18n from 'i18next';
import HttpBackend from 'i18next-http-backend';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';

export const SUPPORTED_I18N_LANGUAGES = ['en', 'fr', 'fi', 'de'];

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
        fallbackLng: 'en',
        supportedLngs: SUPPORTED_I18N_LANGUAGES, // Allow list
        debug: false,

        interpolation: {
            escapeValue: false, // not needed for react as it escapes by default
        },

        backend: {
            loadPath: '/locales/{{lng}}/{{ns}}.json?v=20260401_v1',
        },

        detection: {
            order: ['querystring', 'navigator', 'htmlTag', 'path', 'subdomain'],
            lookupQuerystring: 'lang',
            caches: ['localStorage'],
        },
    });

export default i18n;
