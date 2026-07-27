/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { describe, expect, it } from 'vitest';
import { renderWithProviders, screen } from '@/test-utils/test-utils';
import i18n from '@/test-utils/i18n-test';
import frAdmin from '../../../public/locales/fr/admin.json';
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
} from '@/components/ui/breadcrumb';

// The <nav> landmark's own aria-label ("breadcrumb") was a hardcoded English
// literal — every admin page renders this landmark (AdminLayout), so a
// screen reader on a translated interface always announced the region name
// in English regardless of the researcher's chosen language.
describe('Breadcrumb landmark', () => {
    it('exposes a computed accessible name of "breadcrumb" on the nav element', () => {
        renderWithProviders(
            <Breadcrumb>
                <BreadcrumbList>
                    <BreadcrumbItem>
                        <BreadcrumbLink href="/">Home</BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbItem>
                        <BreadcrumbPage>Current</BreadcrumbPage>
                    </BreadcrumbItem>
                </BreadcrumbList>
            </Breadcrumb>
        );

        expect(screen.getByRole('navigation', { name: 'breadcrumb' })).toBeInTheDocument();
    });

    it('lets an explicit aria-label override the translated default', () => {
        renderWithProviders(
            <Breadcrumb aria-label="custom label">
                <BreadcrumbList />
            </Breadcrumb>
        );

        expect(screen.getByRole('navigation', { name: 'custom label' })).toBeInTheDocument();
    });

    // The English name alone can't distinguish a real t() call from a
    // literal that happens to already read "breadcrumb" in English. Assert
    // the real fr/admin.json translation (this landmark is admin-only).
    it("resolves to the researcher's active language, not just English", async () => {
        i18n.addResourceBundle('fr', 'admin', frAdmin, true, true);
        await i18n.changeLanguage('fr');
        try {
            renderWithProviders(
                <Breadcrumb>
                    <BreadcrumbList />
                </Breadcrumb>
            );

            expect(screen.getByRole('navigation', { name: "fil d'Ariane" })).toBeInTheDocument();
        } finally {
            await i18n.changeLanguage('en');
        }
    });
});
