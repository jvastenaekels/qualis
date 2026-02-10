import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { safeLocalStorage } from './safeStorage';

interface AdminState {
    activeWorkspaceId: number | null;
    activeStudyId: string | null;
    lastVisitedStudySlug: string | null;
    sidebarOpen: boolean;
    setActiveWorkspace: (id: number | null) => void;
    setActiveStudy: (id: string | null) => void;
    setSidebarOpen: (open: boolean) => void;
    toggleSidebar: () => void;
}

export const useAdminStore = create<AdminState>()(
    persist(
        (set) => ({
            activeWorkspaceId: null,
            activeStudyId: null,
            lastVisitedStudySlug: null,
            sidebarOpen: true,
            setActiveWorkspace: (id) => set({ activeWorkspaceId: id }),
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
            partialize: (state) => ({
                activeWorkspaceId: state.activeWorkspaceId,
                activeStudyId: state.activeStudyId,
                lastVisitedStudySlug: state.lastVisitedStudySlug,
                sidebarOpen: state.sidebarOpen,
            }),
        }
    )
);
