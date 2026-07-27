import { screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import userEvent from '@testing-library/user-event';
import { renderWithStore } from '@/test-utils/renderWithStore';
import BrandingEditor from './BrandingEditor';

describe('BrandingEditor — partner name accessible name (Task 6.7b)', () => {
    // biome-ignore lint/suspicious/noExplicitAny: convenient partial mock
    const mockDraft: any = {
        slug: 'test-study',
        state: 'draft',
        branding: {
            logo_url: null,
            accent_color: null,
            partners: [{ id: 'partner-1', name: 'Acme University', logo_url: null }],
        },
    };

    const renderEditor = () =>
        renderWithStore(<BrandingEditor />, {
            initialState: { draft: mockDraft, activeLocale: 'en' },
        });

    it('names the partner name field and lets its label focus it', async () => {
        const user = userEvent.setup();
        renderEditor();

        const field = screen.getByRole('textbox', { name: /institution name/i });
        await user.click(screen.getByText('Institution name'));
        expect(field).toHaveFocus();
    });
});
