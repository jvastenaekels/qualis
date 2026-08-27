import { create } from 'zustand';
import type { StudyConfig } from '../schemas/study';

interface ConfigState {
    config: StudyConfig | null;
    isLoading: boolean;
    error: string | null;
    refetchTag: number;

    setConfig: (config: StudyConfig) => void;
    setLoading: (loading: boolean) => void;
    setError: (error: string | null) => void;
    triggerRefetch: () => void;
    resetConfig: () => void;
}

export const useConfigStore = create<ConfigState>((set) => ({
    config: null,
    isLoading: false,
    error: null,
    refetchTag: 0,

    setConfig: (config) =>
        set({
            config: config ? { ...config, grid_config: config.grid_config ?? [] } : config,
            isLoading: false,
            error: null,
        }),
    setLoading: (isLoading) => set({ isLoading }),
    setError: (error) => set({ error, isLoading: false }),
    triggerRefetch: () => set((state) => ({ refetchTag: state.refetchTag + 1 })),
    resetConfig: () => set({ config: null, error: null, isLoading: false }),
}));
