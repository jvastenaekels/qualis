import { describe, it, expect } from 'vitest';
import { copyMultilangField, copyOptions } from './QuestionBuilder.helpers';

describe('copyMultilangField', () => {
    it('copies sourceLang value into activeLocale on a record input', () => {
        const out = copyMultilangField({ en: 'Hello', fr: 'Bonjour' }, 'fr', 'fi');
        expect(out).toEqual({ en: 'Hello', fr: 'Bonjour', fi: 'Bonjour' });
    });

    it('overwrites the existing activeLocale value when present', () => {
        const out = copyMultilangField({ en: 'Hello', fr: 'Bonjour', fi: 'OldFi' }, 'fr', 'fi');
        expect(out.fi).toBe('Bonjour');
    });

    it('uses empty string when sourceLang is absent in record', () => {
        const out = copyMultilangField({ en: 'Hello' }, 'fr', 'fi');
        expect(out).toEqual({ en: 'Hello', fi: '' });
    });

    it('migrates a legacy string to multilang record (en + activeLocale = legacy)', () => {
        const out = copyMultilangField('Hello', 'fr', 'fi');
        expect(out).toEqual({ en: 'Hello', fi: 'Hello' });
    });

    it('migrates undefined to empty multilang record', () => {
        const out = copyMultilangField(undefined, 'fr', 'fi');
        expect(out).toEqual({ en: '', fi: '' });
    });
});

describe('copyOptions', () => {
    it('migrates string options to the object shape', () => {
        const out = copyOptions(['Yes', 'No'], 'en', 'fr');
        expect(out).toEqual([
            { label: { en: 'Yes', fr: 'Yes' }, value: 'Yes' },
            { label: { en: 'No', fr: 'No' }, value: 'No' },
        ]);
    });

    it('copies sourceLang label into activeLocale on object options', () => {
        const out = copyOptions([{ label: { en: 'Yes', fr: 'Oui' }, value: 'y' }], 'fr', 'fi');
        expect(out[0]?.label).toEqual({ en: 'Yes', fr: 'Oui', fi: 'Oui' });
    });

    it('preserves the value field when object option', () => {
        const out = copyOptions([{ label: { en: 'Yes' }, value: 'y' }], 'en', 'fr');
        expect(out[0]?.value).toBe('y');
    });

    it('uses empty string when sourceLang label is missing', () => {
        const out = copyOptions([{ label: { en: 'Yes' }, value: 'y' }], 'fr', 'fi');
        expect(out[0]?.label.fi).toBe('');
    });

    it('mixes string and object options correctly', () => {
        const out = copyOptions(['One', { label: { en: 'Two' }, value: '2' }], 'en', 'fr');
        expect(out[0]).toEqual({ label: { en: 'One', fr: 'One' }, value: 'One' });
        expect(out[1]?.label).toEqual({ en: 'Two', fr: 'Two' });
    });
});
