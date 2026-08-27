import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminService } from './admin';
import { useAuthStore } from '../store/useAuthStore';

// Mock global fetch
const fetchMock = vi.fn();

const createMockResponse = (overrides: Partial<Response> = {}) => ({
    ok: true,
    status: 200,
    blob: async () => new Blob(['test data']),
    json: async () => ({}),
    ...overrides,
});

describe('AdminService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubGlobal('fetch', fetchMock);

        // Mock auth store
        useAuthStore.setState({ token: 'test-token' });
    });

    it('exportParticipantCSV should call the correct endpoint', async () => {
        fetchMock.mockResolvedValue(createMockResponse());

        const slug = 'test-study';
        const participantId = 123;
        const result = await AdminService.exportParticipantCSV(slug, participantId);

        expect(fetchMock).toHaveBeenCalledWith(
            `/api/admin/studies/${slug}/participants/${participantId}/export/csv`,
            expect.objectContaining({
                headers: {
                    Authorization: 'Bearer test-token',
                },
            })
        );
        expect(result).toBeInstanceOf(Blob);
    });

    it('exportParticipantCSV should throw error on failure', async () => {
        fetchMock.mockResolvedValue(createMockResponse({ ok: false }));

        await expect(AdminService.exportParticipantCSV('slug', 1)).rejects.toThrow(
            'Failed to export participant CSV'
        );
    });

    it('exportParticipantJSON should call the correct endpoint', async () => {
        fetchMock.mockResolvedValue(createMockResponse());

        const slug = 'test-study';
        const participantId = 123;
        const result = await AdminService.exportParticipantJSON(slug, participantId);

        expect(fetchMock).toHaveBeenCalledWith(
            `/api/admin/studies/${slug}/participants/${participantId}/export/json`,
            expect.objectContaining({
                headers: {
                    Authorization: 'Bearer test-token',
                },
            })
        );
        expect(result).toEqual({});
    });

    it('exportParticipantJSON should throw error on failure', async () => {
        fetchMock.mockResolvedValue(createMockResponse({ ok: false }));

        await expect(AdminService.exportParticipantJSON('slug', 1)).rejects.toThrow(
            'Failed to export participant JSON'
        );
    });
});
