/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { renderWithProviders, screen, waitFor } from '@/test-utils/test-utils';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { EraseMyDataDialog } from './EraseMyDataDialog';

const eraseMutateMock = vi.fn();

vi.mock('@/api/generated', async () => {
    const actual = await vi.importActual<typeof import('@/api/generated')>('@/api/generated');
    return {
        ...actual,
        useParticipantSelfErasePersonalDataApiStudySlugPersonalDataDelete: (opts?: {
            mutation?: {
                onSuccess?: () => void;
                onError?: () => void;
            };
        }) => ({
            mutate: (vars: { slug: string; params: { session_token: string } }) => {
                eraseMutateMock(vars);
                opts?.mutation?.onSuccess?.();
            },
            isPending: false,
        }),
    };
});

describe('EraseMyDataDialog', () => {
    beforeEach(() => {
        eraseMutateMock.mockClear();
    });

    it('renders nothing when there is no session token', () => {
        renderWithProviders(<EraseMyDataDialog slug="demo" sessionToken={null} />);
        expect(screen.queryByText(/erasure|effacement/i)).not.toBeInTheDocument();
    });

    it('renders the section heading and trigger when a session token is present', () => {
        renderWithProviders(<EraseMyDataDialog slug="demo" sessionToken="abc-123" />);
        expect(screen.getByRole('heading', { name: /right to erasure/i })).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: /request my data deletion/i })
        ).toBeInTheDocument();
    });

    it('calls the erase mutation when the user confirms', async () => {
        const user = userEvent.setup();
        renderWithProviders(<EraseMyDataDialog slug="demo" sessionToken="abc-123" />);

        await user.click(screen.getByRole('button', { name: /request my data deletion/i }));

        // Confirmation dialog appears
        expect(await screen.findByRole('alertdialog')).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: /yes, erase my data/i }));

        await waitFor(() => {
            expect(eraseMutateMock).toHaveBeenCalledWith({
                slug: 'demo',
                params: { session_token: 'abc-123' },
            });
        });

        // Switches to the "already erased" notice
        expect(
            await screen.findByText(/your personal data has been removed for this session/i)
        ).toBeInTheDocument();
    });
});
