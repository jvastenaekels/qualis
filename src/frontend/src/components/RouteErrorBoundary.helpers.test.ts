import { describe, it, expect } from 'vitest';
import { ApiError } from '../api/client';
import {
    classifyRouteError,
    shouldCaptureRouteError,
    shouldThrottleChunkReload,
} from './RouteErrorBoundary.helpers';

const noStorage = () => null;

describe('shouldCaptureRouteError', () => {
    it('captures non-route errors', () => {
        expect(shouldCaptureRouteError(new Error('boom'))).toBe(true);
        expect(shouldCaptureRouteError('boom')).toBe(true);
    });

    it('does NOT capture 4xx route responses (404 etc.)', () => {
        const r404 = { status: 404, statusText: 'Not Found', data: null, internal: false };
        expect(shouldCaptureRouteError(r404)).toBe(false);
    });

    it('captures 5xx route responses', () => {
        const r500 = { status: 500, statusText: 'Server Error', data: null, internal: false };
        expect(shouldCaptureRouteError(r500)).toBe(true);
    });
});

describe('classifyRouteError', () => {
    it('detects route-response (non-ApiError) and extracts status + message', () => {
        const r = { status: 404, statusText: 'Not Found', data: null, internal: false };
        const c = classifyRouteError(r, noStorage, 1000);
        expect(c.kind).toBe('route-response');
        if (c.kind === 'route-response') {
            expect(c.status).toBe(404);
            expect(c.message).toBe('Not Found');
        }
    });

    it('detects api-error', () => {
        const c = classifyRouteError(new ApiError(403, 'Forbidden'), noStorage, 1000);
        expect(c.kind).toBe('api-error');
    });

    it('detects chunk-reload from "Failed to fetch dynamically imported module"', () => {
        const e = new Error('Failed to fetch dynamically imported module: chunk-X.js');
        const c = classifyRouteError(e, () => '500', 1000);
        expect(c.kind).toBe('chunk-reload');
        if (c.kind === 'chunk-reload') {
            expect(c.storageKey).toBe('chunk_load_error_reload');
            expect(c.now).toBe(1000);
            expect(c.lastReload).toBe('500');
        }
    });

    it('detects chunk-reload from "Importing a module script failed"', () => {
        const e = new Error('Importing a module script failed.');
        const c = classifyRouteError(e, noStorage, 1000);
        expect(c.kind).toBe('chunk-reload');
    });

    it('classifies a plain Error not matching chunk-reload', () => {
        const c = classifyRouteError(new Error('something else'), noStorage, 1000);
        expect(c.kind).toBe('plain-error');
    });

    it('classifies a non-Error non-route value as unknown', () => {
        expect(classifyRouteError('plain string', noStorage, 1000).kind).toBe('unknown');
        expect(classifyRouteError(null, noStorage, 1000).kind).toBe('unknown');
    });
});

describe('shouldThrottleChunkReload', () => {
    it('returns false when no prior reload', () => {
        expect(shouldThrottleChunkReload(null, 1000)).toBe(false);
    });

    it('returns false when lastReload is non-numeric', () => {
        expect(shouldThrottleChunkReload('abc', 1000)).toBe(false);
    });

    it('returns true when within the throttle window (default 10s)', () => {
        expect(shouldThrottleChunkReload('5000', 9000)).toBe(true); // 4s ago
    });

    it('returns false when outside the throttle window', () => {
        expect(shouldThrottleChunkReload('5000', 16000)).toBe(false); // 11s ago
    });

    it('respects custom windowMs', () => {
        expect(shouldThrottleChunkReload('1000', 4000, 5000)).toBe(true);
        expect(shouldThrottleChunkReload('1000', 7000, 5000)).toBe(false);
    });
});
