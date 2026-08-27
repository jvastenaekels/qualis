import { afterEach, describe, expect, it } from 'vitest';
import { safeBrowserLocalStorage } from './safeStorage';

const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

function restoreLocalStorage(): void {
    if (originalLocalStorage) {
        Object.defineProperty(globalThis, 'localStorage', originalLocalStorage);
    }
}

describe('safeBrowserLocalStorage', () => {
    afterEach(() => {
        restoreLocalStorage();
    });

    it('swallows unavailable localStorage reads and writes', () => {
        Object.defineProperty(globalThis, 'localStorage', {
            configurable: true,
            get() {
                throw new Error('storage unavailable');
            },
        });

        expect(safeBrowserLocalStorage.getItem('missing')).toBeNull();
        expect(() => safeBrowserLocalStorage.setItem('key', 'value')).not.toThrow();
        expect(() => safeBrowserLocalStorage.removeItem('key')).not.toThrow();
    });
});
