/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { customInstance } from './mutator';

// No mock for ./client here, we will verify reportBug via its fetch calls

describe('customInstance', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('should perform a successful GET request', async () => {
        const mockResponse = { data: 'test' };
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: true,
                status: 200,
                json: async () => mockResponse,
            })
        );

        const _result = await customInstance({ url: '/test', method: 'GET' });
        expect(fetch).toHaveBeenCalledWith(
            expect.stringContaining('/test'),
            expect.objectContaining({
                method: 'GET',
            })
        );
    });

    it('should handle query params', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: true,
                status: 200,
                json: async () => ({}),
            })
        );

        await customInstance({
            url: '/test',
            method: 'GET',
            params: { foo: 'bar', baz: undefined },
        });
        expect(fetch).toHaveBeenCalledWith(expect.stringContaining('foo=bar'), expect.anything());
        expect(fetch).not.toHaveBeenCalledWith(expect.stringContaining('baz'), expect.anything());
    });

    it('should send JSON body', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: true,
                status: 200,
                json: async () => ({}),
            })
        );

        const data = { foo: 'bar' };
        await customInstance({ url: '/test', method: 'POST', data });
        expect(fetch).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                body: JSON.stringify(data),
                headers: expect.objectContaining({
                    'Content-Type': 'application/json',
                }),
            })
        );
    });

    it('should throw ApiError on failure', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: false,
                status: 400,
                text: async () => 'Bad Request',
            })
        );

        await expect(customInstance({ url: '/test', method: 'GET' })).rejects.toThrow(
            'Bad Request'
        );
    });

    it('should auto-report 500 errors', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: false,
                status: 500,
                text: async () => 'Internal Server Error',
            })
        );

        try {
            await customInstance({ url: '/test', method: 'GET' });
        } catch (_e) {
            // Expected
        }

        expect(fetch).toHaveBeenCalledWith(
            expect.stringContaining('/api/logs'),
            expect.objectContaining({
                method: 'POST',
                body: expect.stringContaining('Server Error 500'),
            })
        );
    });

    it('should return empty object for 204 No Content', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: true,
                status: 204,
            })
        );

        const result = await customInstance({ url: '/test', method: 'GET' });
        expect(result).toEqual({});
    });
});

describe('customInstance: 401 redirect reason', () => {
    // The /admin cold path used to bounce visitors to
    // /login?reason=session_expired even when no session ever existed.
    // Distinguish prior-token (session_expired) from cold (auth_required).

    let setHrefSpy: ReturnType<typeof vi.fn>;

    beforeEach(async () => {
        const { useAuthStore } = await import('@/store/useAuthStore');
        useAuthStore.setState({ token: null });

        // Stub window.location with a writable href so we can observe the redirect
        // without actually navigating during tests.
        setHrefSpy = vi.fn();
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: {
                pathname: '/somewhere',
                get href() {
                    return '';
                },
                set href(v: string) {
                    setHrefSpy(v);
                },
            },
        });
    });

    afterEach(async () => {
        vi.unstubAllGlobals();
        const { useAuthStore } = await import('@/store/useAuthStore');
        useAuthStore.setState({ token: null });
    });

    it('uses reason=auth_required when no prior token existed', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: false,
                status: 401,
                text: async () => '{"message": "Not authenticated"}',
            })
        );

        try {
            await customInstance({ url: '/api/me', method: 'GET' });
        } catch (_e) {
            // Expected: ApiError
        }

        expect(setHrefSpy).toHaveBeenCalledWith(expect.stringContaining('reason=auth_required'));
    });

    it('uses reason=session_expired when a token was present', async () => {
        const { useAuthStore } = await import('@/store/useAuthStore');
        useAuthStore.setState({ token: 'tok-xyz' });

        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: false,
                status: 401,
                text: async () => '{"message": "Token expired"}',
            })
        );

        try {
            await customInstance({ url: '/api/me', method: 'GET' });
        } catch (_e) {
            // Expected
        }

        expect(setHrefSpy).toHaveBeenCalledWith(expect.stringContaining('reason=session_expired'));
    });
});
