/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { renderWithProviders, screen } from '@/test-utils/test-utils';
import { describe, expect, it } from 'vitest';

import { PublicPageLayout } from './PublicPageLayout';

describe('PublicPageLayout', () => {
    it('renders the children and the global Footer', () => {
        renderWithProviders(
            <PublicPageLayout>
                <div data-testid="page-content">Hello</div>
            </PublicPageLayout>
        );
        expect(screen.getByTestId('page-content')).toBeInTheDocument();
        // Footer signature: the "Powered by Qualis" attribution link to the repo.
        expect(screen.getByRole('link', { name: /Powered by Qualis/i })).toBeInTheDocument();
    });

    it('wraps page content in one main landmark without including the footer', () => {
        renderWithProviders(
            <PublicPageLayout>
                <div data-testid="page-content">Hello</div>
            </PublicPageLayout>
        );

        const main = screen.getByRole('main');
        const footerLink = screen.getByRole('link', { name: /Powered by Qualis/i });

        expect(screen.getAllByRole('main')).toHaveLength(1);
        expect(main).toContainElement(screen.getByTestId('page-content'));
        expect(main).not.toContainElement(footerLink);
    });
});
