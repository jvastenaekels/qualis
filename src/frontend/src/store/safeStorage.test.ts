import { afterEach, describe, expect, it, vi } from 'vitest';
import { safeBrowserLocalStorage, studyScopedLocalStorage } from './safeStorage';

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

describe('studyScopedLocalStorage', () => {
    const value = (state: object) => ({ state, version: 2 });

    afterEach(() => {
        window.history.pushState({}, '', '/');
        localStorage.clear();
    });

    it('isolates two studies', () => {
        window.history.pushState({}, '', '/study/a/presort');
        studyScopedLocalStorage?.setItem('qualis-session', value({ studySlug: 'a' }));
        expect(localStorage.getItem('qualis-session:a')).not.toBeNull();

        window.history.pushState({}, '', '/study/b/presort');
        expect(studyScopedLocalStorage?.getItem('qualis-session')).toBeNull();
    });

    it('keeps the bare key outside a study route', () => {
        studyScopedLocalStorage?.setItem('qualis-session', value({ studySlug: null }));
        expect(localStorage.getItem('qualis-session')).not.toBeNull();
    });

    it('removes only the current study entry', () => {
        localStorage.setItem('qualis-session:a', '{}');
        localStorage.setItem('qualis-session:b', '{}');
        window.history.pushState({}, '', '/study/a/reset');
        studyScopedLocalStorage?.removeItem('qualis-session');
        expect(localStorage.getItem('qualis-session:a')).toBeNull();
        expect(localStorage.getItem('qualis-session:b')).not.toBeNull();
    });

    it('falls back to the legacy key for the same study', () => {
        localStorage.setItem(
            'qualis-session',
            JSON.stringify(value({ studySlug: 'a', token: 't' }))
        );
        window.history.pushState({}, '', '/study/a/fine-sort');
        expect(studyScopedLocalStorage?.getItem('qualis-session')).toEqual(
            value({ studySlug: 'a', token: 't' })
        );
    });

    it('ignores the legacy key of another study', () => {
        localStorage.setItem('qualis-session', JSON.stringify(value({ studySlug: 'a' })));
        window.history.pushState({}, '', '/study/b/fine-sort');
        expect(studyScopedLocalStorage?.getItem('qualis-session')).toBeNull();
    });

    it('lets the legacy responses entry follow the legacy session entry', () => {
        localStorage.setItem('qualis-session', JSON.stringify(value({ studySlug: 'a' })));
        localStorage.setItem('qualis-responses', JSON.stringify(value({ agree: [1] })));
        window.history.pushState({}, '', '/study/a/fine-sort');
        expect(studyScopedLocalStorage?.getItem('qualis-responses')).toEqual(value({ agree: [1] }));
        window.history.pushState({}, '', '/study/b/fine-sort');
        expect(studyScopedLocalStorage?.getItem('qualis-responses')).toBeNull();
    });

    it('scrubs the adopted bare entries on the first write', () => {
        localStorage.setItem(
            'qualis-session',
            JSON.stringify(value({ studySlug: 'a', token: 't' }))
        );
        localStorage.setItem('qualis-responses', JSON.stringify(value({ agree: [1] })));
        window.history.pushState({}, '', '/study/a/fine-sort');
        studyScopedLocalStorage?.setItem('qualis-session', value({ studySlug: 'a', token: 'u' }));
        expect(localStorage.getItem('qualis-session')).toBeNull();
        expect(localStorage.getItem('qualis-responses')).toBeNull();
        expect(JSON.parse(localStorage.getItem('qualis-session:a') ?? '{}')).toEqual(
            value({ studySlug: 'a', token: 'u' })
        );
    });

    it('carries the legacy answers forward when the session store writes first', () => {
        localStorage.setItem('qualis-session', JSON.stringify(value({ studySlug: 'a' })));
        localStorage.setItem('qualis-responses', JSON.stringify(value({ agree: [1] })));
        window.history.pushState({}, '', '/study/a/fine-sort');
        studyScopedLocalStorage?.setItem('qualis-session', value({ studySlug: 'a', token: 'u' }));
        expect(JSON.parse(localStorage.getItem('qualis-responses:a') ?? '{}')).toEqual(
            value({ agree: [1] })
        );
        expect(localStorage.getItem('qualis-session')).toBeNull();
        expect(localStorage.getItem('qualis-responses')).toBeNull();
    });

    it('leaves the bare entries of another study untouched', () => {
        localStorage.setItem('qualis-session', JSON.stringify(value({ studySlug: 'b' })));
        localStorage.setItem('qualis-responses', JSON.stringify(value({ agree: [1] })));
        window.history.pushState({}, '', '/study/a/fine-sort');
        studyScopedLocalStorage?.setItem('qualis-session', value({ studySlug: 'a' }));
        studyScopedLocalStorage?.setItem('qualis-responses', value({ agree: [2] }));
        expect(localStorage.getItem('qualis-session')).not.toBeNull();
        expect(localStorage.getItem('qualis-responses')).not.toBeNull();
    });

    it('scrubs the pilot bare entries too', () => {
        localStorage.setItem('qualis-pilot-session', JSON.stringify(value({ studySlug: 'a' })));
        localStorage.setItem('qualis-pilot-responses', JSON.stringify(value({ agree: [1] })));
        window.history.pushState({}, '', '/study/a/presort');
        studyScopedLocalStorage?.setItem('qualis-pilot-responses', value({ agree: [1] }));
        expect(localStorage.getItem('qualis-pilot-session')).toBeNull();
        expect(localStorage.getItem('qualis-pilot-responses')).toBeNull();
    });

    it('still migrates both stores from legacy entries at module init', async () => {
        localStorage.setItem(
            'qualis-session',
            JSON.stringify({ state: { studySlug: 'a', token: 't' }, version: 2 })
        );
        localStorage.setItem(
            'qualis-responses',
            JSON.stringify({ state: { cards: [], agree: [7] }, version: 2 })
        );
        window.history.pushState({}, '', '/study/a/fine-sort');
        vi.resetModules();
        const { useSessionStore } = await import('./useSessionStore');
        const { useResponseStore } = await import('./useResponseStore');
        expect(useSessionStore.getState().token).toBe('t');
        expect(useResponseStore.getState().agree).toEqual([7]);
    });
});
