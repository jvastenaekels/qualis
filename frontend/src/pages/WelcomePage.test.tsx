/*
 * Open-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import WelcomePage from './WelcomePage';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { useStudyStore } from '../store/useStudyStore';

// Mocks
const mockSetConsent = vi.fn();
const mockSetToken = vi.fn();
const mockSetStep = vi.fn();
const mockConfig = {
    title: 'Test Study',
    description: 'Test Description',
    instructions: 'Test **Instructions**',
    statements: []
};

vi.mock('../store/useStudyStore', () => ({
    useStudyStore: vi.fn(() => ({
        session: { hasConsented: false, token: null, isSaving: false },
        setConsent: mockSetConsent,
        setToken: mockSetToken,
        setStep: mockSetStep,
        config: mockConfig,
        configLoading: false,
        configError: null
    }))
}));

vi.mock('../hooks/useStudyConfig', () => ({
    useStudyConfig: () => ({ isLoading: false, error: null })
}));

describe('WelcomePage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders study title and description', () => {
        render(
            <MemoryRouter>
                <WelcomePage />
            </MemoryRouter>
        );
        expect(screen.getByText('Test Study')).toBeInTheDocument();
        expect(screen.getByText('Test Description')).toBeInTheDocument();
    });

    it('renders instructions markdown', () => {
        render(
            <MemoryRouter>
                <WelcomePage />
            </MemoryRouter>
        );
        expect(screen.getByText(/Instructions/)).toBeInTheDocument();
        // Check for bold tag or just text content depending on markdown renderer
        const strong = document.querySelector('strong');
        expect(strong).toBeInTheDocument();
        expect(strong?.textContent).toBe('Instructions');
    });

    it('handles consent checkbox', async () => {
        render(
            <MemoryRouter>
                <WelcomePage />
            </MemoryRouter>
        );
        
        const checkbox = screen.getByLabelText(/welcome\.consent\.label/i); 
        const button = screen.getByRole('button', { name: /welcome\.start/i });

        expect(button).toBeDisabled();

        fireEvent.click(checkbox);
        await waitFor(() => {
            expect(button).not.toBeDisabled();
        });
    });

    it('submits consent and navigates', async () => {
         render(
            <MemoryRouter initialEntries={['/study/test/welcome']}>
                <Routes>
                    <Route path="/study/:slug/welcome" element={<WelcomePage />} />
                </Routes>
            </MemoryRouter>
        );

        const checkbox = screen.getByLabelText(/welcome\.consent\.label/i);
        fireEvent.click(checkbox);
        
        // Wait for validation - checkbox click should make form valid
        const form = document.querySelector('form');
        if (form) {
            fireEvent.submit(form);
        }

        await waitFor(() => {
            expect(mockSetConsent).toHaveBeenCalledWith(true);
            expect(mockSetStep).toHaveBeenCalledWith(2);
        });
    });

    it('persists consent when re-navigating', async () => {
        let externalConsent = false;
        vi.mocked(useStudyStore).mockImplementation(() => ({
            session: { hasConsented: externalConsent, isSaving: false },
            setConsent: (val: boolean) => { externalConsent = val; },
            setStep: vi.fn(),
            config: mockConfig
        }) as any);

        const { unmount } = render(
            <MemoryRouter>
                <WelcomePage />
            </MemoryRouter>
        );

        const checkbox = screen.getByLabelText(/welcome\.consent\.label/i);
        fireEvent.click(checkbox);
        
        await waitFor(() => expect(externalConsent).toBe(true));

        unmount();

        render(
            <MemoryRouter>
                <WelcomePage />
            </MemoryRouter>
        );

        expect(screen.getByLabelText(/welcome\.consent\.label/i)).toBeChecked();
    });
});
