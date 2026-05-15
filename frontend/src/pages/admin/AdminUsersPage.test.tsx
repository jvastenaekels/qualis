import { renderWithProviders, screen, within } from '@/test-utils/test-utils';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import AdminUsersPage from './AdminUsersPage';
import type { AdminUser } from '@/hooks/admin/useAdminUsersPage';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// Radix DropdownMenu trips a compose-refs loop in React 19 + happy-dom — stub it
// with minimal pass-through primitives (same approach as ProjectMembersPage Select).
vi.mock('@/components/ui/dropdown-menu', () => ({
    DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DropdownMenuItem: ({
        children,
        onSelect,
        disabled,
        ...rest
    }: {
        children: React.ReactNode;
        onSelect?: () => void;
        disabled?: boolean;
    }) => (
        <button type="button" onClick={onSelect} disabled={disabled} {...rest}>
            {children}
        </button>
    ),
    DropdownMenuLabel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DropdownMenuSeparator: () => <hr />,
}));

const useAdminUsersPageMock = vi.fn();
vi.mock('@/hooks/admin/useAdminUsersPage', async () => {
    const actual = await vi.importActual<typeof import('@/hooks/admin/useAdminUsersPage')>(
        '@/hooks/admin/useAdminUsersPage'
    );
    return {
        ...actual,
        useAdminUsersPage: () => useAdminUsersPageMock(),
    };
});

const NOW = new Date('2026-05-15T00:00:00Z');

function makeUser(overrides: Partial<AdminUser> = {}): AdminUser {
    return {
        id: 1,
        email: 'alice@example.org',
        full_name: 'Alice Anderson',
        is_active: true,
        is_superuser: false,
        is_totp_enabled: true,
        pending_email: null,
        email_verified_at: '2025-01-01T00:00:00Z',
        password_changed_at: '2026-01-01T00:00:00Z',
        last_login_at: '2026-05-10T00:00:00Z',
        ...overrides,
    };
}

const actions = {
    deactivate: vi.fn().mockResolvedValue({}),
    activate: vi.fn().mockResolvedValue({}),
    promote: vi.fn().mockResolvedValue({}),
    demote: vi.fn().mockResolvedValue({}),
    forcePasswordReset: vi.fn().mockResolvedValue({}),
    resetTotp: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
};

interface HookOverrides {
    users?: AdminUser[];
    isLoading?: boolean;
    error?: unknown;
    mutationError?: unknown;
    isMutating?: boolean;
    pendingAction?: unknown;
}

const setPendingAction = vi.fn();
const setSearch = vi.fn();
const setFilter = vi.fn();

function hookValue(o: HookOverrides = {}) {
    return {
        users: o.users ?? [makeUser()],
        isLoading: o.isLoading ?? false,
        error: o.error ?? null,
        search: '',
        setSearch,
        filter: 'all' as const,
        setFilter,
        pendingAction: o.pendingAction ?? null,
        setPendingAction,
        now: NOW,
        isMutating: o.isMutating ?? false,
        mutationError: o.mutationError ?? null,
        actions,
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    useAdminUsersPageMock.mockReturnValue(hookValue());
});

describe('AdminUsersPage', () => {
    it('renders a row per user and surfaces the superuser_no_2fa risk badge', () => {
        const risky = makeUser({
            id: 2,
            email: 'root@example.org',
            full_name: 'Root Admin',
            is_superuser: true,
            is_totp_enabled: false,
        });
        useAdminUsersPageMock.mockReturnValue(hookValue({ users: [risky, makeUser()] }));

        renderWithProviders(<AdminUsersPage />);

        const rows = screen.getAllByTestId('admin-users-row');
        expect(rows).toHaveLength(2);
        expect(screen.getByText('root@example.org')).toBeInTheDocument();
        expect(screen.getByText('alice@example.org')).toBeInTheDocument();

        const riskyRow = screen.getByTestId('admin-users-row-2');
        expect(within(riskyRow).getByText(/superuser without 2fa/i)).toBeInTheDocument();
    });

    it('renders rows in the order the hook returns them', () => {
        const u3 = makeUser({ id: 3, email: 'c@example.org' });
        const u1 = makeUser({ id: 1, email: 'a@example.org' });
        const u2 = makeUser({ id: 2, email: 'b@example.org' });
        useAdminUsersPageMock.mockReturnValue(hookValue({ users: [u3, u1, u2] }));

        renderWithProviders(<AdminUsersPage />);

        const rows = screen.getAllByTestId('admin-users-row');
        const orderedIds = rows.map((r) => within(r).getByText(/@example\.org$/).textContent);
        expect(orderedIds).toEqual(['c@example.org', 'a@example.org', 'b@example.org']);
    });

    it('clicking an action item then confirming calls the matching action with the user', async () => {
        const user = userEvent.setup();
        const target = makeUser({ id: 7, email: 'target@example.org' });
        // Drive the controlled pendingAction: first render with null, then re-render
        // with a force-password-reset pending action to assert the confirm wiring.
        useAdminUsersPageMock.mockReturnValue(hookValue({ users: [target] }));
        const { rerender } = renderWithProviders(<AdminUsersPage />);

        // The menu item should call setPendingAction (not the action directly).
        await user.click(screen.getByText(/force password reset/i));
        expect(setPendingAction).toHaveBeenCalledWith({
            kind: 'force-password-reset',
            user: target,
        });
        expect(actions.forcePasswordReset).not.toHaveBeenCalled();

        useAdminUsersPageMock.mockReturnValue(
            hookValue({
                users: [target],
                pendingAction: { kind: 'force-password-reset', user: target },
            })
        );
        rerender(<AdminUsersPage />);

        await user.click(screen.getByRole('button', { name: /^confirm$/i }));
        expect(actions.forcePasswordReset).toHaveBeenCalledWith(target);
    });

    it('shows a destructive alert with the backend message when mutationError is set', () => {
        const err = Object.assign(new Error('You cannot demote yourself.'), {
            code: 'error',
        });
        useAdminUsersPageMock.mockReturnValue(hookValue({ mutationError: err }));

        renderWithProviders(<AdminUsersPage />);

        const alert = screen.getByRole('alert');
        expect(within(alert).getByText('You cannot demote yourself.')).toBeInTheDocument();
    });

    it('renders a loading state with no rows while loading', () => {
        useAdminUsersPageMock.mockReturnValue(hookValue({ isLoading: true, users: [] }));
        renderWithProviders(<AdminUsersPage />);
        expect(screen.queryAllByTestId('admin-users-row')).toHaveLength(0);
    });

    it('renders an empty state when there are no users', () => {
        useAdminUsersPageMock.mockReturnValue(hookValue({ users: [] }));
        renderWithProviders(<AdminUsersPage />);
        expect(screen.getByText(/no users match/i)).toBeInTheDocument();
        expect(screen.queryAllByTestId('admin-users-row')).toHaveLength(0);
    });
});
