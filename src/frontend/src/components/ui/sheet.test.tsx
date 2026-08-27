/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { describe, expect, it } from 'vitest';
import { renderWithProviders, screen } from '@/test-utils/test-utils';
import i18n from '@/test-utils/i18n-test';
import frParticipant from '../../../public/locales/fr/participant.json';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';

// sheet.tsx's close button had the same hardcoded-English defect as
// dialog.tsx's ("Close" as a plain sr-only string). Both now reuse the same
// `common.close` key so the two share one source of truth instead of two
// copies that could drift.
describe('SheetContent close button', () => {
    it('exposes a computed accessible name of "Close", not just an aria attribute', () => {
        renderWithProviders(
            <Sheet open>
                <SheetContent>
                    <SheetTitle>Test sheet</SheetTitle>
                </SheetContent>
            </Sheet>
        );

        expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
    });

    // Same caveat as dialog.test.tsx: the English name alone can't
    // distinguish a real t() call from a literal that happens to read
    // "Close" in English. Assert the real fr/participant.json translation.
    it("resolves to the researcher/participant's active language, not just English", async () => {
        i18n.addResourceBundle('fr', 'participant', frParticipant, true, true);
        await i18n.changeLanguage('fr');
        try {
            renderWithProviders(
                <Sheet open>
                    <SheetContent>
                        <SheetTitle>Feuille de test</SheetTitle>
                    </SheetContent>
                </Sheet>
            );

            expect(screen.getByRole('button', { name: 'Fermer' })).toBeInTheDocument();
        } finally {
            await i18n.changeLanguage('en');
        }
    });
});
