/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { renderWithProviders, screen, within } from '@/test-utils/test-utils';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ProjectMembersPage from './ProjectMembersPage';
import { useAuthStore } from '@/store/useAuthStore';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// Deliberately NOT mocking '@/components/ui/select' here (unlike the
// remove-member-dialog test file): the real Radix Select's value-rendering
// path (SelectValue resolving against SelectContent's items) is exactly what
// this test needs to exercise. It has been verified stable in this
// React 19 + happy-dom environment for this page.

const { removeMember, refetchMembers, createInvitation } = vi.hoisted(() => ({
    removeMember: vi.fn().mockResolvedValue({}),
    refetchMembers: vi.fn(),
    createInvitation: vi.fn().mockResolvedValue({ invite_url: 'https://example.com/join/abc' }),
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
                {
                    user_id: 13,
                    role: 'member',
                    joined_at: '2024-01-01T00:00:00Z',
                    user: { full_name: null, email: 'nn@example.com' },
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
        mutateAsync: createInvitation,
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

describe('ProjectMembersPage role select', () => {
    beforeEach(() => {
        removeMember.mockReset().mockResolvedValue({});
        useAuthStore.setState({
            user: { id: 12, email: 'grace@x.io', is_superuser: false },
            isAuthenticated: true,
        });
    });

    it('shows the Owner role label for the project owner', async () => {
        renderWithProviders(<ProjectMembersPage />);

        // Scope to the owner's own row: the page also renders an unrelated
        // "Owner" legend in the permissions-matrix card, so an unscoped
        // screen.findByText('Owner') would pass even without the fix.
        const ownerRow = await screen.findByRole('row', { name: /grace hopper/i });
        expect(within(ownerRow).getByText('Owner')).toBeInTheDocument();
    });

    it('never offers the owner role as an option in a member/viewer row dropdown', async () => {
        const user = userEvent.setup();
        renderWithProviders(<ProjectMembersPage />);

        // Ada Lovelace is a plain member, so her row's role Select is
        // interactive for the (owner) current user. Ownership transfer is
        // not a dropdown action: the listbox must offer member/viewer only.
        const memberRow = await screen.findByRole('row', { name: /ada lovelace/i });
        await user.click(within(memberRow).getByRole('combobox'));

        // The listbox is portalled, so options are asserted globally rather
        // than scoped to the row.
        expect(await screen.findByRole('option', { name: /^member$/i })).toBeInTheDocument();
        expect(screen.getByRole('option', { name: /^viewer$/i })).toBeInTheDocument();
        expect(screen.queryByRole('option', { name: /^owner$/i })).not.toBeInTheDocument();
    });

    it('falls back to the email when the member has no full name', async () => {
        renderWithProviders(<ProjectMembersPage />);

        // Scope to the no-name member's row: an unscoped query would still
        // pass if some other row happened to render matching text.
        const row = await screen.findByRole('row', { name: /nn@example\.com/i });
        expect(within(row).queryByText(/no name/i)).not.toBeInTheDocument();
        // The email must appear exactly once in the cell — as the display
        // name. A second, identical "email line" underneath it would be a
        // redundant duplicate rather than a real fix, so assert the count
        // instead of just presence.
        expect(within(row).getAllByText('nn@example.com')).toHaveLength(1);
    });

    it('names each row role select by that member, not a shared generic name (Task 6.7c)', async () => {
        renderWithProviders(<ProjectMembersPage />);

        expect(
            await screen.findByRole('combobox', { name: 'Role for Ada Lovelace' })
        ).toBeInTheDocument();
        // The no-name member falls back to the email, matching the visible
        // display-name cell one column over.
        expect(
            screen.getByRole('combobox', { name: 'Role for nn@example.com' })
        ).toBeInTheDocument();
    });
});

describe('ProjectMembersPage invite modal accessible names (Task 6.7b)', () => {
    beforeEach(() => {
        removeMember.mockReset().mockResolvedValue({});
        useAuthStore.setState({
            user: { id: 12, email: 'grace@x.io', is_superuser: false },
            isAuthenticated: true,
        });
    });

    it('names the email field and lets its label focus it', async () => {
        const user = userEvent.setup();
        renderWithProviders(<ProjectMembersPage />);

        await user.click(await screen.findByRole('button', { name: /invite collaborator/i }));

        const emailField = screen.getByRole('textbox', { name: /collaborator email/i });
        await user.click(screen.getByText('Collaborator email'));
        expect(emailField).toHaveFocus();
    });

    it('names the role select and lets its label open it', async () => {
        const user = userEvent.setup();
        renderWithProviders(<ProjectMembersPage />);

        await user.click(await screen.findByRole('button', { name: /invite collaborator/i }));

        // The trigger's own content is the selected role's value ("Member");
        // pairing the Label overrides that with the field's purpose, per
        // accname's label priority over content — the same mechanism the a11y
        // gate's brief verified in Chromium.
        const roleTrigger = screen.getByRole('combobox', { name: /assigned role/i });
        expect(roleTrigger).toHaveAttribute('aria-expanded', 'false');

        await user.click(screen.getByText('Assigned role'));
        expect(roleTrigger).toHaveAttribute('aria-expanded', 'true');
    });

    it('names the copy-invite-link control and flips the name once copied (Task 6.7c)', async () => {
        const user = userEvent.setup();
        Object.defineProperty(navigator, 'clipboard', {
            value: { writeText: vi.fn() },
            writable: true,
            configurable: true,
        });
        renderWithProviders(<ProjectMembersPage />);

        await user.click(await screen.findByRole('button', { name: /invite collaborator/i }));
        await user.type(screen.getByRole('textbox', { name: /collaborator email/i }), 'x@y.io');
        await user.click(screen.getByRole('button', { name: /create & send invitation/i }));

        const copyButton = await screen.findByRole('button', { name: 'Copy link' });
        await user.click(copyButton);

        expect(navigator.clipboard.writeText).toHaveBeenCalledWith('https://example.com/join/abc');
        expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Copy link' })).not.toBeInTheDocument();
    });
});
