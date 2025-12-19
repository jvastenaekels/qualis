/*
 * Open-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ErrorPage from './ErrorPage';
import { MemoryRouter } from 'react-router-dom';

const mockResetSession = vi.fn();
const mockNavigate = vi.fn();

vi.mock('../store/useStudyStore', () => ({
    useStudyStore: () => ({
        resetSession: mockResetSession
    })
}));

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return {
        ...actual,
        useNavigate: () => mockNavigate
    };
});

describe('ErrorPage', () => {
    // Mock window.location
    const originalLocation = window.location;

    beforeEach(() => {
        // @ts-expect-error - window.location is read-only in JSDOM
        delete window.location;
        // @ts-expect-error - window.location is read-only in JSDOM
        window.location = { href: '' };
        vi.clearAllMocks();
    });

    afterEach(() => {
        // @ts-expect-error - window.location is read-only in JSDOM
        window.location = originalLocation;
    });

    it('renders error message', () => {
        render(
            <MemoryRouter>
                <ErrorPage />
            </MemoryRouter>
        );
        expect(screen.getByText(/Oops! Something went wrong/)).toBeInTheDocument();
    });

    it('resets session on button click', () => {
        render(
            <MemoryRouter>
                <ErrorPage />
            </MemoryRouter>
        );
        
        const resetButton = screen.getByRole('button', { name: /Reset Session/i });
        fireEvent.click(resetButton);

        expect(mockResetSession).toHaveBeenCalled();
        expect(window.location.href).toBe('/');
    });

    it('navigates to home on home button click', () => {
        render(
            <MemoryRouter>
                <ErrorPage />
            </MemoryRouter>
        );
        
        const homeButton = screen.getByRole('button', { name: /Go to Home/i });
        fireEvent.click(homeButton);

        expect(mockNavigate).toHaveBeenCalledWith('/');
    });
});
