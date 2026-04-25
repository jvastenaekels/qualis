/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
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
