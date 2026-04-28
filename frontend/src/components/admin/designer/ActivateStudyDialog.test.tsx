/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { ActivateStudyDialog } from './ActivateStudyDialog';
import type { ChecklistItem, LanguageReadiness } from '@/hooks/admin/useStudyDesignPage';

// Minimal i18n bootstrap so t() falls back to default values used in JSX.
i18n.use(initReactI18next).init({
    lng: 'en',
    resources: { en: { translation: {} } },
    interpolation: { escapeValue: false },
});

function renderDialog(
    overrides: Partial<{
        checklist: ChecklistItem[];
        languageReadiness: LanguageReadiness[];
        onConfirm: () => Promise<void> | void;
        isActivating: boolean;
    }> = {}
) {
    const onConfirm = overrides.onConfirm ?? vi.fn();
    const onOpenChange = vi.fn();
    const checklist: ChecklistItem[] = overrides.checklist ?? [
        { label: 'Study title', isComplete: true, required: true },
        { label: 'Consent form', isComplete: true, required: true },
        { label: 'Statements', isComplete: true, required: true },
        { label: 'Balanced grid', isComplete: true, required: true },
    ];
    const languageReadiness: LanguageReadiness[] = overrides.languageReadiness ?? [
        { code: 'en', isReady: true },
        { code: 'fr', isReady: true },
    ];
    render(
        <I18nextProvider i18n={i18n}>
            <ActivateStudyDialog
                open
                onOpenChange={onOpenChange}
                checklist={checklist}
                languageReadiness={languageReadiness}
                onConfirm={onConfirm}
                isActivating={overrides.isActivating ?? false}
            />
        </I18nextProvider>
    );
    return { onConfirm, onOpenChange };
}

describe('ActivateStudyDialog', () => {
    it('disables the Activate button until the attestation is checked', async () => {
        renderDialog();
        const confirm = screen.getByRole('button', { name: /Activate study/i });
        // Attestation unchecked → disabled.
        expect(confirm).toBeDisabled();

        const checkbox = screen.getByRole('checkbox');
        await userEvent.click(checkbox);
        // After ticking, button becomes enabled.
        expect(confirm).not.toBeDisabled();
    });

    it('keeps the Activate button disabled when a required checklist item is incomplete', async () => {
        renderDialog({
            checklist: [
                { label: 'Study title', isComplete: true, required: true },
                { label: 'Consent form', isComplete: false, required: true },
                { label: 'Statements', isComplete: true, required: true },
                { label: 'Balanced grid', isComplete: true, required: true },
            ],
        });
        const confirm = screen.getByRole('button', { name: /Activate study/i });
        const checkbox = screen.getByRole('checkbox');
        await userEvent.click(checkbox);
        // Even with attestation ticked, an incomplete required item blocks activation.
        expect(confirm).toBeDisabled();
    });

    it('keeps the Activate button disabled when any language is not ready', async () => {
        renderDialog({
            languageReadiness: [
                { code: 'en', isReady: true },
                { code: 'fr', isReady: false },
            ],
        });
        const confirm = screen.getByRole('button', { name: /Activate study/i });
        const checkbox = screen.getByRole('checkbox');
        await userEvent.click(checkbox);
        expect(confirm).toBeDisabled();
    });

    it('calls onConfirm exactly once when the Activate button is clicked', async () => {
        const onConfirm = vi.fn();
        renderDialog({ onConfirm });
        await userEvent.click(screen.getByRole('checkbox'));
        await userEvent.click(screen.getByRole('button', { name: /Activate study/i }));
        expect(onConfirm).toHaveBeenCalledTimes(1);
    });

    it('shows a loading spinner and is disabled while activation is in flight', () => {
        renderDialog({ isActivating: true });
        const confirm = screen.getByRole('button', { name: /Activate study/i });
        expect(confirm).toBeDisabled();
    });
});
