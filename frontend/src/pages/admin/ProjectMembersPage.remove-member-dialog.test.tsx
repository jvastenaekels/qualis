import { renderWithProviders, screen, waitFor } from '@/test-utils/test-utils';
import userEvent from '@testing-library/user-event';
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

const { removeMember, refetchMembers } = vi.hoisted(() => ({
    removeMember: vi.fn().mockResolvedValue({}),
    refetchMembers: vi.fn(),
}));

vi.mock('@/api/generated', () => ({
    useGetProjectApiAdminProjectsSlugGet: () => ({
        data: { id: 1, slug: 'demo', title: 'Demo Project' },
        isLoading: false,
    }),
    useListProjectMembersApiAdminProjectsSlugMembersGet: () => ({
        data: {
            items: [
                {
                    user_id: 11,
                    role: 'researcher',
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
        refetch: refetchMembers,
    }),
    useRemoveProjectMemberApiAdminProjectsSlugMembersUserIdDelete: () => ({
        mutateAsync: removeMember,
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

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
    return {
        ...actual,
        useLoaderData: () => ({ slug: 'demo' }),
        useNavigate: () => vi.fn(),
    };
});

describe('ProjectMembersPage remove-member dialog', () => {
    beforeEach(() => {
        removeMember.mockReset().mockResolvedValue({});
        useAuthStore.setState({
            user: { id: 12, email: 'grace@x.io', is_superuser: false },
            isAuthenticated: true,
        });
    });

    it('opens an AlertDialog showing the member name and confirms removal', async () => {
        const user = userEvent.setup();
        renderWithProviders(<ProjectMembersPage />);

        const removeBtn = await screen.findByRole('button', { name: /remove ada lovelace/i });
        await user.click(removeBtn);

        const dialog = await screen.findByRole('alertdialog');
        expect(dialog).toHaveTextContent(/ada lovelace/i);
        expect(removeMember).not.toHaveBeenCalled();

        await user.click(screen.getByRole('button', { name: /^remove$/i }));
        await waitFor(() =>
            expect(removeMember).toHaveBeenCalledWith({ slug: 'demo', userId: 11 })
        );
    });
});
