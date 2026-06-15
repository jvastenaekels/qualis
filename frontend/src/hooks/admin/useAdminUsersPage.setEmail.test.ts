/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AllTheProviders } from '@/test-utils/test-utils';
import { useAdminUsersPage, type AdminUser } from './useAdminUsersPage';

// ── Mocks ─────────────────────────────────────────────────────────

const {
    mockListUsersHook,
    mockPatchHook,
    mockDeleteHook,
    mockForcePwHook,
    mockResetTotpHook,
    mockRecoveryLinkHook,
    mockSetEmailHook,
} = vi.hoisted(() => ({
    mockListUsersHook: vi.fn(),
    mockPatchHook: vi.fn(),
    mockDeleteHook: vi.fn(),
    mockForcePwHook: vi.fn(),
    mockResetTotpHook: vi.fn(),
    mockRecoveryLinkHook: vi.fn(),
    mockSetEmailHook: vi.fn(),
}));

vi.mock('@/api/generated', () => ({
    useListUsersApiAdminUsersGet: mockListUsersHook,
    usePatchUserApiAdminUsersUserIdPatch: mockPatchHook,
    useDeleteUserApiAdminUsersUserIdDelete: mockDeleteHook,
    useForcePasswordResetEndpointApiAdminUsersUserIdForcePasswordResetPost: mockForcePwHook,
    useResetTotpEndpointApiAdminUsersUserIdResetTotpPost: mockResetTotpHook,
    useRecoveryLinkEndpointApiAdminUsersUserIdRecoveryLinkPost: mockRecoveryLinkHook,
    useSetEmailEndpointApiAdminUsersUserIdSetEmailPost: mockSetEmailHook,
    getListUsersApiAdminUsersGetQueryKey: () => ['list-users'],
}));

function makeIdleMutation() {
    return { mutateAsync: vi.fn(), isPending: false, error: null };
}

// ── Fixtures ──────────────────────────────────────────────────────

const base: AdminUser = {
    id: 1,
    email: 'a@example.com',
    full_name: null,
    is_active: true,
    is_superuser: false,
    is_totp_enabled: true,
    email_verified_at: '2026-01-01T00:00:00Z',
    password_changed_at: '2026-01-01T00:00:00Z',
    last_login_at: '2026-05-01T00:00:00Z',
    pending_email: null,
};

// ── Setup ─────────────────────────────────────────────────────────

beforeEach(() => {
    vi.clearAllMocks();
    mockListUsersHook.mockReturnValue({ data: { items: [] }, isLoading: false, error: null });
    mockPatchHook.mockReturnValue(makeIdleMutation());
    mockDeleteHook.mockReturnValue(makeIdleMutation());
    mockForcePwHook.mockReturnValue(makeIdleMutation());
    mockResetTotpHook.mockReturnValue(makeIdleMutation());
    mockRecoveryLinkHook.mockReturnValue(makeIdleMutation());
    mockSetEmailHook.mockReturnValue({
        mutateAsync: vi.fn().mockResolvedValue({ ...base, email: 'new@example.com' }),
        isPending: false,
        error: null,
    });
});

// ── Superuser set-email ───────────────────────────────────────────

describe('useAdminUsersPage — setEmail', () => {
    it('resolves once the updated user is returned by the endpoint', async () => {
        const { result } = renderHook(() => useAdminUsersPage(), { wrapper: AllTheProviders });

        await expect(
            result.current.actions.setEmail(base, 'new@example.com')
        ).resolves.toBeUndefined();
    });

    it('calls the mutation with exactly userId and the new_email body', async () => {
        const mutateAsync = vi
            .fn()
            .mockResolvedValue({ ...base, id: 42, email: 'changed@example.com' });
        mockSetEmailHook.mockReturnValue({ mutateAsync, isPending: false, error: null });

        const { result } = renderHook(() => useAdminUsersPage(), { wrapper: AllTheProviders });

        await result.current.actions.setEmail(
            { ...base, id: 42 } as AdminUser,
            'changed@example.com'
        );

        expect(mutateAsync).toHaveBeenCalledWith({
            userId: 42,
            data: { new_email: 'changed@example.com' },
        });
    });

    it('folds the set-email mutation pending state into isMutating', () => {
        mockSetEmailHook.mockReturnValue({
            mutateAsync: vi.fn(),
            isPending: true,
            error: null,
        });

        const { result } = renderHook(() => useAdminUsersPage(), { wrapper: AllTheProviders });

        expect(result.current.isMutating).toBe(true);
    });
});
