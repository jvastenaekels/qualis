/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderWithProviders } from '../test-utils/test-utils';
import PasswordResetRequestPage from './PasswordResetRequestPage';

vi.mock('@/api/generated', async () => {
    const actual = await vi.importActual<object>('@/api/generated');
    return {
        ...actual,
        passwordResetRequestApiPasswordResetRequestPost: vi.fn(),
    };
});

import { passwordResetRequestApiPasswordResetRequestPost } from '@/api/generated';

describe('PasswordResetRequestPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('shows success message after a successful submit', async () => {
        vi.mocked(passwordResetRequestApiPasswordResetRequestPost).mockResolvedValue(undefined);
        renderWithProviders(<PasswordResetRequestPage />, {
            initialEntries: ['/forgot-password'],
        });
        fireEvent.change(screen.getByRole('textbox', { name: /email/i }), {
            target: { value: 'a@b.com' },
        });
        fireEvent.click(screen.getByRole('button', { name: /send reset link/i }));
        await waitFor(() => expect(screen.getByText(/on its way/i)).toBeInTheDocument());
    });

    it('shows success message even when the API rejects (anti-enumeration)', async () => {
        vi.mocked(passwordResetRequestApiPasswordResetRequestPost).mockRejectedValue({
            status: 404,
        });
        renderWithProviders(<PasswordResetRequestPage />, {
            initialEntries: ['/forgot-password'],
        });
        fireEvent.change(screen.getByRole('textbox', { name: /email/i }), {
            target: { value: 'unknown@b.com' },
        });
        fireEvent.click(screen.getByRole('button', { name: /send reset link/i }));
        await waitFor(() => expect(screen.getByText(/on its way/i)).toBeInTheDocument());
    });

    it('renders the form with a title and email field', () => {
        renderWithProviders(<PasswordResetRequestPage />, {
            initialEntries: ['/forgot-password'],
        });
        expect(screen.getByRole('heading', { name: /reset your password/i })).toBeInTheDocument();
        expect(screen.getByRole('textbox', { name: /email/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /send reset link/i })).toBeInTheDocument();
    });
});
