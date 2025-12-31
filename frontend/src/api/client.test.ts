import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { reportBug, ApiError } from './client';
import { server } from '../test/server';

// Mock global fetch
const fetchMock = vi.fn();

const createMockResponse = (overrides: Partial<Response> = {}) => ({
    ok: true,
    status: 200,
    text: async () => '',
    json: async () => ({}),
    clone: function () {
        return { ...this };
    },
    ...overrides,
});

describe('API Client', () => {
    beforeAll(() => {
        // Disable MSW for this test suite to rely on manual fetch mocking
        server.close();
    });

    afterAll(() => {
        // Restore MSW (though Vitest isolation usually handles this)
        server.listen();
    });

    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubGlobal('fetch', fetchMock);

        // Default happy path for log reporting
        fetchMock.mockImplementation((url: string | Request) => {
            if (typeof url === 'string' && url.includes('/api/logs')) {
                return Promise.resolve(createMockResponse());
            }
            return Promise.resolve(createMockResponse());
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('reportBug', () => {
        it('should send a POST request to /api/logs', async () => {
            const error = new Error('Test Error');
            await reportBug(error, { extra: 'context' });

            const calls = fetchMock.mock.calls;
            const logCall = calls.find(
                (call) => typeof call[0] === 'string' && call[0].includes('/api/logs')
            );

            expect(logCall).toBeDefined();
            expect(logCall![1]).toEqual(
                expect.objectContaining({
                    method: 'POST',
                    body: expect.stringContaining('Test Error'),
                })
            );
        });

        it('should NOT report errors originating from /api/logs to prevent recursion', async () => {
            const recursiveError = new Error('Failed to fetch /api/logs');
            await reportBug(recursiveError);

            expect(fetchMock).not.toHaveBeenCalled();
        });

        it('should gracefully handle reporting failures', async () => {
            fetchMock.mockRejectedValueOnce(new Error('Network Error'));
            const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

            await reportBug('some error');

            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('Failed to report bug'),
                expect.any(Error)
            );
            consoleSpy.mockRestore();
        });
    });

    describe('ApiError', () => {
        it('should correctly capture status and message', () => {
            const error = new ApiError(404, 'Not Found');
            expect(error.status).toBe(404);
            expect(error.message).toBe('Not Found');
            expect(error.name).toBe('ApiError');
        });
    });
});
