/**
 * Tests for CommandMenu component
 *
 * Verifies keyboard shortcut handling, navigation actions,
 * and contextual study actions.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CommandMenu } from './CommandMenu';
import { MemoryRouter } from 'react-router-dom';

// Mock dependencies
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return {
        ...actual,
        useNavigate: () => mockNavigate,
    };
});

vi.mock('sonner', () => ({
    toast: {
        success: vi.fn(),
    },
}));

vi.mock('@/store/useAdminStore', () => ({
    useAdminStore: vi.fn(() => ({
        activeStudyId: 'test-study',
        activeWorkspaceId: 1,
        setActiveWorkspace: vi.fn(),
        setActiveStudy: vi.fn(),
    })),
}));

vi.mock('@/store/useAuthStore', () => ({
    useAuthStore: vi.fn((selector) => {
        const state = {
            logout: vi.fn(),
        };
        return selector ? selector(state) : state;
    }),
}));

vi.mock('@/api/generated', () => ({
    useListStudiesApiAdminStudiesGet: vi.fn(() => ({
        data: [
            { slug: 'study-1', workspace_id: 1 },
            { slug: 'study-2', workspace_id: 1 },
            { slug: 'study-3', workspace_id: 2 },
        ],
    })),
    useListWorkspacesApiAdminWorkspacesGet: vi.fn(() => ({
        data: [
            { id: 1, title: 'Workspace 1' },
            { id: 2, title: 'Workspace 2' },
        ],
    })),
}));

// Mock clipboard
const mockWriteText = vi.fn().mockResolvedValue(undefined);
Object.defineProperty(navigator, 'clipboard', {
    value: {
        writeText: mockWriteText,
    },
    writable: true,
    configurable: true,
});

const renderWithRouter = (ui: React.ReactElement) => {
    return render(<MemoryRouter>{ui}</MemoryRouter>);
};

describe('CommandMenu', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('keyboard shortcut', () => {
        it('opens on Cmd+K', () => {
            renderWithRouter(<CommandMenu />);

            // Menu should be closed initially
            expect(
                screen.queryByPlaceholderText('admin.command_menu.placeholder')
            ).not.toBeInTheDocument();

            // Trigger Cmd+K
            fireEvent.keyDown(document, { key: 'k', metaKey: true });

            // Menu should be open
            expect(
                screen.getByPlaceholderText('admin.command_menu.placeholder')
            ).toBeInTheDocument();
        });

        it('opens on Ctrl+K', () => {
            renderWithRouter(<CommandMenu />);

            fireEvent.keyDown(document, { key: 'k', ctrlKey: true });

            expect(
                screen.getByPlaceholderText('admin.command_menu.placeholder')
            ).toBeInTheDocument();
        });

        it('toggles closed on second Cmd+K', () => {
            renderWithRouter(<CommandMenu />);

            // Open
            fireEvent.keyDown(document, { key: 'k', metaKey: true });
            expect(
                screen.getByPlaceholderText('admin.command_menu.placeholder')
            ).toBeInTheDocument();

            // Close
            fireEvent.keyDown(document, { key: 'k', metaKey: true });
            expect(
                screen.queryByPlaceholderText('admin.command_menu.placeholder')
            ).not.toBeInTheDocument();
        });
    });

    describe('study navigation', () => {
        it('displays studies in Go to section', async () => {
            renderWithRouter(<CommandMenu />);
            fireEvent.keyDown(document, { key: 'k', metaKey: true });

            await waitFor(() => {
                expect(screen.getByText('study-1')).toBeInTheDocument();
                expect(screen.getByText('study-2')).toBeInTheDocument();
            });
        });

        it('navigates to study when selected', async () => {
            renderWithRouter(<CommandMenu />);
            fireEvent.keyDown(document, { key: 'k', metaKey: true });

            const studyItem = await screen.findByText('study-1');
            fireEvent.click(studyItem);

            expect(mockNavigate).toHaveBeenCalledWith('/admin/studies/study-1');
        });
    });

    describe('contextual actions', () => {
        it('shows study actions when study is active', async () => {
            renderWithRouter(<CommandMenu />);
            fireEvent.keyDown(document, { key: 'k', metaKey: true });

            await waitFor(() => {
                expect(screen.getByText('admin.sidebar.dashboard')).toBeInTheDocument();
                expect(screen.getByText('admin.sidebar.design')).toBeInTheDocument();
                expect(screen.getByText('admin.sidebar.team')).toBeInTheDocument();
                expect(screen.getByText('admin.command_menu.copy_link')).toBeInTheDocument();
            });
        });

        it('copies public link on action', async () => {
            const { toast } = await import('sonner');
            renderWithRouter(<CommandMenu />);
            fireEvent.keyDown(document, { key: 'k', metaKey: true });

            const copyAction = await screen.findByText('admin.command_menu.copy_link');
            fireEvent.click(copyAction);

            expect(mockWriteText).toHaveBeenCalledWith(
                expect.stringContaining('/study/test-study/welcome')
            );
            expect(toast.success).toHaveBeenCalledWith('Study link copied!');
        });
    });

    describe('system actions', () => {
        it('shows theme toggle', async () => {
            renderWithRouter(<CommandMenu />);
            fireEvent.keyDown(document, { key: 'k', metaKey: true });

            expect(screen.getByText('admin.command_menu.toggle_theme')).toBeInTheDocument();
        });

        it('shows logout option', async () => {
            renderWithRouter(<CommandMenu />);
            fireEvent.keyDown(document, { key: 'k', metaKey: true });

            expect(screen.getByText('admin.command_menu.logout')).toBeInTheDocument();
        });

        it('navigates to login and logs out on logout click', async () => {
            const { toast } = await import('sonner');
            renderWithRouter(<CommandMenu />);
            fireEvent.keyDown(document, { key: 'k', metaKey: true });

            const logoutAction = await screen.findByText('admin.command_menu.logout');
            fireEvent.click(logoutAction);

            expect(mockNavigate).toHaveBeenCalledWith('/login');
            expect(toast.success).toHaveBeenCalledWith('Logged out successfully');
        });
    });

    describe('search functionality', () => {
        it('filters results based on input', async () => {
            renderWithRouter(<CommandMenu />);
            fireEvent.keyDown(document, { key: 'k', metaKey: true });

            const input = screen.getByPlaceholderText('admin.command_menu.placeholder');
            fireEvent.change(input, { target: { value: 'study-1' } });

            await waitFor(() => {
                expect(screen.getByText('study-1')).toBeInTheDocument();
            });
        });
    });
});
