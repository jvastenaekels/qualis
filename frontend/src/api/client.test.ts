import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { get, post, reportBug, ApiError } from './client';
import { server } from '../tests/server';

// Mock global fetch
const fetchMock = vi.fn();

const createMockResponse = (overrides: Partial<Response> = {}) => ({
    ok: true,
    status: 200,
    text: async () => '',
    json: async () => ({}),
    clone: function() { return { ...this }; },
    ...overrides
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
            const logCall = calls.find((call) => typeof call[0] === 'string' && call[0].includes('/api/logs'));
            
            expect(logCall).toBeDefined();
            expect(logCall![1]).toEqual(expect.objectContaining({
                method: 'POST',
                body: expect.stringContaining('Test Error'),
            }));
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
            
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to report bug'), expect.any(Error));
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

    describe('get/post', () => {
        it('should throw ApiError on non-200 response', async () => {
            fetchMock.mockResolvedValueOnce(createMockResponse({
                ok: false,
                status: 400,
                text: async () => 'Bad Request',
            }));

            await expect(get('/test')).rejects.toThrow(ApiError);
        });

        it('should automatically report bug on 500 server error', async () => {
             fetchMock.mockResolvedValueOnce(createMockResponse({
                ok: false,
                status: 500,
                text: async () => 'Internal Server Error',
            }));

            // We expect the original call to throw
            await expect(get('/crash')).rejects.toThrow('Internal Server Error');

            // AND we expect a side-effect call to reportBug (/api/logs)
            await vi.waitFor(() => {
                expect(fetchMock).toHaveBeenCalledTimes(2); // 1. /crash, 2. /api/logs
            });

            // AND we expect a side-effect call to reportBug (/api/logs)
            await vi.waitFor(() => {
                const calls = fetchMock.mock.calls;
                const logCall = calls.find((call) => typeof call[0] === 'string' && call[0].includes('/api/logs'));
                expect(logCall).toBeDefined();
                expect(logCall![1]).toEqual(expect.objectContaining({
                    body: expect.stringContaining('Server Error 500')
                }));
            });
        });

        it('should NOT report bug on 404 client error', async () => {
             fetchMock.mockResolvedValueOnce(createMockResponse({
                ok: false,
                status: 404,
                text: async () => 'Not Found',
            }));

            await expect(get('/missing')).rejects.toThrow('Not Found');
            
            // Should NOT trigger log reporting for client errors
            expect(fetchMock).toHaveBeenCalledTimes(1); 
        });

        it('should successfully handle GET requests', async () => {
            const mockData = { id: 1 };
            fetchMock.mockResolvedValueOnce(createMockResponse({
                json: async () => mockData
            }));

            const result = await get('/data');
            expect(result).toEqual(mockData);
        });

        it('should throw ApiError and report on 500 during POST', async () => {
            fetchMock.mockResolvedValueOnce(createMockResponse({
                ok: false,
                status: 500,
                text: async () => 'Server Crash',
            }));

            await expect(post('/submit', {})).rejects.toThrow('Server Crash');
            
            await vi.waitFor(() => {
                const calls = fetchMock.mock.calls;
                const logCall = calls.find((call) => typeof call[0] === 'string' && call[0].includes('/api/logs'));
                expect(logCall).toBeDefined();
            });
        });

        it('should successfully handle POST requests', async () => {
            const mockData = { result: 'ok' };
            fetchMock.mockResolvedValueOnce(createMockResponse({
                json: async () => mockData
            }));

            const result = await post('/submit', { foo: 'bar' });
            expect(result).toEqual(mockData);
            expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/submit'), expect.objectContaining({
                method: 'POST',
                body: JSON.stringify({ foo: 'bar' })
            }));
        });
    });
});
