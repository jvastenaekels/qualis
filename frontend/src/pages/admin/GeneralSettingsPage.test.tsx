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
        useRevalidator: vi.fn(() => ({ revalidate: vi.fn() })),
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

    it('does not render the slug form (moved to Access & Recruitment)', async () => {
        renderPage();

        // Slug field should NOT be present on the settings page
        expect(document.querySelector('input[name="slug"]')).not.toBeInTheDocument();
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
