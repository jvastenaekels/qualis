import { describe, expect, it } from 'vitest';
import { resolveApiErrorKey } from './error-utils';

describe('resolveApiErrorKey', () => {
    it('maps known codes (in `code` field) to i18n keys', () => {
        expect(
            resolveApiErrorKey({
                code: 'MEMBER_LIMIT_REACHED',
                message: 'Project member limit reached (5/5).',
            })
        ).toEqual({
            key: 'errors.member_limit_reached',
            fallback: 'Project member limit reached (5/5).',
        });
    });

    it('falls back to `message` field when code does not match', () => {
        // OWNER_ROLE_IMMUTABLE pattern: code=error, message=OWNER_ROLE_IMMUTABLE
        expect(
            resolveApiErrorKey({
                code: 'error',
                message: 'OWNER_ROLE_IMMUTABLE',
            })
        ).toEqual({
            key: 'errors.owner_role_immutable',
            fallback: 'OWNER_ROLE_IMMUTABLE',
        });
    });

    it('returns null key for unknown codes', () => {
        expect(resolveApiErrorKey({ code: 'UNKNOWN' })).toEqual({
            key: null,
            fallback: 'UNKNOWN',
        });
    });

    it('returns generic fallback when no fields are present', () => {
        expect(resolveApiErrorKey({})).toEqual({
            key: null,
            fallback: 'An error occurred.',
        });
    });

    it('maps OWNER_PROJECT_LIMIT_REACHED in code field', () => {
        expect(
            resolveApiErrorKey({
                code: 'OWNER_PROJECT_LIMIT_REACHED',
                message: 'You have reached the project creation limit.',
            })
        ).toEqual({
            key: 'errors.owner_project_limit_reached',
            fallback: 'You have reached the project creation limit.',
        });
    });

    it('handles undefined payload gracefully', () => {
        expect(resolveApiErrorKey(undefined)).toEqual({
            key: null,
            fallback: 'An error occurred.',
        });
    });
});
