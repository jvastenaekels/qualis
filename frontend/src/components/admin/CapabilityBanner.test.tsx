import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithStore } from '@/test-utils/renderWithStore';
import { CapabilityBanner } from './CapabilityBanner';

describe('CapabilityBanner', () => {
    it('renders the message and a new-tab guide link with the given href', () => {
        renderWithStore(
            <CapabilityBanner
                message="Email delivery is not configured."
                guideHref="/docs/guides/running-without-smtp.md"
                guideLabel="View guide"
            />
        );
        const row = screen.getByRole('status');
        expect(row).toHaveTextContent('Email delivery is not configured.');
        const link = screen.getByRole('link', { name: 'View guide' });
        expect(link).toHaveAttribute('href', '/docs/guides/running-without-smtp.md');
        expect(link).toHaveAttribute('target', '_blank');
        expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });
});
