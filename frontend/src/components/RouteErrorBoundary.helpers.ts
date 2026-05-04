import { isRouteErrorResponse } from 'react-router-dom';
import { ApiError } from '../api/client';

/**
 * Whether Sentry should capture this route error. 4xx route errors (404, etc.)
 * are expected user-facing flows; only 5xx and unknown errors warrant a report.
 */
export function shouldCaptureRouteError(error: unknown): boolean {
    if (!isRouteErrorResponse(error)) return true;
    return error.status >= 500;
}

/** Classification used by RouteErrorBoundary to render the right page. */
export type RouteErrorClassification =
    | { kind: 'route-response'; status: number; message: string }
    | { kind: 'api-error'; error: ApiError }
    | { kind: 'chunk-reload'; storageKey: string; now: number; lastReload: string | null }
    | { kind: 'plain-error'; error: Error }
    | { kind: 'unknown' };

/**
 * Classify an unknown route error into a render decision. The "chunk-reload"
 * variant signals that the caller should also check whether the reload is
 * within a 10s throttle window before triggering window.location.reload().
 */
export function classifyRouteError(
    error: unknown,
    storageGetter: (key: string) => string | null,
    now: number
): RouteErrorClassification {
    if (isRouteErrorResponse(error)) {
        return {
            kind: 'route-response',
            status: error.status,
            message: error.statusText || error.data?.detail || 'Route error',
        };
    }
    if (error instanceof ApiError) {
        return { kind: 'api-error', error };
    }
    if (error instanceof Error) {
        if (
            error.message.includes('Failed to fetch dynamically imported module') ||
            error.message.includes('Importing a module script failed')
        ) {
            const storageKey = 'chunk_load_error_reload';
            return {
                kind: 'chunk-reload',
                storageKey,
                now,
                lastReload: storageGetter(storageKey),
            };
        }
        return { kind: 'plain-error', error };
    }
    return { kind: 'unknown' };
}

/**
 * Returns true when the chunk-load reload should be throttled (i.e. we
 * already attempted one within the last 10 seconds — don't loop).
 */
export function shouldThrottleChunkReload(
    lastReload: string | null,
    now: number,
    windowMs = 10000
): boolean {
    if (!lastReload) return false;
    const parsed = Number.parseInt(lastReload, 10);
    if (Number.isNaN(parsed)) return false;
    return now - parsed <= windowMs;
}
