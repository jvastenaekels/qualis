import { createJSONStorage, type StateStorage } from 'zustand/middleware';

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

export const safeBrowserLocalStorage = createSafeStorage(() => localStorage);
export const safeBrowserSessionStorage = createSafeStorage(() => sessionStorage);

export const safeLocalStorage = createJSONStorage(() => safeBrowserLocalStorage);

export const safeSessionStorage = createJSONStorage(() => safeBrowserSessionStorage);

const currentStudySlug = (): string | null =>
    /^\/study\/([^/]+)/.exec(window.location.pathname)?.[1] ?? null;

const scopedKey = (name: string, slug: string | null): string => (slug ? `${name}:${slug}` : name);

function storedStudySlug(raw: string | null): unknown {
    if (!raw) return null;
    try {
        return JSON.parse(raw)?.state?.studySlug ?? null;
    } catch {
        return null;
    }
}

// One key per study, so two tabs on two studies do not overwrite each other. Outside a
// /study/:slug route the key stays the bare name.
const studyScopedStateStorage: StateStorage = {
    getItem(name) {
        const slug = currentStudySlug();
        const scoped = safeBrowserLocalStorage.getItem(scopedKey(name, slug));
        if (scoped !== null || !slug) return scoped;
        // Migration fallback: a pre-scoping entry belongs to this study only if it says so. The
        // responses entry carries no studySlug; it was always written with the session entry
        // (qualis[-pilot]-session), which does.
        const legacy = safeBrowserLocalStorage.getItem(name);
        const owner =
            storedStudySlug(legacy) ??
            storedStudySlug(safeBrowserLocalStorage.getItem(name.replace(/responses$/, 'session')));
        return owner === slug ? legacy : null;
    },
    setItem(name, value) {
        const slug = currentStudySlug();
        safeBrowserLocalStorage.setItem(scopedKey(name, slug), value);
        if (!slug) return;
        // The scoped key now holds this study's state: scrub the adopted bare entries so a
        // previous participant's token, resume code and answers do not linger on the device.
        const prefix = name.replace(/(session|responses)$/, '');
        const bareSession = `${prefix}session`;
        if (storedStudySlug(safeBrowserLocalStorage.getItem(bareSession)) === slug) {
            safeBrowserLocalStorage.removeItem(bareSession);
            safeBrowserLocalStorage.removeItem(`${prefix}responses`);
        }
    },
    removeItem: (name) => safeBrowserLocalStorage.removeItem(scopedKey(name, currentStudySlug())),
};

export const studyScopedLocalStorage = createJSONStorage(() => studyScopedStateStorage);
