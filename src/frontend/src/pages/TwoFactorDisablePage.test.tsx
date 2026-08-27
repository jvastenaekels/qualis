/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../test-utils/test-utils';
import TwoFactorDisablePage from './TwoFactorDisablePage';

vi.mock('@/api/generated', async () => {
    const actual = await vi.importActual<object>('@/api/generated');
    return {
        ...actual,
        twofaDisableConfirmApi2faDisableConfirmPost: vi.fn(),
    };
});

import { twofaDisableConfirmApi2faDisableConfirmPost } from '@/api/generated';

describe('TwoFactorDisablePage — explicit click contract', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('does NOT call disable API on mount (defends against email scanners)', async () => {
        renderWithProviders(<TwoFactorDisablePage />, {
            initialEntries: ['/2fa/disable?token=abc'],
        });
        // Wait long enough that any incidental async on mount would have fired
        await new Promise((r) => setTimeout(r, 100));
        expect(twofaDisableConfirmApi2faDisableConfirmPost).not.toHaveBeenCalled();
    });

    it('calls disable API on user click', async () => {
        vi.mocked(twofaDisableConfirmApi2faDisableConfirmPost).mockResolvedValue({
            status: 'ok',
        });
        renderWithProviders(<TwoFactorDisablePage />, {
            initialEntries: ['/2fa/disable?token=abc'],
        });
        fireEvent.click(screen.getByRole('button', { name: /disable two-factor/i }));
        await waitFor(() =>
            expect(twofaDisableConfirmApi2faDisableConfirmPost).toHaveBeenCalledWith({
                token: 'abc',
            })
        );
    });

    it('shows consumed error on 409', async () => {
        vi.mocked(twofaDisableConfirmApi2faDisableConfirmPost).mockRejectedValue({
            status: 409,
        });
        renderWithProviders(<TwoFactorDisablePage />, {
            initialEntries: ['/2fa/disable?token=abc'],
        });
        fireEvent.click(screen.getByRole('button', { name: /disable two-factor/i }));
        await waitFor(() => expect(screen.getByText(/already been used/i)).toBeInTheDocument());
    });

    it('shows expired error on 400', async () => {
        vi.mocked(twofaDisableConfirmApi2faDisableConfirmPost).mockRejectedValue({
            status: 400,
        });
        renderWithProviders(<TwoFactorDisablePage />, {
            initialEntries: ['/2fa/disable?token=abc'],
        });
        fireEvent.click(screen.getByRole('button', { name: /disable two-factor/i }));
        await waitFor(() => expect(screen.getByText(/expired or is invalid/i)).toBeInTheDocument());
    });

    it('shows missing-token error when URL has no token', async () => {
        renderWithProviders(<TwoFactorDisablePage />, {
            initialEntries: ['/2fa/disable'],
        });
        fireEvent.click(screen.getByRole('button', { name: /disable two-factor/i }));
        await waitFor(() => expect(screen.getByText(/no token in the url/i)).toBeInTheDocument());
        expect(twofaDisableConfirmApi2faDisableConfirmPost).not.toHaveBeenCalled();
    });
});
