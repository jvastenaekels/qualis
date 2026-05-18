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
} = vi.hoisted(() => ({
    mockListUsersHook: vi.fn(),
    mockPatchHook: vi.fn(),
    mockDeleteHook: vi.fn(),
    mockForcePwHook: vi.fn(),
    mockResetTotpHook: vi.fn(),
    mockRecoveryLinkHook: vi.fn(),
}));

vi.mock('@/api/generated', () => ({
    useListUsersApiAdminUsersGet: mockListUsersHook,
    usePatchUserApiAdminUsersUserIdPatch: mockPatchHook,
    useDeleteUserApiAdminUsersUserIdDelete: mockDeleteHook,
    useForcePasswordResetEndpointApiAdminUsersUserIdForcePasswordResetPost: mockForcePwHook,
    useResetTotpEndpointApiAdminUsersUserIdResetTotpPost: mockResetTotpHook,
    useRecoveryLinkEndpointApiAdminUsersUserIdRecoveryLinkPost: mockRecoveryLinkHook,
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
    owned_project_quota: null,
};

// ── Setup ─────────────────────────────────────────────────────────

beforeEach(() => {
    vi.clearAllMocks();
    mockListUsersHook.mockReturnValue({ data: { items: [] }, isLoading: false, error: null });
    mockPatchHook.mockReturnValue(makeIdleMutation());
    mockDeleteHook.mockReturnValue(makeIdleMutation());
    mockForcePwHook.mockReturnValue(makeIdleMutation());
    mockResetTotpHook.mockReturnValue(makeIdleMutation());
    mockRecoveryLinkHook.mockReturnValue({
        mutateAsync: vi.fn().mockResolvedValue({
            kind: 'password_reset',
            url: 'http://x/reset-password?token=abc',
            expires_at: '2026-05-18T00:00:00Z',
        }),
        isPending: false,
        error: null,
    });
});

// ── Recovery-link generation ──────────────────────────────────────

describe('useAdminUsersPage — generateRecoveryLink', () => {
    it('resolves to the reset-password URL returned by the endpoint', async () => {
        const { result } = renderHook(() => useAdminUsersPage(), { wrapper: AllTheProviders });

        const url = await result.current.actions.generateRecoveryLink(base);

        expect(url).toBe('http://x/reset-password?token=abc');
    });

    it('calls the mutation with userId and the password_reset kind body', async () => {
        const mutateAsync = vi.fn().mockResolvedValue({
            kind: 'password_reset',
            url: 'http://x/reset-password?token=xyz',
            expires_at: '2026-05-18T00:00:00Z',
        });
        mockRecoveryLinkHook.mockReturnValue({ mutateAsync, isPending: false, error: null });

        const { result } = renderHook(() => useAdminUsersPage(), { wrapper: AllTheProviders });

        await result.current.actions.generateRecoveryLink({ ...base, id: 42 } as AdminUser);

        expect(mutateAsync).toHaveBeenCalledWith({
            userId: 42,
            data: { kind: 'password_reset' },
        });
    });
});
