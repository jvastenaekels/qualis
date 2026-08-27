import { afterEach, describe, expect, it } from 'vitest';
import { migrateLegacyStorage } from './migrateLegacyStorage';

const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
const originalSessionStorage = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');

function restoreStorage(): void {
    if (originalLocalStorage) {
        Object.defineProperty(globalThis, 'localStorage', originalLocalStorage);
    }
    if (originalSessionStorage) {
        Object.defineProperty(globalThis, 'sessionStorage', originalSessionStorage);
    }
}

describe('migrateLegacyStorage', () => {
    afterEach(() => {
        restoreStorage();
    });

    it('does not throw when localStorage methods are unavailable', () => {
        Object.defineProperty(globalThis, 'localStorage', {
            configurable: true,
            value: {
                get length() {
                    throw new Error('storage unavailable');
                },
            },
        });
        Object.defineProperty(globalThis, 'sessionStorage', {
            configurable: true,
            value: {
                get length() {
                    throw new Error('storage unavailable');
                },
            },
        });

        expect(() => migrateLegacyStorage()).not.toThrow();
    });

    it('keeps the legacy key when writing the migrated key fails', () => {
        localStorage.clear();
        sessionStorage.clear();
        localStorage.setItem('libre-q-session', 'legacy');

        const storage = localStorage;
        const originalSetItem = storage.setItem.bind(storage);
        Object.defineProperty(globalThis, 'localStorage', {
            configurable: true,
            value: {
                get length() {
                    return storage.length;
                },
                key: storage.key.bind(storage),
                getItem: storage.getItem.bind(storage),
                removeItem: storage.removeItem.bind(storage),
                setItem(key: string, value: string) {
                    if (key === 'qualis-session') throw new Error('quota exceeded');
                    originalSetItem(key, value);
                },
            },
        });

        expect(() => migrateLegacyStorage()).not.toThrow();
        expect(localStorage.getItem('libre-q-session')).toBe('legacy');
        expect(localStorage.getItem('qualis-session')).toBeNull();
    });
});
