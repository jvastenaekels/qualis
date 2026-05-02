import { renderWithProviders, screen } from '@/test-utils/test-utils';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ProjectMembersPage from './ProjectMembersPage';
import { useAuthStore } from '@/store/useAuthStore';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// Radix Select triggers a compose-refs loop in React 19 + happy-dom — stub it.
vi.mock('@/components/ui/select', () => ({
    Select: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    SelectTrigger: ({ children }: { children: React.ReactNode }) => (
        <button type="button">{children}</button>
    ),
    SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    SelectItem: ({ children, value }: { children: React.ReactNode; value: string }) => (
        <div data-value={value}>{children}</div>
    ),
    SelectValue: () => null,
}));

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
    return {
        ...actual,
        useLoaderData: () => ({ slug: 'demo' }),
        useNavigate: () => vi.fn(),
    };
});

// Mutable quota that tests can swap per scenario via vi.mocked + mockReturnValue.
const { getQuota } = vi.hoisted(() => ({
    getQuota: vi.fn(() => ({ count: 0, limit: null as number | null })),
}));

vi.mock('@/api/generated', () => ({
    useGetProjectApiAdminProjectsSlugGet: () => ({
        data: {
            id: 1,
            slug: 'demo',
            title: 'Demo Project',
            member_quota: getQuota(),
        },
        isLoading: false,
    }),
    useListProjectMembersApiAdminProjectsSlugMembersGet: () => ({
        data: {
            items: [
                {
                    user_id: 11,
                    role: 'member',
                    joined_at: '2024-01-01T00:00:00Z',
                    user: { full_name: 'Ada Lovelace', email: 'ada@x.io' },
                },
                {
                    user_id: 12,
                    role: 'owner',
                    joined_at: '2024-01-01T00:00:00Z',
                    user: { full_name: 'Grace Hopper', email: 'grace@x.io' },
                },
            ],
        },
        isLoading: false,
        refetch: vi.fn(),
    }),
    useRemoveProjectMemberApiAdminProjectsSlugMembersUserIdDelete: () => ({
        mutateAsync: vi.fn().mockResolvedValue({}),
        isPending: false,
    }),
    useUpdateProjectMemberApiAdminProjectsSlugMembersUserIdPatch: () => ({
        mutateAsync: vi.fn(),
        isPending: false,
    }),
    useCreateInvitationApiAdminProjectsSlugInvitationsPost: () => ({
        mutateAsync: vi.fn(),
        isPending: false,
    }),
}));

beforeEach(() => {
    useAuthStore.setState({
        user: { id: 12, email: 'grace@x.io', is_superuser: false },
        isAuthenticated: true,
    });
});

describe('ProjectMembersPage — quotas', () => {
    it('shows seat counter when limit is set', async () => {
        getQuota.mockReturnValue({ count: 3, limit: 5 });
        renderWithProviders(<ProjectMembersPage />);
        expect(await screen.findByText(/3\/5/i)).toBeInTheDocument();
    });

    it('hides counter when limit is null (unlimited)', async () => {
        getQuota.mockReturnValue({ count: 3, limit: null });
        renderWithProviders(<ProjectMembersPage />);
        // Wait for page content to appear before asserting absence
        await screen.findByRole('table');
        expect(screen.queryByText(/\d+\/\d+ seats/i)).not.toBeInTheDocument();
    });

    it('disables Invite button when at quota', async () => {
        getQuota.mockReturnValue({ count: 5, limit: 5 });
        renderWithProviders(<ProjectMembersPage />);
        const inviteButton = await screen.findByRole('button', { name: /invite/i });
        expect(inviteButton).toBeDisabled();
    });

    it('enables Invite button when below quota', async () => {
        getQuota.mockReturnValue({ count: 3, limit: 5 });
        renderWithProviders(<ProjectMembersPage />);
        const inviteButton = await screen.findByRole('button', { name: /invite/i });
        expect(inviteButton).not.toBeDisabled();
    });

    it('enables Invite button when limit is null (unlimited)', async () => {
        getQuota.mockReturnValue({ count: 99, limit: null });
        renderWithProviders(<ProjectMembersPage />);
        const inviteButton = await screen.findByRole('button', { name: /invite/i });
        expect(inviteButton).not.toBeDisabled();
    });
});
