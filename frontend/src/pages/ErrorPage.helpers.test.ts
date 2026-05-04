import { describe, it, expect } from 'vitest';
import type { TFunction } from 'i18next';
import { ApiError } from '../api/client';
import { computeErrorDisplay } from './ErrorPage.helpers';

const t = ((key: string, fallback?: string) => fallback ?? key) as unknown as TFunction;

describe('computeErrorDisplay', () => {
    it('explicit propTitle takes priority', () => {
        const c = computeErrorDisplay({
            propTitle: 'Custom Title',
            hasOnRetry: false,
            t,
        });
        expect(c.title).toBe('Custom Title');
        expect(c.iconKey).toBe('AlertTriangle');
        expect(c.showHome).toBe(true);
        expect(c.showRetry).toBe(false);
    });

    it('explicit propMessage with onRetry shows retry button', () => {
        const c = computeErrorDisplay({
            propMessage: 'oops',
            hasOnRetry: true,
            t,
        });
        expect(c.message).toBe('oops');
        expect(c.showRetry).toBe(true);
    });

    it('ApiError validation_error → validationErrors populated', () => {
        const err = new ApiError(422, 'Validation Error', 'validation_error', [
            { loc: ['body', 'email'], msg: 'invalid email' },
        ]);
        const c = computeErrorDisplay({ error: err, hasOnRetry: false, t });
        expect(c.validationErrors).toHaveLength(1);
        expect(c.validationErrors?.[0]?.msg).toBe('invalid email');
        expect(c.iconKey).toBe('AlertTriangle');
        expect(c.showRetry).toBe(true);
    });

    it('ApiError 404 → AlertOctagon icon, home button, no retry', () => {
        const err = new ApiError(404, 'Not Found');
        const c = computeErrorDisplay({ error: err, hasOnRetry: false, t });
        expect(c.iconKey).toBe('AlertOctagon');
        expect(c.showHome).toBe(true);
        expect(c.showRetry).toBe(false);
    });

    it('ApiError 429 → RefreshCcw + retry', () => {
        const err = new ApiError(429, 'Too Many Requests');
        const c = computeErrorDisplay({ error: err, hasOnRetry: false, t });
        expect(c.iconKey).toBe('RefreshCcw');
        expect(c.showRetry).toBe(true);
    });

    it('ApiError 408 → WifiOff + retry', () => {
        const err = new ApiError(408, 'Timeout');
        const c = computeErrorDisplay({ error: err, hasOnRetry: false, t });
        expect(c.iconKey).toBe('WifiOff');
        expect(c.showRetry).toBe(true);
    });

    it('ApiError code=conflict → AlertTriangle + retry', () => {
        const err = new ApiError(409, 'Conflict', 'conflict');
        const c = computeErrorDisplay({ error: err, hasOnRetry: false, t });
        expect(c.iconKey).toBe('AlertTriangle');
        expect(c.showRetry).toBe(true);
    });

    it('network error message → WifiOff', () => {
        const c = computeErrorDisplay({
            error: new Error('Failed to fetch'),
            hasOnRetry: false,
            t,
        });
        expect(c.iconKey).toBe('WifiOff');
    });

    it('"network" substring in message → WifiOff', () => {
        const c = computeErrorDisplay({
            error: new Error('Network connection lost'),
            hasOnRetry: false,
            t,
        });
        expect(c.iconKey).toBe('WifiOff');
    });

    it('fallback (generic crash) shows reset + home', () => {
        const c = computeErrorDisplay({
            error: new Error('Boom'),
            hasOnRetry: false,
            t,
        });
        expect(c.iconKey).toBe('AlertTriangle');
        expect(c.showReset).toBe(true);
        expect(c.showHome).toBe(true);
        expect(c.message).toBe('Boom');
    });

    it('fallback uses unknown-error message when error.message is empty', () => {
        const e = new Error();
        const c = computeErrorDisplay({ error: e, hasOnRetry: false, t });
        expect(c.message).toBe('common.errors.unknown');
    });

    it('hasOnRetry forwards to fallback case', () => {
        const c = computeErrorDisplay({
            error: new Error('Boom'),
            hasOnRetry: true,
            t,
        });
        expect(c.showRetry).toBe(true);
    });
});
