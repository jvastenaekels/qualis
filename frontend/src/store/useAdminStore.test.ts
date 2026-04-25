import { beforeEach, describe, expect, it } from 'vitest';
import { useAdminStore } from './useAdminStore';

const INITIAL_STATE = {
    activeProjectId: null,
    activeStudyId: null,
    lastVisitedStudySlug: null,
    sidebarOpen: true,
};

describe('useAdminStore', () => {
    beforeEach(() => {
        useAdminStore.setState(INITIAL_STATE);
        localStorage.clear();
    });

    describe('initial state', () => {
        it('has the expected default values', () => {
            const state = useAdminStore.getState();
            expect(state.activeProjectId).toBeNull();
            expect(state.activeStudyId).toBeNull();
            expect(state.lastVisitedStudySlug).toBeNull();
            expect(state.sidebarOpen).toBe(true);
        });
    });

    describe('setActiveProject', () => {
        it('sets activeProjectId to a number', () => {
            useAdminStore.getState().setActiveProject(42);
            expect(useAdminStore.getState().activeProjectId).toBe(42);
        });

        it('sets activeProjectId back to null', () => {
            useAdminStore.getState().setActiveProject(42);
            useAdminStore.getState().setActiveProject(null);
            expect(useAdminStore.getState().activeProjectId).toBeNull();
        });

        it('does not touch other state slices', () => {
            useAdminStore.setState({ activeStudyId: 'study-abc', sidebarOpen: false });
            useAdminStore.getState().setActiveProject(7);
            const state = useAdminStore.getState();
            expect(state.activeStudyId).toBe('study-abc');
            expect(state.sidebarOpen).toBe(false);
        });
    });

    describe('setActiveStudy', () => {
        it('sets activeStudyId and records it as lastVisitedStudySlug', () => {
            useAdminStore.getState().setActiveStudy('my-study');
            const state = useAdminStore.getState();
            expect(state.activeStudyId).toBe('my-study');
            expect(state.lastVisitedStudySlug).toBe('my-study');
        });

        it('preserves lastVisitedStudySlug when activeStudyId is cleared to null', () => {
            useAdminStore.getState().setActiveStudy('previous-study');
            useAdminStore.getState().setActiveStudy(null);
            const state = useAdminStore.getState();
            expect(state.activeStudyId).toBeNull();
            // lastVisitedStudySlug must retain the last non-null value
            expect(state.lastVisitedStudySlug).toBe('previous-study');
        });

        it('updates lastVisitedStudySlug when switching between studies', () => {
            useAdminStore.getState().setActiveStudy('study-1');
            useAdminStore.getState().setActiveStudy('study-2');
            expect(useAdminStore.getState().lastVisitedStudySlug).toBe('study-2');
        });

        it('does not touch activeProjectId', () => {
            useAdminStore.getState().setActiveProject(99);
            useAdminStore.getState().setActiveStudy('some-study');
            expect(useAdminStore.getState().activeProjectId).toBe(99);
        });
    });

    describe('setSidebarOpen', () => {
        it('sets sidebarOpen to false', () => {
            useAdminStore.getState().setSidebarOpen(false);
            expect(useAdminStore.getState().sidebarOpen).toBe(false);
        });

        it('sets sidebarOpen back to true', () => {
            useAdminStore.setState({ sidebarOpen: false });
            useAdminStore.getState().setSidebarOpen(true);
            expect(useAdminStore.getState().sidebarOpen).toBe(true);
        });
    });

    describe('toggleSidebar', () => {
        it('flips sidebarOpen from true to false', () => {
            useAdminStore.setState({ sidebarOpen: true });
            useAdminStore.getState().toggleSidebar();
            expect(useAdminStore.getState().sidebarOpen).toBe(false);
        });

        it('flips sidebarOpen from false to true', () => {
            useAdminStore.setState({ sidebarOpen: false });
            useAdminStore.getState().toggleSidebar();
            expect(useAdminStore.getState().sidebarOpen).toBe(true);
        });

        it('double-toggle returns to original state', () => {
            const initial = useAdminStore.getState().sidebarOpen;
            useAdminStore.getState().toggleSidebar();
            useAdminStore.getState().toggleSidebar();
            expect(useAdminStore.getState().sidebarOpen).toBe(initial);
        });
    });

    describe('persist rehydration (localStorage)', () => {
        it('recovers persisted state from localStorage on rehydrate', async () => {
            const persisted = {
                state: {
                    activeProjectId: 5,
                    activeStudyId: 'hydrated-study',
                    lastVisitedStudySlug: 'hydrated-study',
                    sidebarOpen: false,
                },
                version: 2,
            };
            localStorage.setItem('admin-storage', JSON.stringify(persisted));
            await useAdminStore.persist.rehydrate();
            const state = useAdminStore.getState();
            expect(state.activeProjectId).toBe(5);
            expect(state.activeStudyId).toBe('hydrated-study');
            expect(state.lastVisitedStudySlug).toBe('hydrated-study');
            expect(state.sidebarOpen).toBe(false);
        });

        it('migrates v1 state (activeWorkspaceId → activeProjectId) on rehydrate', async () => {
            const legacyPersisted = {
                state: {
                    activeWorkspaceId: 99,
                    activeStudyId: null,
                    lastVisitedStudySlug: null,
                    sidebarOpen: true,
                },
                version: 1,
            };
            localStorage.setItem('admin-storage', JSON.stringify(legacyPersisted));
            await useAdminStore.persist.rehydrate();
            const state = useAdminStore.getState();
            expect(state.activeProjectId).toBe(99);
        });
    });
});
