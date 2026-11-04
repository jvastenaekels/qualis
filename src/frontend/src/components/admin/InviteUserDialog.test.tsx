import { renderWithProviders, screen, waitFor } from '@/test-utils/test-utils';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { InviteUserDialog } from './InviteUserDialog';

const LINK = 'https://qualis.test/invite?token=abc';

function setup(overrides: Partial<React.ComponentProps<typeof InviteUserDialog>> = {}) {
    const onInvite = vi.fn().mockResolvedValue(LINK);
    renderWithProviders(
        <InviteUserDialog
            open
            onOpenChange={vi.fn()}
            onInvite={onInvite}
            isEmailManual={false}
            {...overrides}
        />
    );
    return { onInvite, user: userEvent.setup() };
}

async function invite(user: ReturnType<typeof userEvent.setup>, email: string) {
    await user.type(screen.getByLabelText(/email address/i), email);
    await user.click(screen.getByRole('button', { name: /create invitation/i }));
}

describe('InviteUserDialog', () => {
    it('shows the link and copy button after inviting', async () => {
        const { onInvite, user } = setup();
        await invite(user, 'new@example.org');
        expect(onInvite).toHaveBeenCalledWith('new@example.org');
        expect(await screen.findByDisplayValue(LINK)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /copy link/i })).toBeInTheDocument();
    });

    it('says the link must be sent by hand when isEmailManual', async () => {
        const { user } = setup({ isEmailManual: true });
        await invite(user, 'new@example.org');
        expect(
            await screen.findByText(
                'Send this link to the person yourself. It works once and expires in 7 days.'
            )
        ).toBeInTheDocument();
    });

    it('says an email was sent otherwise', async () => {
        const { user } = setup({ isEmailManual: false });
        await invite(user, 'new@example.org');
        await screen.findByDisplayValue(LINK);
        expect(screen.getByText(/an email with this link was sent/i)).toBeInTheDocument();
        expect(screen.queryByText(/send this link to the person yourself/i)).toBeNull();
    });

    it('keeps the dialog open and shows the error on 409', async () => {
        const onInvite = vi.fn().mockRejectedValue(new Error('email_already_registered'));
        const { user } = setup({ onInvite });
        await invite(user, 'taken@example.org');
        expect(await screen.findByRole('alert')).toHaveTextContent(/already/i);
        expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
        expect(screen.queryByDisplayValue(LINK)).toBeNull();
    });

    it('refuses an invalid address without calling onInvite', async () => {
        const { onInvite, user } = setup();
        await user.type(screen.getByLabelText(/email address/i), 'not-an-email');
        await waitFor(() =>
            expect(screen.getByRole('button', { name: /create invitation/i })).toBeDisabled()
        );
        await user.click(screen.getByRole('button', { name: /create invitation/i }));
        expect(onInvite).not.toHaveBeenCalled();
    });
});
