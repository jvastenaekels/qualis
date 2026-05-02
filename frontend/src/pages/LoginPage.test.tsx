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

    it('shows the email-channel 2FA prompt when requires_2fa is true and channel is email', async () => {
        mockedCustomInstance.mockResolvedValueOnce({
            requires_2fa: true,
            channel: 'email',
            access_token: null,
        });

        renderWithProviders(<LoginPage />);

        // Fill credentials
        const emailInput = screen.getByPlaceholderText(/name@example\.com/i);
        const passwordInput = screen.getAllByPlaceholderText(/.+/)[1];
        fireEvent.change(emailInput, { target: { value: 'a@b.io' } });
        fireEvent.change(passwordInput as HTMLElement, { target: { value: 'pw12345678' } });

        // Submit (the credentials Continue button)
        const submitBtn = screen.getByRole('button', { name: /continue/i });
        fireEvent.click(submitBtn);

        // 2FA prompt with email-specific copy appears
        await waitFor(() => {
            expect(screen.getByText(/sent a 6-digit code to your email/i)).toBeInTheDocument();
        });
        expect(screen.getByRole('button', { name: /verify/i })).toBeInTheDocument();
        expect(screen.getByText(/resend code|resend available/i)).toBeInTheDocument();
        expect(screen.getByText(/lost access to your 2FA/i)).toBeInTheDocument();
    });

    it('shows the app-channel 2FA prompt when requires_2fa is true and channel is app', async () => {
        mockedCustomInstance.mockResolvedValueOnce({
            requires_2fa: true,
            channel: 'app',
            access_token: null,
        });

        renderWithProviders(<LoginPage />);

        const emailInput = screen.getByPlaceholderText(/name@example\.com/i);
        const passwordInput = screen.getAllByPlaceholderText(/.+/)[1];
        fireEvent.change(emailInput, { target: { value: 'a@b.io' } });
        fireEvent.change(passwordInput as HTMLElement, { target: { value: 'pw12345678' } });

        fireEvent.click(screen.getByRole('button', { name: /continue/i }));

        await waitFor(() => {
            expect(screen.getByText(/code from your authenticator app/i)).toBeInTheDocument();
        });
        // Email-only 'Resend' link should NOT appear for the 'app' channel
        expect(screen.queryByText(/resend code|resend available/i)).not.toBeInTheDocument();
    });
});
