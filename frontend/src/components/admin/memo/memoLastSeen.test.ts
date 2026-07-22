import { afterEach, describe, expect, it } from 'vitest';
import { bumpLastSeen, getLastSeen } from './memoLastSeen';

const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

function restoreLocalStorage(): void {
    if (originalLocalStorage) {
        Object.defineProperty(globalThis, 'localStorage', originalLocalStorage);
    }
}

describe('memoLastSeen', () => {
    afterEach(() => {
        restoreLocalStorage();
    });

    it('falls back to epoch when localStorage is unavailable', () => {
        Object.defineProperty(globalThis, 'localStorage', {
            configurable: true,
            get() {
                throw new Error('storage unavailable');
            },
        });

        expect(getLastSeen(1, 'study', 42)).toBe('1970-01-01T00:00:00Z');
    });

    it('does not throw when bumping last-seen fails', () => {
        Object.defineProperty(globalThis, 'localStorage', {
            configurable: true,
            get() {
                throw new Error('storage unavailable');
            },
        });

        expect(() => bumpLastSeen(1, 'study', 42)).not.toThrow();
    });
});
