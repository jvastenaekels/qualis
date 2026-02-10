import { createJSONStorage } from 'zustand/middleware';

/**
 * Creates a Storage wrapper that catches errors from localStorage/sessionStorage.
 * Prevents crashes in private browsing mode or when storage quota is exceeded.
 */
function createSafeStorage(getStorage: () => Storage): Storage {
    return {
        get length() {
            try {
                return getStorage().length;
            } catch {
                return 0;
            }
        },
        clear() {
            try {
                getStorage().clear();
            } catch {}
        },
        getItem(name: string): string | null {
            try {
                return getStorage().getItem(name);
            } catch {
                return null;
            }
        },
        key(index: number): string | null {
            try {
                return getStorage().key(index);
            } catch {
                return null;
            }
        },
        removeItem(name: string): void {
            try {
                getStorage().removeItem(name);
            } catch {}
        },
        setItem(name: string, value: string): void {
            try {
                getStorage().setItem(name, value);
            } catch {
                console.warn(`Storage quota exceeded or unavailable for "${name}"`);
            }
        },
    };
}

export const safeLocalStorage = createJSONStorage(() => createSafeStorage(() => localStorage));

export const safeSessionStorage = createJSONStorage(() => createSafeStorage(() => sessionStorage));
