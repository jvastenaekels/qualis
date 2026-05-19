/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

/**
 * Single source of truth for recovering from stale dynamic-import (code-split
 * chunk) failures after a deployment.
 *
 * Before this, three call sites (main.tsx global listeners,
 * ErrorBoundary.componentDidCatch, RouteErrorBoundary) each implemented their
 * own reload throttle with two different sessionStorage keys and two
 * different policies. They raced each other and, when throttled, fell through
 * to a terminal ErrorPage with no further reload — leaving the user on a
 * frozen page until they manually refreshed.
 *
 * Policy: allow up to MAX_RELOADS automatic reloads within a rolling
 * WINDOW_MS window. The window is keyed off the first failure's timestamp;
 * once it elapses the counter is treated as fresh, so a *later* deploy's
 * first failure always self-heals (no reliance on a success/`window.load`
 * clear, which never fired on SPA navigation). Only genuine repeated
 * failures inside the window are declared `exhausted` — the caller then
 * renders a recoverable error page instead of looping forever.
 */

export const CHUNK_RELOAD_KEY = 'qualis.chunkReload';
const WINDOW_MS = 20_000;
const MAX_RELOADS = 2;

const CHUNK_ERROR_NEEDLES = [
    'Failed to fetch dynamically imported module',
    'Importing a module script failed',
    'error loading dynamically imported module',
    'Unable to preload CSS',
    'Loading chunk',
    'Loading CSS chunk',
    'NetworkError when attempting to fetch resource',
];

/** True when `input` looks like a stale code-split chunk / dynamic-import failure. */
export function isChunkLoadError(input: unknown): boolean {
    const msg = typeof input === 'string' ? input : input instanceof Error ? input.message : '';
    if (!msg) return false;
    return CHUNK_ERROR_NEEDLES.some((needle) => msg.includes(needle));
}

interface StorageLike {
    getItem: (key: string) => string | null;
    setItem: (key: string, value: string) => void;
    removeItem: (key: string) => void;
}

interface RecoverDeps {
    storage: StorageLike;
    now: number;
    reload: () => void;
}

export type ChunkRecoveryResult = 'not-chunk-error' | 'reloading' | 'exhausted';

interface Attempts {
    count: number;
    firstAt: number;
}

function readAttempts(storage: StorageLike, now: number): Attempts {
    try {
        const raw = storage.getItem(CHUNK_RELOAD_KEY);
        if (raw) {
            const parsed = JSON.parse(raw) as Partial<Attempts>;
            if (
                typeof parsed.count === 'number' &&
                typeof parsed.firstAt === 'number' &&
                now - parsed.firstAt <= WINDOW_MS
            ) {
                return { count: parsed.count, firstAt: parsed.firstAt };
            }
        }
    } catch {
        // Corrupt entry — fall through to a fresh window.
    }
    return { count: 0, firstAt: now };
}

/**
 * Handle a possible chunk-load error. Returns:
 * - `not-chunk-error` — caller should handle the error normally.
 * - `reloading` — a hard reload was triggered; caller should bail out
 *   (return null / stop rendering).
 * - `exhausted` — too many reloads within the window; caller should render a
 *   recoverable error page (do NOT reload again).
 */
export function recoverFromChunkError(
    input: unknown,
    { storage, now, reload }: RecoverDeps
): ChunkRecoveryResult {
    if (!isChunkLoadError(input)) return 'not-chunk-error';

    const { count, firstAt } = readAttempts(storage, now);
    if (count >= MAX_RELOADS) return 'exhausted';

    storage.setItem(
        CHUNK_RELOAD_KEY,
        JSON.stringify({ count: count + 1, firstAt } satisfies Attempts)
    );
    reload();
    return 'reloading';
}
