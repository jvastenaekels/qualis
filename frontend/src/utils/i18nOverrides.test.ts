/*
 * Open-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import i18n from '../i18n';
import type { StudyConfig } from '../schemas/study';
import { applyStudyOverrides, resetBaseLocales } from './i18nOverrides';

describe('i18nOverrides utility', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Setup spies on i18n methods
        vi.spyOn(i18n, 'addResourceBundle');
        vi.spyOn(i18n, 'removeResourceBundle');
        vi.spyOn(i18n, 'reloadResources');
    });

    it('should apply study overrides from config successfully', () => {
        const config = {
            ui_labels: { 'common.next': 'Localized Next' },
        } as unknown as StudyConfig;

        applyStudyOverrides('en', config.ui_labels);

        expect(i18n.addResourceBundle).toHaveBeenCalledWith(
            'en',
            'translation',
            config.ui_labels,
            true,
            true
        );
    });

    it('should apply study overrides successfully', () => {
        const labels = {
            'common.agree': 'Approuve',
            'common.disagree': 'Désapprouve',
        };

        applyStudyOverrides('fr', labels);

        expect(i18n.addResourceBundle).toHaveBeenCalledWith(
            'fr',
            'translation',
            labels,
            true,
            true
        );
    });

    it('should do nothing if labels are empty', () => {
        applyStudyOverrides('en', {});
        applyStudyOverrides('en', undefined);

        expect(i18n.addResourceBundle).not.toHaveBeenCalled();
    });

    it('should reset base locales to original state', () => {
        resetBaseLocales();

        const langs = ['en', 'fr', 'fi'];

        // Check for each supported language
        for (const lang of langs) {
            expect(i18n.removeResourceBundle).toHaveBeenCalledWith(lang, 'translation');
        }

        expect(i18n.reloadResources).toHaveBeenCalledWith(langs, ['translation']);
    });
});
