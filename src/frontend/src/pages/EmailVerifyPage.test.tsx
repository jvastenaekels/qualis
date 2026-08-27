/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderWithProviders } from '../test-utils/test-utils';
import EmailVerifyPage from './EmailVerifyPage';

vi.mock('@/api/generated', async () => {
    const actual = await vi.importActual<object>('@/api/generated');
    return {
        ...actual,
        verifyEmailApiEmailVerifyPost: vi.fn(),
    };
});

import { verifyEmailApiEmailVerifyPost } from '@/api/generated';

describe('EmailVerifyPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('shows success after API call resolves', async () => {
        vi.mocked(verifyEmailApiEmailVerifyPost).mockResolvedValue({ ok: true });
        renderWithProviders(<EmailVerifyPage />, {
            initialEntries: ['/verify-email?token=abc'],
        });
        await waitFor(() => expect(screen.getByText(/verified/i)).toBeInTheDocument());
    });

    it('shows expired message when API rejects', async () => {
        vi.mocked(verifyEmailApiEmailVerifyPost).mockRejectedValue({ status: 400 });
        renderWithProviders(<EmailVerifyPage />, {
            initialEntries: ['/verify-email?token=abc'],
        });
        await waitFor(() => expect(screen.getByText(/expired|invalid/i)).toBeInTheDocument());
    });

    it('shows error when token missing from URL', async () => {
        renderWithProviders(<EmailVerifyPage />, {
            initialEntries: ['/verify-email'],
        });
        await waitFor(() => expect(screen.getByText(/expired|invalid/i)).toBeInTheDocument());
    });
});
