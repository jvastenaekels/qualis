/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../test-utils/test-utils';
import LoginPage from './LoginPage';

vi.mock('@/api/mutator', () => ({
    customInstance: vi.fn(),
}));

import { customInstance } from '@/api/mutator';

const mockedCustomInstance = vi.mocked(customInstance);

describe('LoginPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('shows the authenticator-app 2FA prompt when requires_2fa is true', async () => {
        mockedCustomInstance.mockResolvedValueOnce({
            requires_2fa: true,
            access_token: null,
        });

        renderWithProviders(<LoginPage />);

        const emailInput = screen.getByPlaceholderText(/name@example\.com/i);
        const passwordInput = screen.getByLabelText('Password');
        fireEvent.change(emailInput, { target: { value: 'a@b.io' } });
        fireEvent.change(passwordInput, { target: { value: 'pw12345678' } });

        fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

        await waitFor(() => {
            expect(screen.getByText(/code from your authenticator app/i)).toBeInTheDocument();
        });
        expect(screen.getByRole('button', { name: /verify/i })).toBeInTheDocument();
        // No email-only 'Resend' link
        expect(screen.queryByText(/resend code|resend available/i)).not.toBeInTheDocument();
    });

    it('exposes the visible title as the page heading, not a hidden duplicate', () => {
        renderWithProviders(<LoginPage />);

        const headings = screen.getAllByRole('heading', { level: 1 });

        // Positive: exactly one level-1 heading, carrying the visible title's
        // own styling (it IS the visible card title, not a wrapper around it).
        expect(headings).toHaveLength(1);
        expect(headings[0]).toHaveTextContent('Sign in');
        expect(headings[0]).toHaveClass('font-black');

        // Negative: it is not the old visually-hidden duplicate that sat
        // alongside a separate, unlabelled visible title.
        expect(headings[0]).not.toHaveClass('sr-only');
    });

    it('labels the submit button with the action it performs', () => {
        renderWithProviders(<LoginPage />);

        // Positive: the primary action names what it does.
        expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();

        // Negative: the old generic "Continue" label is gone.
        expect(screen.queryByRole('button', { name: /^continue$/i })).not.toBeInTheDocument();
    });

    it('does not disguise the empty password field as already filled', () => {
        renderWithProviders(<LoginPage />);

        const passwordInput = screen.getByLabelText('Password') as HTMLInputElement;

        // Negative: no bullet placeholder mimicking existing content.
        expect(passwordInput).not.toHaveAttribute('placeholder', '••••••••');
        // Positive: the empty field genuinely looks empty.
        expect(passwordInput.placeholder).toBe('');
    });
});
