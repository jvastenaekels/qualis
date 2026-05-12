import { describe, expect, it } from 'vitest';

// Bypass the global mock for this test file — we want the real implementation
vi.unmock('@/hooks/useHyphenation');

// Import the real hyphenation utility
const { hyphenate } = await import('./hyphenation');

const SOFT_HYPHEN = '\u00AD';

describe('hyphenation utility', () => {
    it('inserts soft hyphens in English text', () => {
        const result = hyphenate('hyphenation', 'en');
        expect(result).toContain(SOFT_HYPHEN);
        // Removing soft hyphens should give back the original word
        expect(result.replaceAll(SOFT_HYPHEN, '')).toBe('hyphenation');
    });

    it('inserts soft hyphens in Finnish text', () => {
        const result = hyphenate('opiskelija', 'fi');
        expect(result).toContain(SOFT_HYPHEN);
        expect(result.replaceAll(SOFT_HYPHEN, '')).toBe('opiskelija');
    });

    it('inserts soft hyphens in French text', () => {
        const result = hyphenate('environnement', 'fr');
        expect(result).toContain(SOFT_HYPHEN);
        expect(result.replaceAll(SOFT_HYPHEN, '')).toBe('environnement');
    });

    it('inserts soft hyphens in German text', () => {
        const result = hyphenate('Datenschutzgrundverordnung', 'de');
        expect(result).toContain(SOFT_HYPHEN);
        expect(result.replaceAll(SOFT_HYPHEN, '')).toBe('Datenschutzgrundverordnung');
    });

    it('normalizes lang codes (en-US → en)', () => {
        const result = hyphenate('hyphenation', 'en-US');
        expect(result).toContain(SOFT_HYPHEN);
    });

    it('returns text unchanged for unsupported languages', () => {
        expect(hyphenate('some text', 'zh')).toBe('some text');
    });

    it('returns empty string unchanged', () => {
        expect(hyphenate('', 'en')).toBe('');
    });

    it('caches results for repeated calls', () => {
        const first = hyphenate('performance', 'en');
        const second = hyphenate('performance', 'en');
        expect(first).toBe(second);
    });

    it('does not break short words', () => {
        const result = hyphenate('cat', 'en');
        expect(result).toBe('cat');
    });

    it('handles multi-word text', () => {
        const result = hyphenate('environmental sustainability', 'en');
        expect(result.replaceAll(SOFT_HYPHEN, '')).toBe('environmental sustainability');
    });
});
