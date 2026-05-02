/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../test-utils/test-utils';
import TwoFactorRecoveryPage from './TwoFactorRecoveryPage';

vi.mock('@/api/generated', async () => {
    const actual = await vi.importActual<object>('@/api/generated');
    return {
        ...actual,
        twofaDisableRequestApi2faDisableRequestPost: vi.fn(),
    };
});

import { twofaDisableRequestApi2faDisableRequestPost } from '@/api/generated';

describe('TwoFactorRecoveryPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders the form with a title and email field', () => {
        renderWithProviders(<TwoFactorRecoveryPage />, {
            initialEntries: ['/2fa/recover'],
        });
        expect(
            screen.getByRole('heading', { name: /lost access to your two-factor/i })
        ).toBeInTheDocument();
        expect(screen.getByRole('textbox', { name: /email/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /send disable link/i })).toBeInTheDocument();
    });

    it('shows success message after a successful submit', async () => {
        vi.mocked(twofaDisableRequestApi2faDisableRequestPost).mockResolvedValue({
            status: 'ok',
        });
        renderWithProviders(<TwoFactorRecoveryPage />, {
            initialEntries: ['/2fa/recover'],
        });
        fireEvent.change(screen.getByRole('textbox', { name: /email/i }), {
            target: { value: 'a@b.com' },
        });
        fireEvent.click(screen.getByRole('button', { name: /send disable link/i }));
        await waitFor(() =>
            expect(screen.getByText(/disable link is on its way/i)).toBeInTheDocument()
        );
        expect(twofaDisableRequestApi2faDisableRequestPost).toHaveBeenCalledWith({
            email: 'a@b.com',
        });
    });

    it('shows success message even when the API rejects (anti-enumeration)', async () => {
        vi.mocked(twofaDisableRequestApi2faDisableRequestPost).mockRejectedValue({
            status: 404,
        });
        renderWithProviders(<TwoFactorRecoveryPage />, {
            initialEntries: ['/2fa/recover'],
        });
        fireEvent.change(screen.getByRole('textbox', { name: /email/i }), {
            target: { value: 'unknown@b.com' },
        });
        fireEvent.click(screen.getByRole('button', { name: /send disable link/i }));
        await waitFor(() =>
            expect(screen.getByText(/disable link is on its way/i)).toBeInTheDocument()
        );
    });
});
