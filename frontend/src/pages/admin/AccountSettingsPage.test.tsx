/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePlatformConfigStore } from '@/store/usePlatformConfigStore';
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

describe('AccountSettingsPage 2FA channel selector', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // smtp => email option visible => current behavior; keeps pre-existing tests green
        usePlatformConfigStore.setState({ emailDelivery: 'smtp' });
    });

    it('renders the channel selector when entering 2FA setup mode', async () => {
        renderWithProviders(<AccountSettingsPage />);
        fireEvent.click(screen.getByRole('button', { name: /setup 2fa now/i }));

        await waitFor(() => {
            expect(screen.getByText(/how should we deliver your 2fa codes/i)).toBeInTheDocument();
        });
        // Two radio inputs (one per channel), 'app' is checked by default
        const radios = screen.getAllByRole('radio');
        expect(radios).toHaveLength(2);
        expect(radios[0]).toHaveAttribute('value', 'app');
        expect(radios[0]).toBeChecked();
        expect(radios[1]).toHaveAttribute('value', 'email');
        expect(radios[1]).not.toBeChecked();
    });

    it('selecting email channel + enable calls enableMutation with {channel: email}', async () => {
        renderWithProviders(<AccountSettingsPage />);
        fireEvent.click(screen.getByRole('button', { name: /setup 2fa now/i }));

        await waitFor(() => expect(screen.getByText(/how should we deliver/i)).toBeInTheDocument());

        // Click the Email radio (second one in tab order)
        const radios = screen.getAllByRole('radio');
        fireEvent.click(radios[1] as HTMLElement);

        // Now the "Enable email-based 2FA" button is rendered
        const enableEmailBtn = await screen.findByRole('button', {
            name: /enable email-based 2fa/i,
        });
        fireEvent.click(enableEmailBtn);

        expect(enableMutate).toHaveBeenCalledWith({ data: { channel: 'email' } });
    });

    it('app channel keeps the QR-code + 6-digit-code form visible', async () => {
        renderWithProviders(<AccountSettingsPage />);
        fireEvent.click(screen.getByRole('button', { name: /setup 2fa now/i }));

        await waitFor(() => expect(screen.getByText(/how should we deliver/i)).toBeInTheDocument());

        // 'app' is selected by default — QR & code input should be in the DOM
        expect(screen.getByPlaceholderText('000000')).toBeInTheDocument();
        // Email-only enable button should NOT be shown
        expect(
            screen.queryByRole('button', { name: /enable email-based 2fa/i })
        ).not.toBeInTheDocument();
    });
});

describe('AccountSettingsPage 2FA channel selector — email delivery mode', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('hides the email 2FA channel option when email delivery is manual', async () => {
        usePlatformConfigStore.setState({ emailDelivery: 'manual' });
        renderWithProviders(<AccountSettingsPage />);
        fireEvent.click(screen.getByRole('button', { name: /setup 2fa now/i }));

        await waitFor(() => {
            expect(screen.getByText(/how should we deliver/i)).toBeInTheDocument();
        });

        // The 'app' option must always remain
        expect(screen.queryByDisplayValue('app')).toBeInTheDocument();
        // The 'email' channel radio must NOT be rendered
        expect(screen.queryByDisplayValue('email')).not.toBeInTheDocument();
    });

    it('shows the email 2FA channel option when email delivery is smtp', async () => {
        usePlatformConfigStore.setState({ emailDelivery: 'smtp' });
        renderWithProviders(<AccountSettingsPage />);
        fireEvent.click(screen.getByRole('button', { name: /setup 2fa now/i }));

        await waitFor(() => {
            expect(screen.getByText(/how should we deliver/i)).toBeInTheDocument();
        });

        expect(screen.queryByDisplayValue('app')).toBeInTheDocument();
        expect(screen.queryByDisplayValue('email')).toBeInTheDocument();
    });

    it('coerces a stale email selection back to app when delivery flips to manual', async () => {
        usePlatformConfigStore.setState({ emailDelivery: 'smtp' });
        renderWithProviders(<AccountSettingsPage />);
        fireEvent.click(screen.getByRole('button', { name: /setup 2fa now/i }));

        await waitFor(() => expect(screen.getByText(/how should we deliver/i)).toBeInTheDocument());

        // Select the Email channel radio (second one in tab order)
        const radios = screen.getAllByRole('radio');
        fireEvent.click(radios[1] as HTMLElement);

        // The email-OTP enable affordance is gated by channelChoice === 'email'
        expect(
            await screen.findByRole('button', { name: /enable email-based 2fa/i })
        ).toBeInTheDocument();

        // Flip delivery to manual: the coercion useEffect must reset channelChoice to 'app'
        act(() => usePlatformConfigStore.setState({ emailDelivery: 'manual' }));

        await waitFor(() =>
            expect(
                screen.queryByRole('button', { name: /enable email-based 2fa/i })
            ).not.toBeInTheDocument()
        );
    });
});
