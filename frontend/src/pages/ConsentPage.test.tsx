/*
 * Open-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useConfigStore } from '../store/useConfigStore';
import { useSessionStore } from '../store/useSessionStore';
import { renderWithProviders } from '../test-utils/test-utils';
import ConsentPage from './ConsentPage';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
    }),
    I18nextProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mocks
const mockConfig = {
    title: 'Test Study',
    slug: 'test-study',
    description: 'Test Description',
    instructions: 'Test Instructions',
    statements: [],
    consent: {
        title: 'Consent Title',
        description: 'Consent Description',
    },
    ui_labels: {
        'welcome.start': 'Start Study',
    },
};

// Mock useStudyConfig logic if strictly needed, but we mock the store directly
vi.mock('../hooks/useStudyConfig', () => ({
    useStudyConfig: () => ({ isLoading: false, error: null }),
}));

describe('ConsentPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Setup initial state
        useConfigStore
            .getState()
            .setConfig(mockConfig as unknown as import('../schemas/study').StudyConfig);
        useSessionStore.getState().resetSession();
    });

    it('renders consent title and description from config', () => {
        renderWithProviders(<ConsentPage />);
        expect(screen.getByText('consent.title')).toBeInTheDocument();
        // The mock config.consent.description is 'Consent Description'
        // But ReactMarkdown might render it.
        // Wait, does t() apply to config content? No.
        // But config.consent.description IS 'Consent Description'.
        expect(screen.getByText('Consent Description')).toBeInTheDocument();
        // The title "Consent Title" from config.consent.title is no longer used for the checkbox label
        // It might be used elsewhere if we change the H1, but currently H1 is hardcoded/localized.
        // So we expect the generic localized label instead:
        expect(screen.getByText('welcome.consent.label')).toBeInTheDocument();
    });

    it('validates consent checkbox', async () => {
        renderWithProviders(<ConsentPage />);

        const button = screen.getByRole('button', { name: /Start Study/i });

        // Button might be disabled or enabled depending on form state,
        // but let's try to submit without checking
        fireEvent.click(button);

        // Ideally checking the box enables the flow
        const checkbox = screen.getByRole('checkbox');
        expect(checkbox).not.toBeChecked();

        // If the button is disabled initially (isValid is false)
        expect(button).toBeDisabled();

        fireEvent.click(checkbox);

        await waitFor(() => {
            expect(button).not.toBeDisabled();
        });
    });

    it('submits consent and navigates to presort', async () => {
        // We can't easily mock useNavigate inside MemoryRouter without a wrapper or library approach,
        // but we can check if the route changed by rendering the target route.

        renderWithProviders(
            <Routes>
                <Route path="/study/:slug/consent" element={<ConsentPage />} />
                <Route path="/study/:slug/presort" element={<div>Presort Page</div>} />
            </Routes>,
            { initialEntries: ['/study/test-study/consent'] }
        );

        const checkbox = screen.getByRole('checkbox');
        fireEvent.click(checkbox);

        const button = screen.getByRole('button', { name: /Start Study/i });

        await waitFor(() => expect(button).not.toBeDisabled());

        fireEvent.click(button);

        await waitFor(() => {
            expect(useSessionStore.getState().hasConsented).toBe(true);
            expect(screen.getByText('Presort Page')).toBeInTheDocument();
        });
    });

    it('persists consent state', async () => {
        const { unmount } = renderWithProviders(<ConsentPage />);

        const checkbox = screen.getByRole('checkbox');
        fireEvent.click(checkbox);

        await waitFor(() => expect(useSessionStore.getState().hasConsented).toBe(true));

        unmount();

        renderWithProviders(<ConsentPage />);

        const newCheckbox = screen.getByRole('checkbox');
        expect(newCheckbox).toBeChecked();
    });

    it('falls back to UI defaults when config consent is missing', () => {
        // Clear config consent
        const configWithoutConsent = { ...mockConfig, consent: null };
        act(() => {
            useConfigStore
                .getState()
                .setConfig(
                    configWithoutConsent as unknown as import('../schemas/study').StudyConfig
                );
        });

        renderWithProviders(<ConsentPage />);

        // Should use defaults from i18n
        // Note: our mock i18n returns the default value if provided, or the key
        expect(screen.getByText('welcome.consent.label')).toBeInTheDocument();
        expect(screen.getByText('consent.default_text')).toBeInTheDocument(); // Key fallback from mock
    });

    it('navigates to rough-sort if presort is disabled', async () => {
        // Mock config with disabled presort
        const configDisabledPresort = {
            ...mockConfig,
            presort_config: { enabled: false, fields: {} },
        };

        act(() => {
            useConfigStore
                .getState()
                .setConfig(
                    configDisabledPresort as unknown as import('../schemas/study').StudyConfig
                );
            useSessionStore.getState().resetSession();
        });

        renderWithProviders(
            <Routes>
                <Route path="/study/:slug/consent" element={<ConsentPage />} />
                <Route path="/study/:slug/rough-sort" element={<div>Rough Sort Page</div>} />
            </Routes>,
            { initialEntries: ['/study/test-study/consent'] }
        );

        const checkbox = screen.getByRole('checkbox');
        fireEvent.click(checkbox);

        const button = screen.getByRole('button', { name: /Start Study/i });
        await waitFor(() => expect(button).not.toBeDisabled());
        fireEvent.click(button);

        await waitFor(() => {
            expect(useSessionStore.getState().hasConsented).toBe(true);
            expect(screen.getByText('Rough Sort Page')).toBeInTheDocument();
        });
    });
});
