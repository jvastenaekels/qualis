import { beforeEach, describe, expect, it } from 'vitest';
import { useAuthStore } from './useAuthStore';

interface Project {
    id: number;
    title: string;
    slug: string;
    user_role: string;
}

const INITIAL_STATE = {
    token: null,
    user: null,
    projects: [] as Project[],
    currentProject: null,
};

const mockUser = {
    id: 1,
    email: 'researcher@example.com',
    full_name: 'Alice Researcher',
    is_superuser: false,
};

const superUser = {
    id: 2,
    email: 'admin@example.com',
    full_name: null,
    is_superuser: true,
};

const projectA: Project = { id: 10, title: 'Project Alpha', slug: 'alpha', user_role: 'owner' };
const projectB: Project = { id: 20, title: 'Project Beta', slug: 'beta', user_role: 'viewer' };

describe('useAuthStore', () => {
    beforeEach(() => {
        useAuthStore.setState(INITIAL_STATE);
        sessionStorage.clear();
    });

    describe('initial state', () => {
        it('has no token, no user, empty projects, no currentProject', () => {
            const state = useAuthStore.getState();
            expect(state.token).toBeNull();
            expect(state.user).toBeNull();
            expect(state.projects).toEqual([]);
            expect(state.currentProject).toBeNull();
        });
    });

    describe('setAuth', () => {
        it('stores token and user', () => {
            useAuthStore.getState().setAuth('tok-abc', mockUser);
            const state = useAuthStore.getState();
            expect(state.token).toBe('tok-abc');
            expect(state.user).toEqual(mockUser);
        });

        it('overwrites a previous token and user when called again', () => {
            useAuthStore.getState().setAuth('tok-old', mockUser);
            useAuthStore.getState().setAuth('tok-new', superUser);
            const state = useAuthStore.getState();
            expect(state.token).toBe('tok-new');
            expect(state.user).toEqual(superUser);
        });

        it('does not clear projects or currentProject', () => {
            useAuthStore.setState({ projects: [projectA], currentProject: projectA });
            useAuthStore.getState().setAuth('tok-abc', mockUser);
            const state = useAuthStore.getState();
            expect(state.projects).toEqual([projectA]);
            expect(state.currentProject).toEqual(projectA);
        });

        it('accepts a user with optional full_name omitted', () => {
            const userNoName = { id: 3, email: 'anon@example.com', is_superuser: false };
            useAuthStore.getState().setAuth('tok-x', userNoName);
            expect(useAuthStore.getState().user).toEqual(userNoName);
        });
    });

    describe('setProjects', () => {
        it('stores a list of projects', () => {
            useAuthStore.getState().setProjects([projectA, projectB]);
            expect(useAuthStore.getState().projects).toEqual([projectA, projectB]);
        });

        it('replaces existing projects with a new list', () => {
            useAuthStore.getState().setProjects([projectA, projectB]);
            useAuthStore.getState().setProjects([projectB]);
            expect(useAuthStore.getState().projects).toEqual([projectB]);
        });

        it('accepts an empty list to clear projects', () => {
            useAuthStore.getState().setProjects([projectA]);
            useAuthStore.getState().setProjects([]);
            expect(useAuthStore.getState().projects).toEqual([]);
        });
    });

    describe('setCurrentProject', () => {
        it('sets the active project', () => {
            useAuthStore.getState().setCurrentProject(projectA);
            expect(useAuthStore.getState().currentProject).toEqual(projectA);
        });

        it('switches between projects correctly', () => {
            useAuthStore.getState().setCurrentProject(projectA);
            useAuthStore.getState().setCurrentProject(projectB);
            expect(useAuthStore.getState().currentProject).toEqual(projectB);
        });

        it('clears currentProject when passed null', () => {
            useAuthStore.getState().setCurrentProject(projectA);
            useAuthStore.getState().setCurrentProject(null);
            expect(useAuthStore.getState().currentProject).toBeNull();
        });

        it('does not affect token or user', () => {
            useAuthStore.getState().setAuth('tok-abc', mockUser);
            useAuthStore.getState().setCurrentProject(projectB);
            expect(useAuthStore.getState().token).toBe('tok-abc');
            expect(useAuthStore.getState().user).toEqual(mockUser);
        });
    });

    describe('logout', () => {
        it('clears token, user, projects, and currentProject', () => {
            useAuthStore.getState().setAuth('tok-abc', mockUser);
            useAuthStore.getState().setProjects([projectA, projectB]);
            useAuthStore.getState().setCurrentProject(projectA);

            useAuthStore.getState().logout();

            const state = useAuthStore.getState();
            expect(state.token).toBeNull();
            expect(state.user).toBeNull();
            expect(state.projects).toEqual([]);
            expect(state.currentProject).toBeNull();
        });

        it('is idempotent — calling logout twice does not throw', () => {
            useAuthStore.getState().logout();
            useAuthStore.getState().logout();
            const state = useAuthStore.getState();
            expect(state.token).toBeNull();
        });
    });

    describe('persist rehydration (sessionStorage)', () => {
        it('recovers persisted auth state from sessionStorage on rehydrate', async () => {
            const persisted = {
                state: {
                    token: 'saved-token',
                    user: mockUser,
                    projects: [projectA],
                    currentProject: projectA,
                },
                version: 2,
            };
            sessionStorage.setItem('admin-auth-storage', JSON.stringify(persisted));
            await useAuthStore.persist.rehydrate();
            const state = useAuthStore.getState();
            expect(state.token).toBe('saved-token');
            expect(state.user).toEqual(mockUser);
            expect(state.projects).toEqual([projectA]);
            expect(state.currentProject).toEqual(projectA);
        });

        it('migrates v1 state (workspaces → projects, currentWorkspace → currentProject)', async () => {
            const legacyPersisted = {
                state: {
                    token: 'old-token',
                    user: mockUser,
                    workspaces: [projectA],
                    currentWorkspace: projectA,
                },
                version: 1,
            };
            sessionStorage.setItem('admin-auth-storage', JSON.stringify(legacyPersisted));
            await useAuthStore.persist.rehydrate();
            const state = useAuthStore.getState();
            expect(state.projects).toEqual([projectA]);
            expect(state.currentProject).toEqual(projectA);
        });

        it('starts with null token after sessionStorage is cleared', async () => {
            sessionStorage.clear();
            await useAuthStore.persist.rehydrate();
            expect(useAuthStore.getState().token).toBeNull();
        });
    });

    describe('realistic auth sequence', () => {
        it('full login → project selection → logout flow', () => {
            // Arrive unauthenticated
            expect(useAuthStore.getState().token).toBeNull();

            // Login
            useAuthStore.getState().setAuth('tok-session', mockUser);
            useAuthStore.getState().setProjects([projectA, projectB]);

            // Select a project
            useAuthStore.getState().setCurrentProject(projectB);
            expect(useAuthStore.getState().currentProject?.id).toBe(20);

            // Switch project
            useAuthStore.getState().setCurrentProject(projectA);
            expect(useAuthStore.getState().currentProject?.id).toBe(10);

            // Logout resets everything
            useAuthStore.getState().logout();
            const final = useAuthStore.getState();
            expect(final.token).toBeNull();
            expect(final.user).toBeNull();
            expect(final.projects).toEqual([]);
            expect(final.currentProject).toBeNull();
        });
    });
});
