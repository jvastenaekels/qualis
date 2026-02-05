import { renderWithProviders, screen, waitFor } from '@/test-utils/test-utils';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import GeneralSettingsPage from './GeneralSettingsPage';
import { useAuthStore } from '@/store/useAuthStore';
import userEvent from '@testing-library/user-event';
import { AdminService } from '@/api/admin';

// Mock Sonner toast
vi.mock('sonner', () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn(),
    },
}));

// Mock AdminService
vi.mock('@/api/admin', () => ({
    AdminService: {
        updateStudy: vi.fn(),
        updateStudyState: vi.fn(),
        deleteStudy: vi.fn(),
    },
}));

// Mock react-router-dom
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
    return {
        ...actual,
        useLoaderData: vi.fn(),
        useNavigate: () => mockNavigate,
        useParams: vi.fn(),
    };
});

describe('GeneralSettingsPage', () => {
    const mockStudy = {
        id: 1,
        slug: 'test-study',
        title: 'Test Study',
        state: 'draft',
    };

    beforeEach(async () => {
        // Mock useLoaderData using import
        const router = await import('react-router-dom');
        vi.mocked(router.useLoaderData).mockReturnValue({
            study: mockStudy,
            slug: 'test-study',
        });
        vi.mocked(router.useParams).mockReturnValue({
            workspaceSlug: 'test-workspace',
            studySlug: 'test-study',
        });

        useAuthStore.setState({
            user: { id: 1, email: 'admin@libre-q.dev', is_superuser: true },
            isAuthenticated: true,
        });

        mockNavigate.mockClear();
        vi.mocked(AdminService.updateStudy).mockClear();
        vi.mocked(AdminService.updateStudyState).mockClear();
        vi.mocked(AdminService.deleteStudy).mockClear();
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    const renderPage = () => {
        return renderWithProviders(<GeneralSettingsPage />);
    };

    it('renders only the slug field', async () => {
        renderPage();

        // Use name attribute to be precise and avoid label duplicate issues
        const slugInput = document.querySelector('input[name="slug"]');
        expect(slugInput).toBeInTheDocument();
        expect(slugInput).toHaveValue('test-study');

        // Verify title field is NOT present
        expect(document.querySelector('input[name="title"]')).not.toBeInTheDocument();

        // Verify date fields are NOT present
        expect(document.querySelector('input[name="start_date"]')).not.toBeInTheDocument();
        expect(document.querySelector('input[name="end_date"]')).not.toBeInTheDocument();
    });

    it('submits update with only slug', async () => {
        const user = userEvent.setup();

        vi.mocked(AdminService.updateStudy).mockResolvedValue({} as never);

        renderPage();

        const slugInput = document.querySelector('input[name="slug"]') as HTMLInputElement;
        await user.clear(slugInput);
        await user.type(slugInput, 'new-slug');

        const saveButton = screen.getByRole('button', { name: /Save Changes/i });
        await user.click(saveButton);

        await waitFor(() => {
            expect(AdminService.updateStudy).toHaveBeenCalledWith(
                'test-study',
                expect.objectContaining({
                    slug: 'new-slug',
                })
            );
            // Ensure no other fields were sent (dates, title) - checking the call arguments
            const args = vi.mocked(AdminService.updateStudy).mock.calls[0][1] as Record<
                string,
                unknown
            >;
            expect(args.title).toBeUndefined();
            expect(args.start_date).toBeUndefined();
            expect(args.end_date).toBeUndefined();
        });

        // Should navigate to new slug
        expect(mockNavigate).toHaveBeenCalledWith('/app/test-workspace/studies/new-slug/settings');
    });

    it('allows archiving the study', async () => {
        const user = userEvent.setup();

        // Update mock study to be closed so it can be archived
        const router = await import('react-router-dom');
        vi.mocked(router.useLoaderData).mockReturnValue({
            study: { ...mockStudy, state: 'closed' },
            slug: 'test-study',
        });

        vi.mocked(AdminService.updateStudyState).mockResolvedValue({} as never);

        renderPage();

        const archiveButton = screen.getByRole('button', {
            name: /Archive Study/i,
        });

        // Check if enabled
        expect(archiveButton).toBeEnabled();

        await user.click(archiveButton);

        await waitFor(() => {
            expect(AdminService.updateStudyState).toHaveBeenCalledWith('test-study', 'archived');
        });
    });

    it('renders delete button for superuser', async () => {
        // Study must be archived to be deleted
        const router = await import('react-router-dom');
        vi.mocked(router.useLoaderData).mockReturnValue({
            study: { ...mockStudy, state: 'archived' },
            slug: 'test-study',
        });

        renderPage();

        expect(screen.getByRole('button', { name: /Delete Study/i })).toBeInTheDocument();
    });

    it('does not render delete button for non-superuser', async () => {
        useAuthStore.setState({
            user: { id: 2, email: 'user@libre-q.dev', is_superuser: false },
        });

        const router = await import('react-router-dom');
        vi.mocked(router.useLoaderData).mockReturnValue({
            study: { ...mockStudy, state: 'archived' },
            slug: 'test-study',
        });

        renderPage();

        expect(screen.queryByRole('button', { name: /Delete Study/i })).not.toBeInTheDocument();
    });
});
