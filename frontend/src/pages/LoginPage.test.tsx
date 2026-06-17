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
        const passwordInput = screen.getAllByPlaceholderText(/.+/)[1];
        fireEvent.change(emailInput, { target: { value: 'a@b.io' } });
        fireEvent.change(passwordInput as HTMLElement, { target: { value: 'pw12345678' } });

        fireEvent.click(screen.getByRole('button', { name: /continue/i }));

        await waitFor(() => {
            expect(screen.getByText(/code from your authenticator app/i)).toBeInTheDocument();
        });
        expect(screen.getByRole('button', { name: /verify/i })).toBeInTheDocument();
        // No email-only 'Resend' link
        expect(screen.queryByText(/resend code|resend available/i)).not.toBeInTheDocument();
    });
});
