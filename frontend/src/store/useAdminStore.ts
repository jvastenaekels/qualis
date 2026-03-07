import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { safeLocalStorage } from './safeStorage';

interface AdminState {
    activeProjectId: number | null;
    activeStudyId: string | null;
    lastVisitedStudySlug: string | null;
    sidebarOpen: boolean;
    setActiveProject: (id: number | null) => void;
    setActiveStudy: (id: string | null) => void;
    setSidebarOpen: (open: boolean) => void;
    toggleSidebar: () => void;
}

export const useAdminStore = create<AdminState>()(
    persist(
        (set) => ({
            activeProjectId: null,
            activeStudyId: null,
            lastVisitedStudySlug: null,
            sidebarOpen: true,
            setActiveProject: (id) => set({ activeProjectId: id }),
            setActiveStudy: (id) =>
                set((state) => ({
                    activeStudyId: id,
                    lastVisitedStudySlug: id ?? state.lastVisitedStudySlug,
                })),
            setSidebarOpen: (open) => set({ sidebarOpen: open }),
            toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
        }),
        {
            name: 'admin-storage',
            storage: safeLocalStorage,
            version: 2,
            migrate: (persistedState: unknown, version: number) => {
                const state = persistedState as Record<string, unknown>;
                if (version < 2) {
                    if ('activeWorkspaceId' in state) {
                        state.activeProjectId = state.activeWorkspaceId;
                        delete state.activeWorkspaceId;
                    }
                }
                return state as unknown as AdminState;
            },
            partialize: (state) => ({
                activeProjectId: state.activeProjectId,
                activeStudyId: state.activeStudyId,
                lastVisitedStudySlug: state.lastVisitedStudySlug,
                sidebarOpen: state.sidebarOpen,
            }),
        }
    )
);
