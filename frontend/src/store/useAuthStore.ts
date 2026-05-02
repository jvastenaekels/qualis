import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { safeSessionStorage } from './safeStorage';
import type { QuotaInfo } from '@/api/model/quotaInfo';

interface Project {
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
        full_name?: string | null;
        is_superuser: boolean;
        owned_project_quota?: QuotaInfo | null;
    } | null;
    projects: Project[];
    currentProject: Project | null;
    setAuth: (token: string, user: AuthState['user']) => void;
    setProjects: (projects: Project[]) => void;
    setCurrentProject: (project: Project | null) => void;
    setOwnedProjectQuota: (quota: QuotaInfo | null | undefined) => void;
    logout: () => void;
}

export const useAuthStore = create<AuthState>()(
    persist(
        (set) => ({
            token: null,
            user: null,
            projects: [],
            currentProject: null,
            setAuth: (token, user) => set({ token, user }),
            setProjects: (projects) => set({ projects }),
            setCurrentProject: (currentProject) => set({ currentProject }),
            setOwnedProjectQuota: (quota) =>
                set((state) => ({
                    user: state.user ? { ...state.user, owned_project_quota: quota } : null,
                })),
            logout: () =>
                set({
                    token: null,
                    user: null,
                    projects: [],
                    currentProject: null,
                }),
        }),
        {
            name: 'admin-auth-storage',
            version: 2,
            storage: safeSessionStorage,
            migrate: (persistedState: unknown, version: number) => {
                const state = persistedState as Record<string, unknown>;
                if (version < 2) {
                    if ('workspaces' in state) {
                        state.projects = state.workspaces;
                        delete state.workspaces;
                    }
                    if ('currentWorkspace' in state) {
                        state.currentProject = state.currentWorkspace;
                        delete state.currentWorkspace;
                    }
                }
                return state as unknown as AuthState;
            },
        }
    )
);
