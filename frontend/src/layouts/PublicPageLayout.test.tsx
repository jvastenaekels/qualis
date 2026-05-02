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
        // Footer signature: the GitHub icon link with its aria-label
        expect(screen.getByRole('link', { name: /View source on GitHub/i })).toBeInTheDocument();
    });
});
