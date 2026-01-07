import { renderWithProviders, screen, waitFor } from '@/test-utils/test-utils';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { server } from '@/test-utils/server';
import { http, HttpResponse } from 'msw';
import WorkspaceSettingsPage from './WorkspaceSettingsPage';
import { useAuthStore } from '@/store/useAuthStore';
import { useLoaderData } from 'react-router-dom';

// Setup mock return value for this test suite
beforeEach(() => {
    vi.mocked(useLoaderData).mockReturnValue({ slug: 'test-workspace' });
});

// Mock toast
vi.mock('sonner', () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn(),
    },
}));

describe('WorkspaceSettingsPage', () => {
    const mockWorkspace = {
        title: 'Test Workspace',
        slug: 'test-workspace',
    };

    // ... mockMembers ...
    const mockMembers = [
        {
            user_id: 1,
            role: 'admin',
            joined_at: '2023-01-01T00:00:00Z',
            user: {
                id: 1,
                email: 'admin@example.com',
                full_name: 'Admin User',
                is_active: true,
                is_superuser: false,
            },
        },
        {
            user_id: 2,
            role: 'researcher',
            joined_at: '2023-01-02T00:00:00Z',
            user: {
                id: 2,
                email: 'researcher@example.com',
                full_name: 'Researcher User',
                is_active: true,
                is_superuser: false,
            },
        },
    ];

    const currentUser = mockMembers[0].user;

    beforeEach(() => {
        useAuthStore.setState({ user: currentUser, isAuthenticated: true });

        server.use(
            http.get(/\/api\/admin\/workspaces\/test-workspace$/, () => {
                return HttpResponse.json(mockWorkspace);
            }),
            http.get(/\/api\/admin\/workspaces\/test-workspace\/members$/, () => {
                return HttpResponse.json(mockMembers);
            }),
            http.patch(/\/api\/admin\/workspaces\/test-workspace$/, async ({ request }) => {
                const body = await request.json();
                return HttpResponse.json({ ...mockWorkspace, ...(body as object) });
            })
            // ... other handlers
        );
    });

    it('renders workspace settings correctly', async () => {
        renderWithProviders(<WorkspaceSettingsPage />);

        // Wait for workspace data to load (H1 title confirms fetch success)
        await waitFor(() => {
            expect(screen.getByRole('heading', { name: /Test Workspace/i })).toBeInTheDocument();
        });

        // Check members list
        expect(screen.getByText('Admin User')).toBeInTheDocument();
        expect(screen.getByText('Researcher User')).toBeInTheDocument();

        // Check form values
        await waitFor(() => {
            const titleInput = screen.getByLabelText(/workspace title/i) as HTMLInputElement;
            expect(titleInput.value).toBe('Test Workspace');
        });
    });
});
