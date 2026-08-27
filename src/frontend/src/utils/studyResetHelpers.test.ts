import { describe, it, expect, vi } from 'vitest';
import { applyDefaultsToTranslations } from './studyResetHelpers';

vi.mock('@/constants/studyDefaults', () => ({
    DEFAULT_STUDY_CONTENT: {
        en: { instructions: 'Default EN instructions', title: 'Default EN title' },
        fr: { instructions: 'Default FR instructions', title: 'Default FR title' },
    },
}));

describe('applyDefaultsToTranslations', () => {
    it('returns early when draft has no translations', () => {
        const draft: { translations?: unknown } = {};
        applyDefaultsToTranslations(draft, 'instructions');
        expect(draft).toEqual({});
    });

    it('applies the EN default to a single EN translation', () => {
        const draft = { translations: [{ language_code: 'en', instructions: 'old' }] };
        applyDefaultsToTranslations(draft, 'instructions');
        expect(draft.translations[0].instructions).toBe('Default EN instructions');
    });

    it('falls back to EN default when language is not in DEFAULT_STUDY_CONTENT', () => {
        const draft = { translations: [{ language_code: 'fi', instructions: 'old' }] };
        applyDefaultsToTranslations(draft, 'instructions');
        expect(draft.translations[0].instructions).toBe('Default EN instructions');
    });

    it('applies per-language defaults independently', () => {
        const draft = {
            translations: [
                { language_code: 'en', title: 'old' },
                { language_code: 'fr', title: 'old' },
            ],
        };
        applyDefaultsToTranslations(draft, 'title');
        expect(draft.translations[0].title).toBe('Default EN title');
        expect(draft.translations[1].title).toBe('Default FR title');
    });

    it('applies the transform when provided', () => {
        const draft = { translations: [{ language_code: 'en', title: 'old' }] };
        applyDefaultsToTranslations(draft, 'title', (v: string) => `[${v}]`);
        expect(draft.translations[0].title).toBe('[Default EN title]');
    });

    it('skips a field absent from defaults', () => {
        const draft = { translations: [{ language_code: 'en', missing: 'kept' }] };
        applyDefaultsToTranslations(draft, 'missing');
        expect(draft.translations[0].missing).toBe('kept');
    });
});
