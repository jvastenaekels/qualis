import { describe, it, expect } from 'vitest';
import { buildAccessRulesUpdate } from './useRecruitmentPage.helpers';

describe('buildAccessRulesUpdate', () => {
    const baseValues = {
        passwordEnabled: false,
        accessPassword: '',
        startDate: null,
        endDate: null,
    };

    it('omits password fields when slug is locked', () => {
        const update = buildAccessRulesUpdate(
            { ...baseValues, passwordEnabled: true, accessPassword: 'secret' },
            { isSlugLocked: true }
        );
        expect(update).not.toHaveProperty('access_password');
    });

    it('clears password (null) when password is disabled in unlocked draft', () => {
        const update = buildAccessRulesUpdate(
            { ...baseValues, passwordEnabled: false },
            { isSlugLocked: false }
        );
        expect(update.access_password).toBeNull();
    });

    it('sets password when enabled and value provided in unlocked draft', () => {
        const update = buildAccessRulesUpdate(
            { ...baseValues, passwordEnabled: true, accessPassword: 'secret' },
            { isSlugLocked: false }
        );
        expect(update.access_password).toBe('secret');
    });

    it('omits password field when enabled but empty string in unlocked draft', () => {
        const update = buildAccessRulesUpdate(
            { ...baseValues, passwordEnabled: true, accessPassword: '' },
            { isSlugLocked: false }
        );
        expect(update).not.toHaveProperty('access_password');
    });

    it('serializes dates as ISO strings, null when absent', () => {
        const update = buildAccessRulesUpdate(
            {
                ...baseValues,
                startDate: '2026-01-01T00:00',
                endDate: null,
            },
            { isSlugLocked: false }
        );
        expect(update.start_date).toBe(new Date('2026-01-01T00:00').toISOString());
        expect(update.end_date).toBeNull();
    });
});
