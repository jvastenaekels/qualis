import { describe, expect, it } from 'vitest';

import { SUPPORTED_I18N_LANGUAGES } from '../i18n';
import { SUPPORTED_LANGUAGES } from './languages';

describe('SUPPORTED_LANGUAGES', () => {
    it('includes German as an available study language', () => {
        expect(SUPPORTED_LANGUAGES).toContainEqual({
            code: 'de',
            label: 'Deutsch',
            flag: '🇩🇪',
        });
    });

    it('allows German in the i18next locale allowlist', () => {
        expect(SUPPORTED_I18N_LANGUAGES).toContain('de');
    });
});
