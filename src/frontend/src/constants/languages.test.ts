import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { SUPPORTED_I18N_LANGUAGES } from '../i18n';
import { SUPPORTED_LANGUAGES, getAdminLanguages } from './languages';

const thisDir = path.dirname(fileURLToPath(import.meta.url));
const localesDir = path.resolve(thisDir, '../../public/locales');

describe('SUPPORTED_LANGUAGES', () => {
    it('includes German as an available study language', () => {
        expect(SUPPORTED_LANGUAGES).toContainEqual({
            code: 'de',
            label: 'Deutsch',
            flag: '🇩🇪',
            hasAdmin: true,
        });
    });

    it('allows German in the i18next locale allowlist', () => {
        expect(SUPPORTED_I18N_LANGUAGES).toContain('de');
    });

    it('SUPPORTED_LANGUAGES and SUPPORTED_I18N_LANGUAGES are in sync', () => {
        // Both lists declare the same set of supported language codes.
        // A divergence would silently break a selector: a code in
        // SUPPORTED_LANGUAGES but missing from SUPPORTED_I18N_LANGUAGES gets
        // offered in the UI but rejected by i18next's `supportedLngs` and
        // falls back to English; the reverse means `?lang=xx` works but no
        // selector ever offers the language.
        const fromMeta = new Set(SUPPORTED_LANGUAGES.map((l) => l.code));
        const fromAllowlist = new Set(SUPPORTED_I18N_LANGUAGES);
        expect(fromMeta).toEqual(fromAllowlist);
    });

    it('participant.json exists on disk for every declared language', () => {
        const missing = SUPPORTED_LANGUAGES.filter(
            ({ code }) => !fs.existsSync(path.join(localesDir, code, 'participant.json'))
        ).map(({ code }) => code);
        expect(missing).toEqual([]);
    });

    it('hasAdmin flag matches admin.json presence on disk', () => {
        const mismatches: string[] = [];
        for (const lang of SUPPORTED_LANGUAGES) {
            const adminExists = fs.existsSync(path.join(localesDir, lang.code, 'admin.json'));
            if (lang.hasAdmin !== adminExists) {
                mismatches.push(
                    `${lang.code}: hasAdmin=${lang.hasAdmin} but admin.json ${
                        adminExists ? 'exists' : 'is missing'
                    }`
                );
            }
        }
        expect(mismatches).toEqual([]);
    });
});

describe('getAdminLanguages', () => {
    it('returns only languages with hasAdmin=true', () => {
        const result = getAdminLanguages();
        expect(result.length).toBeGreaterThan(0);
        for (const lang of result) {
            expect(lang.hasAdmin).toBe(true);
        }
    });

    it('preserves the order of SUPPORTED_LANGUAGES', () => {
        const adminCodes = getAdminLanguages().map((l) => l.code);
        const expectedOrder = SUPPORTED_LANGUAGES.filter((l) => l.hasAdmin).map((l) => l.code);
        expect(adminCodes).toEqual(expectedOrder);
    });
});
