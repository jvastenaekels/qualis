/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders, screen } from '@/test-utils/test-utils';
import i18n from '@/test-utils/i18n-test';
import frAdmin from '../../../public/locales/fr/admin.json';
import { Sidebar, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';

// Forced to true so the Sidebar's mobile branch (the Sheet carrying the
// sr-only title/description under test) renders deterministically. This
// doesn't affect the SidebarTrigger accessible-name assertion below, since
// the trigger renders identical content on mobile and desktop — only its
// click behavior (which state it toggles) differs.
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => true }));

// SidebarTrigger's sr-only text ("Toggle Sidebar") and the mobile sheet's
// sr-only title/description ("Sidebar" / "Displays the mobile sidebar.")
// were hardcoded English literals. AdminLayout renders SidebarTrigger on
// every admin page; the mobile sheet renders whenever the admin chrome is
// viewed below the md breakpoint.
describe('SidebarTrigger', () => {
    it('exposes a computed accessible name of "Toggle Sidebar"', () => {
        renderWithProviders(
            <SidebarProvider>
                <SidebarTrigger />
            </SidebarProvider>
        );

        expect(screen.getByRole('button', { name: 'Toggle Sidebar' })).toBeInTheDocument();
    });

    // The English name alone can't distinguish a real t() call from a
    // literal that happens to already read "Toggle Sidebar" in English.
    // Assert the real fr/admin.json translation.
    it("resolves to the researcher's active language, not just English", async () => {
        i18n.addResourceBundle('fr', 'admin', frAdmin, true, true);
        await i18n.changeLanguage('fr');
        try {
            renderWithProviders(
                <SidebarProvider>
                    <SidebarTrigger />
                </SidebarProvider>
            );

            expect(
                screen.getByRole('button', { name: 'Basculer la barre latérale' })
            ).toBeInTheDocument();
        } finally {
            await i18n.changeLanguage('en');
        }
    });
});

describe('Sidebar mobile sheet', () => {
    it('names the sheet "Sidebar" with a "Displays the mobile sidebar." description', async () => {
        const user = userEvent.setup();

        renderWithProviders(
            <SidebarProvider>
                <Sidebar>
                    <div>Sidebar content</div>
                </Sidebar>
                <SidebarTrigger />
            </SidebarProvider>
        );

        await user.click(screen.getByRole('button', { name: 'Toggle Sidebar' }));

        const dialog = await screen.findByRole('dialog', { name: 'Sidebar' });
        expect(dialog).toBeInTheDocument();
        expect(screen.getByText('Displays the mobile sidebar.')).toBeInTheDocument();
    });

    // The English text alone can't distinguish real t() calls from literals
    // that happen to already read "Sidebar" / "Displays the mobile
    // sidebar." in English. Assert the real fr/admin.json translations.
    it("resolves the title and description to the researcher's active language", async () => {
        i18n.addResourceBundle('fr', 'admin', frAdmin, true, true);
        await i18n.changeLanguage('fr');
        try {
            const user = userEvent.setup();
            renderWithProviders(
                <SidebarProvider>
                    <Sidebar>
                        <div>Contenu de la barre latérale</div>
                    </Sidebar>
                    <SidebarTrigger />
                </SidebarProvider>
            );

            await user.click(screen.getByRole('button', { name: 'Basculer la barre latérale' }));

            const dialog = await screen.findByRole('dialog', { name: 'Barre latérale' });
            expect(dialog).toBeInTheDocument();
            expect(screen.getByText('Affiche la barre latérale mobile.')).toBeInTheDocument();
        } finally {
            await i18n.changeLanguage('en');
        }
    });
});
