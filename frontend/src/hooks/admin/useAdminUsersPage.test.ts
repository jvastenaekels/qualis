/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { describe, it, expect } from 'vitest';
import { deriveRiskBadges, isDormant, sortByRisk, type AdminUser } from './useAdminUsersPage';

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
