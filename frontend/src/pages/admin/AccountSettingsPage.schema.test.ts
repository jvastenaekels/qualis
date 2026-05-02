import { describe, it, expect } from 'vitest';
import { makeProfileSchema, makePasswordSchema } from './ProfilePage';

const t = (_key: string, fallback: string) => fallback;

describe('ProfilePage zod schemas', () => {
    describe('profileSchema', () => {
        const schema = makeProfileSchema(t);

        it('accepts a valid profile', () => {
            const result = schema.safeParse({ email: 'a@b.io', full_name: 'Ada Lovelace' });
            expect(result.success).toBe(true);
        });

        it('rejects an empty full_name', () => {
            const result = schema.safeParse({ email: 'a@b.io', full_name: '' });
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.issues[0]?.message).toBe('Full name is required');
                expect(result.error.issues[0]?.path).toEqual(['full_name']);
            }
        });

        it('accepts an undefined email (disabled field)', () => {
            const result = schema.safeParse({ full_name: 'Ada' });
            expect(result.success).toBe(true);
        });
    });

    describe('passwordSchema', () => {
        const schema = makePasswordSchema(t);

        it('accepts a valid password change', () => {
            const result = schema.safeParse({
                current_password: 'oldpass',
                new_password: 'longenough',
            });
            expect(result.success).toBe(true);
        });

        it('rejects an empty current_password', () => {
            const result = schema.safeParse({
                current_password: '',
                new_password: 'longenough',
            });
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.issues[0]?.message).toBe('Required');
                expect(result.error.issues[0]?.path).toEqual(['current_password']);
            }
        });

        it('rejects a new_password shorter than 8 characters', () => {
            const result = schema.safeParse({
                current_password: 'oldpass',
                new_password: 'short',
            });
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.issues[0]?.message).toBe('Min 8 characters');
                expect(result.error.issues[0]?.path).toEqual(['new_password']);
            }
        });
    });
});
