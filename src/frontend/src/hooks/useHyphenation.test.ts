import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

// Bypass the global mock for this test file
vi.unmock('@/hooks/useHyphenation');

const { useHyphenation } = await import('./useHyphenation');

describe('useHyphenation', () => {
    it('returns a function', () => {
        const { result } = renderHook(() => useHyphenation());
        expect(typeof result.current).toBe('function');
    });

    it('returned function hyphenates text', () => {
        const { result } = renderHook(() => useHyphenation());
        const hyphenated = result.current('hyphenation');
        expect(hyphenated.replaceAll('\u00AD', '')).toBe('hyphenation');
    });

    it('returned function handles empty string', () => {
        const { result } = renderHook(() => useHyphenation());
        expect(result.current('')).toBe('');
    });
});
