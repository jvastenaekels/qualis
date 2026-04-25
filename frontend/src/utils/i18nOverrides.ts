/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import i18n from '../i18n';

/**
 * Applies study-specific overrides to the i18n resource bundle.
 * Labels should be provided as a flat record of dot-notated keys.
 */
export const applyStudyOverrides = (lang: string, labels?: Record<string, string>) => {
    if (!labels || Object.keys(labels).length === 0) return;

    // i18next handles dot-notated keys automatically when using addResourceBundle
    // with deep: true and the key-value pair.
    i18n.addResourceBundle(lang, 'translation', labels, true, true);
};

/**
 * Resets the i18n resource bundles to their original state
 * to prevent label leakage between different studies.
 * It reloads the base translations from the server/public folder.
 */
export const resetBaseLocales = () => {
    const langs = ['en', 'fr', 'fi'];
    for (const lang of langs) {
        i18n.removeResourceBundle(lang, 'translation');
    }
    // Reload will trigger fetching the original JSONs via HttpBackend
    i18n.reloadResources(langs, ['translation']);
};
