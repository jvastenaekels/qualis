import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isChunkLoadError, recoverFromChunkError, CHUNK_RELOAD_KEY } from './chunkReload';

function memStorage(initial: Record<string, string> = {}) {
    const m = new Map<string, string>(Object.entries(initial));
    return {
        getItem: (k: string) => m.get(k) ?? null,
        setItem: (k: string, v: string) => void m.set(k, v),
        removeItem: (k: string) => void m.delete(k),
        _dump: () => Object.fromEntries(m),
    };
}

describe('isChunkLoadError', () => {
    it('matches Vite/Rollup dynamic-import failure messages', () => {
        expect(isChunkLoadError('Failed to fetch dynamically imported module: /assets/x.js')).toBe(
            true
        );
        expect(isChunkLoadError(new Error('Importing a module script failed'))).toBe(true);
        expect(isChunkLoadError('error loading dynamically imported module')).toBe(true);
        expect(isChunkLoadError('Unable to preload CSS for /assets/y.css')).toBe(true);
    });

    it('does not match unrelated errors', () => {
        expect(isChunkLoadError('TypeError: x is not a function')).toBe(false);
        expect(isChunkLoadError(undefined)).toBe(false);
        expect(isChunkLoadError(null)).toBe(false);
        expect(isChunkLoadError({ nope: true })).toBe(false);
    });
});

describe('recoverFromChunkError', () => {
    let reload: ReturnType<typeof vi.fn>;
    beforeEach(() => {
        reload = vi.fn();
    });

    it('passes through non-chunk errors without touching storage or reloading', () => {
        const storage = memStorage();
        const r = recoverFromChunkError('TypeError: boom', { storage, now: 1000, reload });
        expect(r).toBe('not-chunk-error');
        expect(reload).not.toHaveBeenCalled();
        expect(storage._dump()).toEqual({});
    });

    it('first chunk error → reloads and records {count:1, firstAt:now}', () => {
        const storage = memStorage();
        const r = recoverFromChunkError('Failed to fetch dynamically imported module', {
            storage,
            now: 5000,
            reload,
        });
        expect(r).toBe('reloading');
        expect(reload).toHaveBeenCalledTimes(1);
        expect(JSON.parse(storage._dump()[CHUNK_RELOAD_KEY])).toEqual({ count: 1, firstAt: 5000 });
    });

    it('second error within the window → reloads again, count increments, firstAt preserved', () => {
        const storage = memStorage({
            [CHUNK_RELOAD_KEY]: JSON.stringify({ count: 1, firstAt: 5000 }),
        });
        const r = recoverFromChunkError('Importing a module script failed', {
            storage,
            now: 9000, // within 20s window
            reload,
        });
        expect(r).toBe('reloading');
        expect(reload).toHaveBeenCalledTimes(1);
        expect(JSON.parse(storage._dump()[CHUNK_RELOAD_KEY])).toEqual({ count: 2, firstAt: 5000 });
    });

    it('exceeding MAX reloads within the window → exhausted, NO reload (no infinite loop)', () => {
        const storage = memStorage({
            [CHUNK_RELOAD_KEY]: JSON.stringify({ count: 2, firstAt: 5000 }),
        });
        const r = recoverFromChunkError('Failed to fetch dynamically imported module', {
            storage,
            now: 15000, // still within 20s window
            reload,
        });
        expect(r).toBe('exhausted');
        expect(reload).not.toHaveBeenCalled();
    });

    it('window expiry resets the counter → a later failure self-heals (reloads fresh)', () => {
        const storage = memStorage({
            [CHUNK_RELOAD_KEY]: JSON.stringify({ count: 2, firstAt: 5000 }),
        });
        const r = recoverFromChunkError('Failed to fetch dynamically imported module', {
            storage,
            now: 5000 + 25000, // > 20s after firstAt → stale, treat as fresh
            reload,
        });
        expect(r).toBe('reloading');
        expect(reload).toHaveBeenCalledTimes(1);
        expect(JSON.parse(storage._dump()[CHUNK_RELOAD_KEY])).toEqual({ count: 1, firstAt: 30000 });
    });

    it('corrupt storage is treated as a fresh window (still recovers)', () => {
        const storage = memStorage({ [CHUNK_RELOAD_KEY]: '{not json' });
        const r = recoverFromChunkError('Failed to fetch dynamically imported module', {
            storage,
            now: 42,
            reload,
        });
        expect(r).toBe('reloading');
        expect(JSON.parse(storage._dump()[CHUNK_RELOAD_KEY])).toEqual({ count: 1, firstAt: 42 });
    });
});
