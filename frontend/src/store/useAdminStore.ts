import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AdminState {
    activeWorkspaceId: number | null;
    activeStudyId: string | null;
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
            sidebarOpen: true,
            setActiveWorkspace: (id) => set({ activeWorkspaceId: id }),
            setActiveStudy: (id) => set({ activeStudyId: id }),
            setSidebarOpen: (open) => set({ sidebarOpen: open }),
            toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
        }),
        {
            name: 'admin-storage',
            partialize: (state) => ({
                activeWorkspaceId: state.activeWorkspaceId,
                activeStudyId: state.activeStudyId,
                sidebarOpen: state.sidebarOpen,
            }),
        }
    )
);
