import { describe, expect, it } from 'vitest';
import { createSessionToken, hashConsent } from './browserCrypto';

describe('browserCrypto fallbacks', () => {
    it('creates a valid UUID v4 when randomUUID is unavailable', () => {
        const descriptor = Object.getOwnPropertyDescriptor(crypto, 'randomUUID');
        Object.defineProperty(crypto, 'randomUUID', { configurable: true, value: undefined });
        try {
            expect(createSessionToken()).toMatch(
                /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
            );
        } finally {
            if (descriptor) Object.defineProperty(crypto, 'randomUUID', descriptor);
        }
    });

    it('computes the expected SHA-256 hash when subtle crypto is unavailable', async () => {
        const descriptor = Object.getOwnPropertyDescriptor(crypto, 'subtle');
        Object.defineProperty(crypto, 'subtle', { configurable: true, value: undefined });
        try {
            await expect(hashConsent('Consent Description')).resolves.toBe(
                '58b9f8519f523beacb42907d94320c732d820bd0cd443cbe3f838a5aa0e486c2'
            );
        } finally {
            if (descriptor) Object.defineProperty(crypto, 'subtle', descriptor);
        }
    });
});
