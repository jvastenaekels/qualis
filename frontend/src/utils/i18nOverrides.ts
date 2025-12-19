/*
 * Open-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import i18n from '../i18n';
import en from '../locales/en.json';
import fr from '../locales/fr.json';
import fi from '../locales/fi.json';

/**
 * Applies study-specific overrides to the i18n resource bundle.
 * Labels should be provided as a flat record of dot-notated keys.
 */
export const applyStudyOverrides = (lang: string, labels?: Record<string, string>) => {
  if (!labels || Object.keys(labels).length === 0) return;

  // i18next expects a nested object if using dots, 
  // but addResourceBundle with deep: true and dot-notated keys 
  // can sometimes be tricky depending on the version/config.
  // We'll manually expand or just use the flat keys if i18next is configured for them.
  // Given our JSON structure is nested, it's safer to use the 'deep' merge.
  
  i18n.addResourceBundle(lang, 'translation', labels, true, true);
};

/**
 * Resets the i18n resource bundles to their original state 
 * to prevent label leakage between different studies.
 */
export const resetBaseLocales = () => {
  i18n.addResourceBundle('en', 'translation', en, true, true);
  i18n.addResourceBundle('fr', 'translation', fr, true, true);
  i18n.addResourceBundle('fi', 'translation', fi, true, true);
};
