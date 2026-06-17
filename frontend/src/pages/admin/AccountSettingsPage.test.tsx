/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test-utils/test-utils';
import AccountSettingsPage from './AccountSettingsPage';

vi.mock('@/hooks/useAuth', () => ({
    useAuth: () => ({
        user: {
            id: 1,
            email: 'a@b.io',
            full_name: 'Ada Lovelace',
            is_superuser: false,
            is_totp_enabled: false,
        },
        refetch: vi.fn(),
    }),
}));

const enableMutate = vi.fn();

vi.mock('@/api/generated', async () => {
    const actual = await vi.importActual<object>('@/api/generated');
    return {
        ...actual,
        useSetupTotpApiMe2faSetupGet: () => ({
            data: { secret: 'XYZ123', qr_code_uri: 'otpauth://totp/x' },
            isLoading: false,
        }),
        useEnableTotpApiMe2faEnablePost: () => ({
            mutate: enableMutate,
            isPending: false,
        }),
        useDisableTotpApiMe2faDisablePost: () => ({
            mutate: vi.fn(),
            isPending: false,
        }),
    };
});

describe('AccountSettingsPage 2FA (authenticator app)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('shows the QR code + 6-digit-code form on entering setup mode', async () => {
        renderWithProviders(<AccountSettingsPage />);
        fireEvent.click(screen.getByRole('button', { name: /setup 2fa now/i }));

        await waitFor(() => {
            expect(screen.getByPlaceholderText('000000')).toBeInTheDocument();
        });
        // No channel selector — TOTP app is the only channel
        expect(screen.queryByText(/how should we deliver/i)).not.toBeInTheDocument();
    });

    it('enabling calls the mutation with the entered token', async () => {
        renderWithProviders(<AccountSettingsPage />);
        fireEvent.click(screen.getByRole('button', { name: /setup 2fa now/i }));

        const codeInput = await screen.findByPlaceholderText('000000');
        fireEvent.change(codeInput, { target: { value: '123456' } });

        fireEvent.click(screen.getByRole('button', { name: /enable 2fa/i }));

        expect(enableMutate).toHaveBeenCalledWith({ data: { token: '123456' } });
    });
});
