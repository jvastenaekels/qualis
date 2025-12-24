/*
 * Open-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import WelcomePage from './WelcomePage';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { useConfigStore } from '../store/useConfigStore';
import type { StudyConfig } from '../schemas/study';
import { useSessionStore } from '../store/useSessionStore';
import { useResponseStore } from '../store/useResponseStore';

// Mocks
const mockConfig = {
    title: 'Test Study',
    subtitle: 'Test Subtitle',
    slug: 'test-study',
    description: 'Test Description',
    objective: 'Test Objective',
    instructions: 'Test **Content**',
    statements: [],
    consent: {
        title: null,
        description: null
    }
};

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string, defaultValue: string) => defaultValue || key }),
}));

vi.mock('../hooks/useStudyConfig', () => ({
    useStudyConfig: () => ({ isLoading: false, error: null })
}));

describe('WelcomePage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Setup initial state
        useConfigStore.getState().setConfig(mockConfig as unknown as StudyConfig);
        useSessionStore.getState().resetSession();
    });

    it('renders study details (title, subtitle, description, objective)', () => {
        render(
            <MemoryRouter>
                <WelcomePage />
            </MemoryRouter>
        );
        expect(screen.getByText('Test Study')).toBeInTheDocument();
        expect(screen.getByText('Test Subtitle')).toBeInTheDocument();
        expect(screen.getByText('Test Description')).toBeInTheDocument();
        expect(screen.getByText('Test Objective')).toBeInTheDocument();
    });

    it('renders instructions markdown', () => {
        render(
            <MemoryRouter>
                <WelcomePage />
            </MemoryRouter>
        );
        // Label
        expect(screen.getByText('Instructions')).toBeInTheDocument();
        
        // Markdown Content - split check to be resilient to formatting/newlines
        expect(screen.getByText('Content')).toBeInTheDocument();
        
        // Check for bold tag
        const strong = document.querySelector('strong');
        expect(strong).toBeInTheDocument();
        expect(strong?.textContent).toBe('Content');
    });

    it('renders continue button and navigates to consent', async () => {
        render(
             <MemoryRouter initialEntries={['/study/test-study/welcome']}>
                 <Routes>
                     <Route path="/study/:slug/welcome" element={<WelcomePage />} />
                     <Route path="/study/:slug/consent" element={<div>Consent Page</div>} />
                 </Routes>
             </MemoryRouter>
         );
 
         const button = screen.getByRole('button', { name: /Continue/i });
         expect(button).toBeInTheDocument();
         
         fireEvent.click(button);
 
         await waitFor(() => {
             expect(screen.getByText('Consent Page')).toBeInTheDocument();
         });
    });
    
    it('conditionally renders "Start a new session" link based on session state', async () => {
        const { unmount } = render(
            <MemoryRouter>
                <WelcomePage />
            </MemoryRouter>
        );

        // Initially (reset session), the link should NOT be there
        expect(screen.queryByText('Start a new session')).not.toBeInTheDocument();
        
        unmount();

        // Case 1: user has consented
        useSessionStore.getState().setConsent(true);
        render(
            <MemoryRouter>
                <WelcomePage />
            </MemoryRouter>
        );
        expect(screen.getByText('Start a new session')).toBeInTheDocument();
        
        // Use cleanup for re-render
        // Instead of unmount/remount significantly, we can just update store and trigger re-render if we were using a real app,
        // but for unit tests, re-rendering with new store state is cleaner.
    });

    it('resets session when link is clicked and confirmed', async () => {
         // Setup active session
         useSessionStore.getState().setConsent(true);
         useResponseStore.getState().setPresortResponse({ test: 'data' });
         
         // Mock window.confirm
         const confirmSpy = vi.spyOn(window, 'confirm');
         confirmSpy.mockImplementation(() => true);
         
         // Mock window.location.reload (optional, but good practice since we call it)
         Object.defineProperty(window, 'location', {
            configurable: true,
            value: { reload: vi.fn() },
          });

         render(
            <MemoryRouter>
                <WelcomePage />
            </MemoryRouter>
        );

        const link = screen.getByText('Start a new session');
        fireEvent.click(link);

        expect(confirmSpy).toHaveBeenCalled();
        expect(window.location.reload).toHaveBeenCalled();
        
        // Verify store was reset (hasConsented should be false)
        // Note: useSessionStore.getState() might reflect the change immediately
        expect(useSessionStore.getState().hasConsented).toBe(false);

        // Verify response store was reset
        expect(useResponseStore.getState().presort).toEqual({});
    });
});
