/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { renderWithProviders, screen } from '@/test-utils/test-utils';
import { describe, expect, it } from 'vitest';

import { Footer } from './Footer';

const REPO_URL = 'https://github.com/jvastenaekels/qualis';
const LICENSE_URL = 'https://github.com/jvastenaekels/qualis/blob/main/LICENSE.txt';

describe('Footer', () => {
    it('renders the "Powered by Qualis" attribution link to the repo', () => {
        renderWithProviders(<Footer />);
        const link = screen.getByRole('link', { name: /Powered by Qualis/i });
        expect(link).toHaveAttribute('href', REPO_URL);
        expect(link).toHaveAttribute('target', '_blank');
        expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });

    it('renders the AGPLv3 link to the LICENSE file, visible on all screen sizes', () => {
        renderWithProviders(<Footer />);
        const link = screen.getByRole('link', { name: 'AGPLv3' });
        expect(link).toHaveAttribute('href', LICENSE_URL);
        expect(link).toHaveAttribute('target', '_blank');
        expect(link).toHaveAttribute('rel', 'noopener noreferrer');
        // Mobile must keep the LICENSE link reachable — no `hidden` class.
        expect(link.className).not.toContain('hidden');
    });

    it('renders the mini Qualis logo as a decorative image', () => {
        renderWithProviders(<Footer />);
        const img = screen.getByAltText('');
        expect(img).toHaveAttribute('src', '/qualis-logo.svg');
    });

    it('does NOT render a separate GitHub icon link', () => {
        renderWithProviders(<Footer />);
        // Only two links remain: the Powered-by attribution and the LICENSE link.
        // The previous redundant GitHub icon link has been removed.
        const links = screen.getAllByRole('link');
        expect(links).toHaveLength(2);
        // No link is labelled "View source on GitHub" anymore.
        expect(screen.queryByRole('link', { name: /GitHub/i })).toBeNull();
    });
});
