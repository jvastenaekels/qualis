import { describe, expect, it } from 'vitest';
import { resolveApiErrorKey } from './error-utils';

describe('resolveApiErrorKey', () => {
    it('maps known codes (in `code` field) to i18n keys', () => {
        expect(
            resolveApiErrorKey({
                code: 'OWNER_ROLE_IMMUTABLE',
                message: 'The owner role cannot be changed.',
            })
        ).toEqual({
            key: 'errors.owner_role_immutable',
            fallback: 'The owner role cannot be changed.',
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

    it('handles undefined payload gracefully', () => {
        expect(resolveApiErrorKey(undefined)).toEqual({
            key: null,
            fallback: 'An error occurred.',
        });
    });
});
