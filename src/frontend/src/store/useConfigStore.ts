import { create } from 'zustand';
import type { StudyConfig } from '../schemas/study';

interface ConfigState {
    config: StudyConfig | null;
    isLoading: boolean;
    error: string | null;
    refetchTag: number;
    /** A test is running and the designer's draft has moved on since it began. */
    designChanged: boolean;

    setConfig: (config: StudyConfig) => void;
    setLoading: (loading: boolean) => void;
    setError: (error: string | null) => void;
    setDesignChanged: (changed: boolean) => void;
    triggerRefetch: () => void;
    resetConfig: () => void;
}

export const useConfigStore = create<ConfigState>((set) => ({
    config: null,
    isLoading: false,
    error: null,
    refetchTag: 0,
    designChanged: false,

    setConfig: (config) =>
        set({
            config: config ? { ...config, grid_config: config.grid_config ?? [] } : config,
            isLoading: false,
            error: null,
        }),
    setLoading: (isLoading) => set({ isLoading }),
    setError: (error) => set({ error, isLoading: false }),
    setDesignChanged: (designChanged) => set({ designChanged }),
    triggerRefetch: () => set((state) => ({ refetchTag: state.refetchTag + 1 })),
    resetConfig: () => set({ config: null, error: null, isLoading: false }),
}));
