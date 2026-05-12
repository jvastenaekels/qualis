import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SafeMarkdown } from './SafeMarkdown';

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
