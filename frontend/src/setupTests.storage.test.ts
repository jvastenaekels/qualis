import { describe, expect, it } from 'vitest';

describe('test storage setup', () => {
    it('exposes localStorage through the browser global', () => {
        localStorage.setItem('qualis-storage-smoke', 'ok');

        expect(window.localStorage.getItem('qualis-storage-smoke')).toBe('ok');
    });

    it('exposes sessionStorage through the browser global', () => {
        sessionStorage.setItem('qualis-storage-smoke', 'ok');

        expect(window.sessionStorage.getItem('qualis-storage-smoke')).toBe('ok');
    });
});
