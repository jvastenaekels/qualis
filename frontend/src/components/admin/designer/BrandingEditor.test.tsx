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

describe('BrandingEditor — control names (Task 6.7c)', () => {
    // biome-ignore lint/suspicious/noExplicitAny: convenient partial mock
    const mockDraft: any = {
        slug: 'test-study',
        state: 'draft',
        branding: {
            logo_url: 'https://example.com/logo.png',
            accent_color: '#4f46e5',
            partners: [
                { id: 'partner-1', name: 'Acme University', logo_url: null },
                { id: 'partner-2', name: '', logo_url: null },
            ],
        },
    };

    const renderEditor = () =>
        renderWithStore(<BrandingEditor />, {
            initialState: { draft: mockDraft, activeLocale: 'en' },
        });

    it('names the accent-color info tooltip trigger and swatch buttons', () => {
        renderEditor();

        expect(screen.getByRole('button', { name: 'About accent color' })).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Set accent color to #4f46e5' })
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Set accent color to #dc2626' })
        ).toBeInTheDocument();
    });

    it('names the logo info tooltip trigger and the remove-logo control', () => {
        renderEditor();

        expect(screen.getByRole('button', { name: 'About the study logo' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Remove logo' })).toBeInTheDocument();
    });

    it('names the partners info tooltip trigger and discriminates per-row controls by name', () => {
        renderEditor();

        expect(
            screen.getByRole('button', { name: 'About institutional partners' })
        ).toBeInTheDocument();

        // Named partner: discriminated by its own name.
        expect(screen.getByRole('button', { name: 'Remove Acme University' })).toBeInTheDocument();

        // Unnamed partner (empty name): falls back to an ordinal, not a blank/duplicate name.
        expect(screen.getByRole('button', { name: 'Remove Partner 2' })).toBeInTheDocument();
    });
});

describe('BrandingEditor — remove-partner button contrast (Task 6.7d)', () => {
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

    it('renders the remove-partner icon at a legible contrast and keeps it operable', async () => {
        const user = userEvent.setup();
        renderWithStore(<BrandingEditor />, {
            initialState: { draft: mockDraft, activeLocale: 'en' },
        });

        const removeButton = screen.getByRole('button', { name: 'Remove Acme University' });
        expect(removeButton).toHaveClass('text-slate-500');
        expect(removeButton).not.toHaveClass('text-slate-300');

        await user.click(removeButton);
        // Operable end to end: the partner row is gone from the DOM.
        expect(
            screen.queryByRole('button', { name: 'Remove Acme University' })
        ).not.toBeInTheDocument();
    });
});
