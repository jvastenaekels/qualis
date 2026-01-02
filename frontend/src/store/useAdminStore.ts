import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AdminState {
    activeStudyId: string | null;
    sidebarOpen: boolean;
    setActiveStudy: (id: string | null) => void;
    setSidebarOpen: (open: boolean) => void;
    toggleSidebar: () => void;
}

export const useAdminStore = create<AdminState>()(
    persist(
        (set) => ({
            activeStudyId: null,
            sidebarOpen: true,
            setActiveStudy: (id) => set({ activeStudyId: id }),
            setSidebarOpen: (open) => set({ sidebarOpen: open }),
            toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
        }),
        {
            name: 'admin-storage',
            partialize: (state) => ({
                activeStudyId: state.activeStudyId,
                sidebarOpen: state.sidebarOpen,
            }),
        }
    )
);
