import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface Workspace {
    id: number;
    title: string;
    slug: string;
    user_role: string;
}

interface AuthState {
    token: string | null;
    user: {
        id: number;
        email: string;
        is_superuser: boolean;
    } | null;
    workspaces: Workspace[];
    currentWorkspace: Workspace | null;
    setAuth: (token: string, user: AuthState['user']) => void;
    setWorkspaces: (workspaces: Workspace[]) => void;
    setCurrentWorkspace: (workspace: Workspace | null) => void;
    logout: () => void;
}

export const useAuthStore = create<AuthState>()(
    persist(
        (set) => ({
            token: null,
            user: null,
            workspaces: [],
            currentWorkspace: null,
            setAuth: (token, user) => set({ token, user }),
            setWorkspaces: (workspaces) => set({ workspaces }),
            setCurrentWorkspace: (currentWorkspace) => set({ currentWorkspace }),
            logout: () =>
                set({
                    token: null,
                    user: null,
                    workspaces: [],
                    currentWorkspace: null,
                }),
        }),
        {
            name: 'admin-auth-storage',
            version: 1,
        }
    )
);
