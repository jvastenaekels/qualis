import { renderWithProviders, screen } from '@/test-utils/test-utils';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import CreateProjectPage from './CreateProjectPage';
import { useAuthStore } from '@/store/useAuthStore';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
    return {
        ...actual,
        useNavigate: () => vi.fn(),
    };
});

vi.mock('@tanstack/react-query', async () => {
    const actual =
        await vi.importActual<typeof import('@tanstack/react-query')>('@tanstack/react-query');
    return {
        ...actual,
        useQueryClient: () => ({ invalidateQueries: vi.fn() }),
    };
});

vi.mock('@/api/generated', () => ({
    getListProjectsApiAdminProjectsGetQueryKey: () => ['/api/admin/projects'],
}));

vi.mock('@/api/client', () => ({
    default: { post: vi.fn() },
}));

beforeEach(() => {
    useAuthStore.setState({
        token: 'test-token',
        user: { id: 1, email: 'owner@qualis.dev', is_superuser: false },
        projects: [],
        currentProject: null,
    });
});

describe('CreateProjectPage — owned-project quota', () => {
    it('uses concrete project-oriented placeholders', async () => {
        renderWithProviders(<CreateProjectPage />);

        expect(await screen.findByPlaceholderText('Climate attitudes Q study')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('climate-attitudes-q-study')).toBeInTheDocument();
    });

    it('enables Create button when no quota is set', async () => {
        renderWithProviders(<CreateProjectPage />);
        const button = await screen.findByRole('button', { name: /create/i });
        expect(button).not.toBeDisabled();
    });

    it('enables Create button when limit is null (unlimited)', async () => {
        useAuthStore.setState({
            user: {
                id: 1,
                email: 'owner@qualis.dev',
                is_superuser: false,
                owned_project_quota: { count: 99, limit: null },
            },
        });
        renderWithProviders(<CreateProjectPage />);
        const button = await screen.findByRole('button', { name: /create/i });
        expect(button).not.toBeDisabled();
    });

    it('enables Create button when below quota', async () => {
        useAuthStore.setState({
            user: {
                id: 1,
                email: 'owner@qualis.dev',
                is_superuser: false,
                owned_project_quota: { count: 1, limit: 3 },
            },
        });
        renderWithProviders(<CreateProjectPage />);
        const button = await screen.findByRole('button', { name: /create/i });
        expect(button).not.toBeDisabled();
    });

    it('disables Create button when owned-project quota is full', async () => {
        useAuthStore.setState({
            user: {
                id: 1,
                email: 'owner@qualis.dev',
                is_superuser: false,
                owned_project_quota: { count: 2, limit: 2 },
            },
        });
        renderWithProviders(<CreateProjectPage />);
        const button = await screen.findByRole('button', { name: /create/i });
        expect(button).toBeDisabled();
    });

    it('shows quota counter when limit is set', async () => {
        useAuthStore.setState({
            user: {
                id: 1,
                email: 'owner@qualis.dev',
                is_superuser: false,
                owned_project_quota: { count: 2, limit: 5 },
            },
        });
        renderWithProviders(<CreateProjectPage />);
        expect(await screen.findByText(/2\/5/i)).toBeInTheDocument();
    });

    it('hides quota counter when limit is null', async () => {
        useAuthStore.setState({
            user: {
                id: 1,
                email: 'owner@qualis.dev',
                is_superuser: false,
                owned_project_quota: { count: 2, limit: null },
            },
        });
        renderWithProviders(<CreateProjectPage />);
        // Wait for page content before asserting absence
        await screen.findByRole('button', { name: /create/i });
        expect(screen.queryByText(/\d+\/\d+ owned/i)).not.toBeInTheDocument();
    });
});
