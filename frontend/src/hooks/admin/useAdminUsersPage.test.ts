/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { act, renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AllTheProviders } from '@/test-utils/test-utils';
import {
    deriveRiskBadges,
    isDormant,
    sortByRisk,
    useAdminUsersPage,
    type AdminUser,
} from './useAdminUsersPage';

// ── Mocks ─────────────────────────────────────────────────────────

const { mockListUsersHook, mockPatchHook, mockDeleteHook, mockForcePwHook, mockResetTotpHook } =
    vi.hoisted(() => ({
        mockListUsersHook: vi.fn(),
        mockPatchHook: vi.fn(),
        mockDeleteHook: vi.fn(),
        mockForcePwHook: vi.fn(),
        mockResetTotpHook: vi.fn(),
    }));

vi.mock('@/api/generated', () => ({
    useListUsersApiAdminUsersGet: mockListUsersHook,
    usePatchUserApiAdminUsersUserIdPatch: mockPatchHook,
    useDeleteUserApiAdminUsersUserIdDelete: mockDeleteHook,
    useForcePasswordResetEndpointApiAdminUsersUserIdForcePasswordResetPost: mockForcePwHook,
    useResetTotpEndpointApiAdminUsersUserIdResetTotpPost: mockResetTotpHook,
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
});

// ── Pure function tests ───────────────────────────────────────────

describe('deriveRiskBadges', () => {
    it('flags superuser without 2FA as critical', () => {
        const u = { ...base, is_superuser: true, is_totp_enabled: false };
        expect(deriveRiskBadges(u, new Date('2026-05-15'))).toContain('superuser_no_2fa');
    });
    it('flags unverified email', () => {
        const u = { ...base, email_verified_at: null };
        expect(deriveRiskBadges(u, new Date('2026-05-15'))).toContain('email_unverified');
    });
    it('flags password older than 365 days', () => {
        const u = { ...base, password_changed_at: '2025-01-01T00:00:00Z' };
        expect(deriveRiskBadges(u, new Date('2026-05-15'))).toContain('password_stale');
    });
    it('flags pending email change', () => {
        const u = { ...base, pending_email: 'b@example.com' };
        expect(deriveRiskBadges(u, new Date('2026-05-15'))).toContain('email_change_pending');
    });
    it('returns empty when account is hygienic', () => {
        expect(deriveRiskBadges(base, new Date('2026-05-15'))).toEqual([]);
    });
});

describe('isDormant', () => {
    it('returns true when last_login_at older than 90 days', () => {
        expect(
            isDormant({ ...base, last_login_at: '2026-01-01T00:00:00Z' }, new Date('2026-05-15'))
        ).toBe(true);
    });
    it('returns false when last_login_at within 90 days', () => {
        expect(
            isDormant({ ...base, last_login_at: '2026-05-01T00:00:00Z' }, new Date('2026-05-15'))
        ).toBe(false);
    });
    it('returns true when last_login_at is null (never logged in)', () => {
        expect(isDormant({ ...base, last_login_at: null }, new Date('2026-05-15'))).toBe(true);
    });
});

describe('sortByRisk', () => {
    it('puts users with most badges first', () => {
        const clean = { ...base, id: 2 };
        const risky = {
            ...base,
            id: 3,
            is_superuser: true,
            is_totp_enabled: false,
            email_verified_at: null,
        };
        const sorted = sortByRisk([clean, risky], new Date('2026-05-15'));
        expect(sorted[0].id).toBe(3);
        expect(sorted[1].id).toBe(2);
    });
});

// Fix B — dormant badge emitted by deriveRiskBadges
describe('deriveRiskBadges — dormant', () => {
    it('flags a dormant account (no login in >90 days)', () => {
        const u = { ...base, last_login_at: '2026-01-01T00:00:00Z' };
        expect(deriveRiskBadges(u, new Date('2026-05-15'))).toContain('dormant');
    });
    it('does not flag dormant when recently logged in', () => {
        expect(deriveRiskBadges(base, new Date('2026-05-15'))).not.toContain('dormant');
    });
});

// Regression: the list query must respect the backend pagination contract.
// `PaginationParams` caps `limit` at MAX_PAGE_SIZE=100; requesting 200 makes
// the endpoint return 422, the page renders empty, and the error is swallowed
// because AdminUsersPage never surfaces the query error. (#171 shipped at 200.)
describe('useAdminUsersPage — list query contract', () => {
    it('requests the user list with a limit within the API maximum (<=100)', () => {
        renderHook(() => useAdminUsersPage(), { wrapper: AllTheProviders });

        expect(mockListUsersHook).toHaveBeenCalled();
        const params = mockListUsersHook.mock.calls[0]?.[0] as
            | { limit?: number; offset?: number }
            | undefined;
        expect(params?.limit).toBeDefined();
        expect(params?.limit).toBeLessThanOrEqual(100);
        expect(params?.limit).toBeGreaterThanOrEqual(1);
    });
});

// Fix C — renderHook integration tests for filter/search/sort inside useAdminUsersPage
describe('useAdminUsersPage — filtered list integration', () => {
    const userA: AdminUser = {
        ...base,
        id: 10,
        email: 'alice@example.com',
        full_name: 'Alice Smith',
        is_superuser: true,
        is_totp_enabled: false, // superuser_no_2fa badge
        email_verified_at: null, // email_unverified badge  → 2 badges
    };
    const userB: AdminUser = {
        ...base,
        id: 11,
        email: 'bob@example.com',
        full_name: 'Bob Jones',
        is_superuser: false,
        // base is hygienic → 0 badges
    };
    const userC: AdminUser = {
        ...base,
        id: 12,
        email: 'carol@example.com',
        full_name: null,
        is_superuser: false,
        // base is hygienic → 0 badges
    };

    it('search by email reduces the list (case-insensitive)', () => {
        mockListUsersHook.mockReturnValue({
            data: { items: [userA, userB, userC] },
            isLoading: false,
            error: null,
        });

        const { result } = renderHook(() => useAdminUsersPage(), { wrapper: AllTheProviders });

        act(() => {
            result.current.setSearch('ALICE');
        });

        expect(result.current.users).toHaveLength(1);
        expect(result.current.users[0].id).toBe(10);
    });

    it('search by full_name reduces the list', () => {
        mockListUsersHook.mockReturnValue({
            data: { items: [userA, userB, userC] },
            isLoading: false,
            error: null,
        });

        const { result } = renderHook(() => useAdminUsersPage(), { wrapper: AllTheProviders });

        act(() => {
            result.current.setSearch('jones');
        });

        expect(result.current.users).toHaveLength(1);
        expect(result.current.users[0].id).toBe(11);
    });

    it("filter='superusers' excludes non-superusers", () => {
        mockListUsersHook.mockReturnValue({
            data: { items: [userA, userB, userC] },
            isLoading: false,
            error: null,
        });

        const { result } = renderHook(() => useAdminUsersPage(), { wrapper: AllTheProviders });

        act(() => {
            result.current.setFilter('superusers');
        });

        expect(result.current.users).toHaveLength(1);
        expect(result.current.users[0].id).toBe(10);
    });

    it("accepts a 'deactivate' pending action kind (union includes deactivate)", () => {
        mockListUsersHook.mockReturnValue({
            data: { items: [userA] },
            isLoading: false,
            error: null,
        });

        const { result } = renderHook(() => useAdminUsersPage(), { wrapper: AllTheProviders });

        act(() => {
            result.current.setPendingAction({ kind: 'deactivate', user: userA });
        });

        expect(result.current.pendingAction).toEqual({ kind: 'deactivate', user: userA });
    });

    it('results are sorted by descending badge count (risky user appears first)', () => {
        mockListUsersHook.mockReturnValue({
            data: { items: [userB, userA] }, // B first in source, A is riskier
            isLoading: false,
            error: null,
        });

        const { result } = renderHook(() => useAdminUsersPage(), { wrapper: AllTheProviders });

        // userA has 2 badges, userB has 0 → userA must sort first
        expect(result.current.users[0].id).toBe(10);
        expect(result.current.users[1].id).toBe(11);
    });
});
