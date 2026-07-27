/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { describe, expect, it } from 'vitest';
import { renderWithProviders, screen } from '@/test-utils/test-utils';
import i18n from '@/test-utils/i18n-test';
import frParticipant from '../../../public/locales/fr/participant.json';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

// dialog.tsx is shared UI: every admin dialog and the participant-facing
// HelpOverlay render through DialogContent's close button. Its accessible
// name used to be a hardcoded English literal (`<span
// className="sr-only">Close</span>`), which a screen reader would announce
// in English even on a fully translated interface. It now routes through
// the already-registered `common.close` key (participant namespace,
// default namespace, so it resolves identically regardless of which
// surface renders the dialog).
describe('DialogContent close button', () => {
    it('exposes a computed accessible name of "Close", not just an aria attribute', () => {
        renderWithProviders(
            <Dialog open>
                <DialogContent>
                    <DialogTitle>Test dialog</DialogTitle>
                </DialogContent>
            </Dialog>
        );

        expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
    });

    // The English assertion above can't tell a real t() call apart from a
    // literal that happens to read "Close" in English — the canonical
    // fallback text is identical either way. Switching the active language
    // and asserting the real fr/participant.json translation is the only
    // check that actually fails against a reverted, hardcoded literal.
    it("resolves to the researcher/participant's active language, not just English", async () => {
        i18n.addResourceBundle('fr', 'participant', frParticipant, true, true);
        await i18n.changeLanguage('fr');
        try {
            renderWithProviders(
                <Dialog open>
                    <DialogContent>
                        <DialogTitle>Dialogue de test</DialogTitle>
                    </DialogContent>
                </Dialog>
            );

            expect(screen.getByRole('button', { name: 'Fermer' })).toBeInTheDocument();
        } finally {
            await i18n.changeLanguage('en');
        }
    });
});
