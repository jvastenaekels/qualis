import { describe, it, expect } from 'vitest';
import { buildOtherTranslations } from './MultiLangFieldIcon.helpers';

describe('buildOtherTranslations', () => {
    describe('record-map input', () => {
        it('returns empty when only the active locale has a value', () => {
            expect(buildOtherTranslations({ en: 'Hello' }, 'en')).toEqual([]);
        });

        it('skips the active locale and returns other languages', () => {
            const r = buildOtherTranslations({ en: 'Hello', fr: 'Bonjour', fi: 'Hei' }, 'en');
            expect(r).toHaveLength(2);
            expect(r.map((e) => e.code).sort()).toEqual(['fi', 'fr']);
            expect(r.find((e) => e.code === 'fr')?.value).toBe('Bonjour');
        });

        it('skips empty and whitespace-only values', () => {
            const r = buildOtherTranslations({ en: 'Hello', fr: '', fi: '   ' }, 'en');
            expect(r).toEqual([]);
        });

        it('falls back to fallback flag/label for unknown language codes', () => {
            const r = buildOtherTranslations({ en: 'Hello', xx: 'Foo' }, 'en');
            expect(r).toHaveLength(1);
            expect(r[0]?.flag).toBe('🌐');
            expect(r[0]?.label).toBe('xx');
        });
    });

    describe('array input', () => {
        it('reads `text` field then `value` field', () => {
            const r = buildOtherTranslations(
                [
                    { language_code: 'en', text: 'Hello' },
                    { language_code: 'fr', value: 'Bonjour' },
                ],
                'en'
            );
            expect(r).toHaveLength(1);
            expect(r[0]?.code).toBe('fr');
            expect(r[0]?.value).toBe('Bonjour');
        });

        it('skips the active locale', () => {
            const r = buildOtherTranslations(
                [
                    { language_code: 'en', text: 'Hello' },
                    { language_code: 'fr', text: 'Bonjour' },
                ],
                'fr'
            );
            expect(r).toHaveLength(1);
            expect(r[0]?.code).toBe('en');
        });

        it('skips entries with no text/value or whitespace', () => {
            const r = buildOtherTranslations(
                [
                    { language_code: 'en', text: 'Hello' },
                    { language_code: 'fr' },
                    { language_code: 'fi', text: '   ' },
                ],
                'en'
            );
            expect(r).toEqual([]);
        });
    });
});
