import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SafeMarkdown } from './SafeMarkdown';

/**
 * `setupTests.ts` neutralises `useHyphenation` globally so soft hyphens do not
 * break text assertions everywhere else. A file-level `vi.mock` wins over it,
 * and a sentinel is a better probe than the real dictionary: what is under test
 * is *whether the hook is applied*, not how well it hyphenates German.
 */
const SOFT_HYPHEN = '­';
vi.mock('@/hooks/useHyphenation', () => ({
    useHyphenation: () => (text: string) => text.split(' ').join(`${SOFT_HYPHEN} `),
}));

describe('SafeMarkdown responsive text handling', () => {
    it('applies wrapping utilities for long URLs and unbroken strings', () => {
        render(
            <SafeMarkdown>
                {'https://example.test/a/very/very/very/long/path/that/should/wrap'}
            </SafeMarkdown>
        );

        const wrapper = screen.getByText(/example\.test/).closest('.prose');

        expect(wrapper?.className).toContain('break-words');
        expect(wrapper?.className).toContain('[overflow-wrap:anywhere]');
    });
});

describe('SafeMarkdown hyphenation', () => {
    /**
     * Eleven of the fourteen call sites are prose — welcome, consent, the
     * post-sort, the fine-sort instruction banner, the admin editors. Only the
     * two statement cards are narrow enough to need mid-word breaks, so the
     * flag is opt-in: a call site added later gets the safe default rather
     * than `compare dif-/ferent` on a 500 px column.
     */
    it('does not hyphenate prose by default', () => {
        const { container } = render(<SafeMarkdown>{'environmental sustainability'}</SafeMarkdown>);
        expect(container.textContent).not.toContain(SOFT_HYPHEN);
    });

    it('hyphenates when the caller asks — the narrow-card case', () => {
        const { container } = render(
            <SafeMarkdown hyphenate>{'environmental sustainability'}</SafeMarkdown>
        );
        expect(container.textContent).toContain(SOFT_HYPHEN);
    });
});
