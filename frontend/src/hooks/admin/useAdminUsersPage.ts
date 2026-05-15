/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

/**
 * useAdminUsersPage hook
 *
 * Encapsulates the durable state-and-effect logic for the Admin Users page.
 * AdminUsersPage receives this hook's return value and renders JSX from it.
 *
 * Logic owned here:
 * - User list query (paginated, limit 200)
 * - Search text filter + filter-mode state
 * - Pure risk-badge derivation (superuser_no_2fa, email_unverified,
 *   password_stale, email_change_pending, dormant)
 * - Risk-sorted filtered user list (memoized)
 * - Pending-action confirmation state (delete / reset-totp / force-password-reset / toggle-superuser)
 * - All admin mutations (deactivate, activate, promote, demote, forcePasswordReset, resetTotp, delete)
 *   with query invalidation on success
 *
 * Visual-only state that stays in the component:
 * - Toast notifications (Sonner)
 * - Dialog/modal open state (Radix UI internal)
 */

import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
    useListUsersApiAdminUsersGet,
    usePatchUserApiAdminUsersUserIdPatch,
    useDeleteUserApiAdminUsersUserIdDelete,
    useForcePasswordResetEndpointApiAdminUsersUserIdForcePasswordResetPost,
    useResetTotpEndpointApiAdminUsersUserIdResetTotpPost,
    getListUsersApiAdminUsersGetQueryKey,
} from '@/api/generated';
import type { UserReadAdmin } from '@/api/model';

// ────────────────────────────────────────────────────────────────
// Public types (contract for AdminUsersPage + its tests)
// ────────────────────────────────────────────────────────────────

export type AdminUser = UserReadAdmin;

export type RiskBadge =
    | 'superuser_no_2fa'
    | 'email_unverified'
    | 'password_stale'
    | 'email_change_pending'
    | 'dormant';

export type FilterMode = 'all' | 'superusers' | 'no_2fa' | 'unverified' | 'dormant';

// ────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const STALE_PASSWORD_DAYS = 365;
const DORMANT_DAYS = 90;

// ────────────────────────────────────────────────────────────────
// Pure helpers — exported for unit tests
// ────────────────────────────────────────────────────────────────

export function isDormant(u: AdminUser, now: Date): boolean {
    if (u.last_login_at === null || u.last_login_at === undefined) return true;
    const last = new Date(u.last_login_at).getTime();
    return now.getTime() - last > DORMANT_DAYS * ONE_DAY_MS;
}

export function deriveRiskBadges(u: AdminUser, now: Date): RiskBadge[] {
    const badges: RiskBadge[] = [];
    if (u.is_superuser && !u.is_totp_enabled) badges.push('superuser_no_2fa');
    if (u.email_verified_at === null || u.email_verified_at === undefined)
        badges.push('email_unverified');
    if (u.password_changed_at) {
        const age = now.getTime() - new Date(u.password_changed_at).getTime();
        if (age > STALE_PASSWORD_DAYS * ONE_DAY_MS) badges.push('password_stale');
    }
    if (u.pending_email !== null && u.pending_email !== undefined)
        badges.push('email_change_pending');
    if (isDormant(u, now)) badges.push('dormant');
    return badges;
}

export function sortByRisk(users: AdminUser[], now: Date): AdminUser[] {
    return [...users].sort(
        (a, b) => deriveRiskBadges(b, now).length - deriveRiskBadges(a, now).length
    );
}

// ────────────────────────────────────────────────────────────────
// Hook
// ────────────────────────────────────────────────────────────────

export function useAdminUsersPage() {
    const qc = useQueryClient();
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState<FilterMode>('all');
    const [pendingAction, setPendingAction] = useState<{
        kind: 'delete' | 'reset-totp' | 'force-password-reset' | 'toggle-superuser';
        user: AdminUser;
    } | null>(null);

    const listParams = { limit: 200, offset: 0 };

    const { data, isLoading, error } = useListUsersApiAdminUsersGet(listParams);

    // Invalidate using the no-params key so prefix matching covers any
    // cached variant of the list query (limit/offset combos).
    const invalidate = () =>
        qc.invalidateQueries({ queryKey: getListUsersApiAdminUsersGetQueryKey() });

    const patch = usePatchUserApiAdminUsersUserIdPatch({
        mutation: { onSuccess: invalidate },
    });
    const del = useDeleteUserApiAdminUsersUserIdDelete({
        mutation: { onSuccess: invalidate },
    });
    const forcePwReset = useForcePasswordResetEndpointApiAdminUsersUserIdForcePasswordResetPost({
        mutation: { onSuccess: invalidate },
    });
    const resetTotp = useResetTotpEndpointApiAdminUsersUserIdResetTotpPost({
        mutation: { onSuccess: invalidate },
    });

    const now = useMemo(() => new Date(), []); // intentional: page-lifetime clock (admin page is short-lived)

    const filtered = useMemo(() => {
        const items = data?.items ?? [];
        const text = search.trim().toLowerCase();
        const matches = (u: AdminUser) =>
            !text ||
            u.email.toLowerCase().includes(text) ||
            (u.full_name?.toLowerCase().includes(text) ?? false);

        const filteredItems = items.filter((u) => {
            if (!matches(u)) return false;
            switch (filter) {
                case 'superusers':
                    return u.is_superuser;
                case 'no_2fa':
                    return !u.is_totp_enabled;
                case 'unverified':
                    return u.email_verified_at === null || u.email_verified_at === undefined;
                case 'dormant':
                    return isDormant(u, now);
                default:
                    return true;
            }
        });
        return sortByRisk(filteredItems, now);
    }, [data?.items, search, filter, now]);

    return {
        users: filtered,
        isLoading,
        error,
        search,
        setSearch,
        filter,
        setFilter,
        pendingAction,
        setPendingAction,
        now,
        isMutating:
            patch.isPending || del.isPending || forcePwReset.isPending || resetTotp.isPending,
        mutationError: patch.error ?? del.error ?? forcePwReset.error ?? resetTotp.error ?? null,
        actions: {
            deactivate: (u: AdminUser) =>
                patch.mutateAsync({ userId: u.id, data: { is_active: false } }),
            activate: (u: AdminUser) =>
                patch.mutateAsync({ userId: u.id, data: { is_active: true } }),
            promote: (u: AdminUser) =>
                patch.mutateAsync({ userId: u.id, data: { is_superuser: true } }),
            demote: (u: AdminUser) =>
                patch.mutateAsync({ userId: u.id, data: { is_superuser: false } }),
            forcePasswordReset: (u: AdminUser) => forcePwReset.mutateAsync({ userId: u.id }),
            resetTotp: (u: AdminUser) => resetTotp.mutateAsync({ userId: u.id }),
            delete: (u: AdminUser) => del.mutateAsync({ userId: u.id }),
        },
    };
}
