import { renderWithProviders, screen } from '@/test-utils/test-utils';
import { describe, it, expect, vi } from 'vitest';
import ProjectSettingsPage from './ProjectSettingsPage';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock('@/api/generated', async () => {
    const actual = await vi.importActual<Record<string, unknown>>('@/api/generated');
    return {
        ...actual,
        useGetProjectApiAdminProjectsSlugGet: () => ({
            data: { id: 1, slug: 'demo', title: 'Demo' },
            isLoading: false,
            refetch: vi.fn(),
        }),
        useListProjectMembersApiAdminProjectsSlugMembersGet: () => ({
            data: { items: [] },
            refetch: vi.fn(),
        }),
        useRemoveProjectMemberApiAdminProjectsSlugMembersUserIdDelete: () => ({
            mutateAsync: vi.fn(),
            isPending: false,
        }),
        useUpdateProjectApiAdminProjectsSlugPut: () => ({ mutateAsync: vi.fn(), isPending: false }),
        useUpdateProjectMemberRoleApiAdminProjectsSlugMembersUserIdPatch: () => ({
            mutateAsync: vi.fn(),
            isPending: false,
        }),
        useUpdateProjectMemberApiAdminProjectsSlugMembersUserIdPatch: () => ({
            mutateAsync: vi.fn(),
            isPending: false,
        }),
        useInviteProjectMemberApiAdminProjectsSlugInvitationsPost: () => ({
            mutateAsync: vi.fn(),
            isPending: false,
        }),
    };
});

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
    return {
        ...actual,
        useLoaderData: () => ({ slug: 'demo' }),
        useNavigate: () => vi.fn(),
    };
});

vi.mock('react-hook-form', async () => {
    const actual = await vi.importActual<typeof import('react-hook-form')>('react-hook-form');
    return {
        ...actual,
        useForm: () => ({
            handleSubmit: (fn: (v: unknown) => void) => (e?: { preventDefault?: () => void }) => {
                e?.preventDefault?.();
                fn({});
            },
            control: {},
            formState: { errors: {} },
            reset: vi.fn(),
            register: vi.fn(),
            watch: vi.fn(),
            setValue: vi.fn(),
            getValues: vi.fn(),
        }),
    };
});

vi.mock('@/components/ui/form', () => ({
    Form: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    FormField: ({
        render,
    }: {
        render: (props: {
            field: {
                value: string;
                onChange: () => void;
                onBlur: () => void;
                name: string;
                ref: () => void;
            };
        }) => React.ReactNode;
    }) =>
        render({
            field: { value: '', onChange: vi.fn(), onBlur: vi.fn(), name: 'x', ref: vi.fn() },
        }),
    FormItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    FormLabel: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
    FormControl: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    FormDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
    FormMessage: () => null,
}));

describe('ProjectSettingsPage slug input prefix', () => {
    it('renders the live URL prefix /app/ — not the legacy /admin/w/', async () => {
        renderWithProviders(<ProjectSettingsPage />);
        expect(await screen.findByText('/app/')).toBeInTheDocument();
        expect(screen.queryByText('/admin/w/')).not.toBeInTheDocument();
    });
});
