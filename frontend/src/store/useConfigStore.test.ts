import { beforeEach, describe, expect, it } from 'vitest';
import type { StudyConfig } from '../schemas/study';
import { useConfigStore } from './useConfigStore';

const mockConfig: StudyConfig = {
    slug: 'test-study',
    title: 'Test Study',
    description: 'A test study',
    instructions: 'Please sort',
    statements: [],
    grid_config: [],
    presort_config: {},
    show_statement_codes: false,
};

describe('useConfigStore', () => {
    beforeEach(() => {
        useConfigStore.getState().resetConfig();
    });

    it('should have initial state', () => {
        const state = useConfigStore.getState();
        expect(state.config).toBeNull();
        expect(state.isLoading).toBe(false);
        expect(state.error).toBeNull();
        expect(state.refetchTag).toBe(0);
    });

    it('should set config and clear loading/error', () => {
        // Setup initial dirty state
        useConfigStore.setState({ isLoading: true, error: 'some error' });

        useConfigStore.getState().setConfig(mockConfig);

        const state = useConfigStore.getState();
        expect(state.config).toEqual(mockConfig);
        expect(state.isLoading).toBe(false);
        expect(state.error).toBeNull();
    });

    it('should set loading state', () => {
        useConfigStore.getState().setLoading(true);
        expect(useConfigStore.getState().isLoading).toBe(true);

        useConfigStore.getState().setLoading(false);
        expect(useConfigStore.getState().isLoading).toBe(false);
    });

    it('should set error and clear loading', () => {
        useConfigStore.setState({ isLoading: true });

        useConfigStore.getState().setError('Failed to fetch');

        const state = useConfigStore.getState();
        expect(state.error).toBe('Failed to fetch');
        expect(state.isLoading).toBe(false);
    });

    it('should trigger refetch by incrementing refetchTag', () => {
        const initialTag = useConfigStore.getState().refetchTag;

        useConfigStore.getState().triggerRefetch();

        expect(useConfigStore.getState().refetchTag).toBe(initialTag + 1);
    });

    it('should reset config to initial state', () => {
        useConfigStore.setState({
            config: mockConfig,
            error: 'old error',
            isLoading: true,
        });

        useConfigStore.getState().resetConfig();

        const state = useConfigStore.getState();
        expect(state.config).toBeNull();
        expect(state.error).toBeNull();
        expect(state.isLoading).toBe(false);
        // refetchTag should persist or be unaffected? The implementation does not reset it.
        // Let's verify refetchTag is NOT reset by resetConfig based on code reading.
    });
});
