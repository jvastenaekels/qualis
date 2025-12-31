import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useStudyConfig } from './useStudyConfig';
import { useConfigStore } from '../store/useConfigStore';
import { useSessionStore } from '../store/useSessionStore';
import { applyStudyOverrides } from '../utils/i18nOverrides';
import { useGetStudyConfig } from './useGetStudyConfig';

// Mock the query hook
vi.mock('./useGetStudyConfig', () => ({
    useGetStudyConfig: vi.fn(),
}));

// Mock the i18n overrides utility
vi.mock('../utils/i18nOverrides', () => ({
    applyStudyOverrides: vi.fn(),
    resetBaseLocales: vi.fn(),
}));

// Mock i18n instance methods for tracking
vi.mock('../i18n', () => ({
    default: {
        changeLanguage: vi.fn(),
        language: 'en',
    },
}));

// Mock react-router-dom
vi.mock('react-router-dom', () => ({
    useParams: () => ({ slug: 'test-study' }),
    useLocation: () => ({ pathname: '/study/test-study/welcome' }),
}));

describe('useStudyConfig', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Reset Stores
        useConfigStore.getState().resetConfig();
        useSessionStore.getState().resetSession();
    });

    it('fetches study config on mount', async () => {
        const mockData = {
            slug: 'test-study',
            title: 'Test Title EN',
            description: 'Test Description EN',
            instructions: 'Test Instructions EN',
            presort_config: {},
            statements: [],
        };

        // Mock hook response
        vi.mocked(useGetStudyConfig).mockReturnValue({
            data: mockData,
            isLoading: false,
            error: null,
            refetch: vi.fn(),
        } as any);

        renderHook(() => useStudyConfig());

        await waitFor(() => {
            expect(useConfigStore.getState().config?.title).toBe('Test Title EN');
        });
    });

    it('applies UI overrides when present in config', async () => {
        const uiLabels = { 'common.agree': 'Approve' };
        const mockData = {
            slug: 'test-study',
            title: 'Test Title',
            description: 'Desc',
            instructions: 'Instr',
            presort_config: {},
            statements: [],
            ui_labels: uiLabels,
            language: 'en',
        };

        vi.mocked(useGetStudyConfig).mockReturnValue({
            data: mockData,
            isLoading: false,
            error: null,
            refetch: vi.fn(),
        } as any);

        renderHook(() => useStudyConfig());

        await waitFor(() => {
            expect(applyStudyOverrides).toHaveBeenCalledWith('en', uiLabels);
        });
    });
    it('handles API errors (e.g. 404/500) gracefully', async () => {
        const error = new Error('Not Found');
        vi.mocked(useGetStudyConfig).mockReturnValue({
            data: undefined,
            isLoading: false,
            error: error,
            refetch: vi.fn(),
        } as any);

        renderHook(() => useStudyConfig());

        await waitFor(() => {
            // Check if error state is updated in the store
            // Note: useStudyConfig primarily sets the config.
            // If useGetStudyConfig returns an error, it's typically handled by the component usage
            // (checking `error` returned by the hook or store).
            // Let's verify standard behavior: if error, config remains null/empty or error is logged?
            // Actually, looking at useStudyConfig implementation:
            // It relies on useGetStudyConfig.
            // If the store is not updated, that's expected.
            // But we should verify it DOES NOT update with invalid data.
            const cfg = useConfigStore.getState().config;
            expect(cfg).toBeNull();
        });
    });
});
