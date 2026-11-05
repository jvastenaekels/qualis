/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { fireEvent, screen, waitFor } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../test-utils/test-utils';
import RegistrationPage from './RegistrationPage';

vi.mock('@/api/mutator', () => ({
    customInstance: vi.fn(),
}));

vi.mock('@/api/generated', () => ({
    registerUserApiRegisterPost: vi.fn(),
    acceptInvitationApiAdminInvitationsAcceptPost: vi.fn(),
    getListProjectsApiAdminProjectsGetQueryKey: () => ['/api/admin/projects'],
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => ({
    ...(await importOriginal<typeof import('react-router-dom')>()),
    useNavigate: () => mockNavigate,
}));

import {
    acceptInvitationApiAdminInvitationsAcceptPost,
    registerUserApiRegisterPost,
} from '@/api/generated';
import { customInstance } from '@/api/mutator';
import { ApiError } from '@/api/client';
import { useAuthStore } from '@/store/useAuthStore';

const mockedCustomInstance = vi.mocked(customInstance);
const mockedRegister = vi.mocked(registerUserApiRegisterPost);
const mockedAccept = vi.mocked(acceptInvitationApiAdminInvitationsAcceptPost);

const PROJECT_INVITE = {
    email: 'new@example.org',
    project_id: 7,
    project_name: 'Housing study',
    role: 'member',
};
const ACCOUNT_INVITE = {
    email: 'new@example.org',
    project_id: null,
    project_name: null,
    role: 'member',
};

const mockInvite = (invite: typeof PROJECT_INVITE | typeof ACCOUNT_INVITE) => {
    mockedCustomInstance.mockResolvedValue(invite);
    mockedRegister.mockResolvedValue({ requires_email_verification: false } as never);
};

const renderPage = () =>
    renderWithProviders(<RegistrationPage />, { initialEntries: ['/register?token=tok'] });

const fillAndSubmit = async (fullName?: string) => {
    const password = await screen.findByLabelText('Choose password');
    if (fullName !== undefined) {
        fireEvent.change(screen.getByLabelText('Full name (optional)'), {
            target: { value: fullName },
        });
    }
    fireEvent.change(password, { target: { value: 'pw12345678' } });
    fireEvent.change(screen.getByLabelText('Confirm password'), {
        target: { value: 'pw12345678' },
    });
    fireEvent.click(screen.getByRole('button', { name: /complete registration/i }));
};

const registerBody = () => mockedRegister.mock.calls[0]?.[0];

describe('RegistrationPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        useAuthStore.getState().logout();
    });

    it('shows the project name on a project invitation', async () => {
        mockInvite(PROJECT_INVITE);
        renderPage();

        expect(await screen.findByText('Housing study')).toBeInTheDocument();
        expect(screen.getByText('member')).toBeInTheDocument();
        expect(screen.queryByText('Create a new project')).not.toBeInTheDocument();
    });

    it('hides the project box and role on an account invitation', async () => {
        mockInvite(ACCOUNT_INVITE);
        renderPage();

        await screen.findByLabelText('Choose password');
        expect(screen.queryByText('Invitation to:')).not.toBeInTheDocument();
        expect(screen.queryByText('member')).not.toBeInTheDocument();
    });

    it('uses the account wording on an account invitation', async () => {
        mockInvite(ACCOUNT_INVITE);
        renderPage();

        expect(await screen.findByText('Create your researcher account')).toBeInTheDocument();
        expect(screen.queryByText('Join the research project')).not.toBeInTheDocument();
        expect(screen.queryByText(/research ethics guidelines/i)).not.toBeInTheDocument();

        await fillAndSubmit();
        expect(await screen.findByText('Your account is ready.')).toBeInTheDocument();
    });

    it('sends full_name when filled', async () => {
        mockInvite(PROJECT_INVITE);
        renderPage();

        await fillAndSubmit('Ada Lovelace');

        await waitFor(() => expect(registerBody()).toBeDefined());
        expect(registerBody()).toMatchObject({
            email: 'new@example.org',
            invitation_token: 'tok',
            full_name: 'Ada Lovelace',
        });
    });

    it('omits full_name when empty', async () => {
        mockInvite(PROJECT_INVITE);
        renderPage();

        await fillAndSubmit();
        await waitFor(() => expect(registerBody()).toBeDefined());
        // undefined is dropped by JSON.stringify, so the field is absent on the wire
        expect(registerBody()?.full_name).toBeUndefined();
    });

    describe('existing account', () => {
        const signIn = () =>
            useAuthStore.getState().setAuth('t', {
                id: 1,
                email: 'new@example.org',
                is_superuser: false,
            });

        it('offers sign-in on a project invitation', async () => {
            mockInvite(PROJECT_INVITE);
            renderPage();

            const link = await screen.findByRole('link', {
                name: 'Already have an account? Sign in',
            });
            expect(link).toHaveAttribute(
                'href',
                `/login?redirect=${encodeURIComponent('/register?token=tok')}`
            );
        });

        it('does not offer sign-in on an account invitation', async () => {
            mockInvite(ACCOUNT_INVITE);
            renderPage();

            await screen.findByLabelText('Choose password');
            expect(screen.queryByText('Already have an account? Sign in')).not.toBeInTheDocument();
        });

        it('shows Join project instead of the form when signed in', async () => {
            signIn();
            mockInvite(PROJECT_INVITE);
            renderPage();

            expect(await screen.findByRole('button', { name: 'Join project' })).toBeInTheDocument();
            expect(screen.getByText('Housing study')).toBeInTheDocument();
            expect(screen.getByText('member')).toBeInTheDocument();
            expect(screen.queryByLabelText('Choose password')).not.toBeInTheDocument();
            expect(screen.queryByText('Already have an account? Sign in')).not.toBeInTheDocument();
        });

        it('joining calls accept with the token and goes to the hub', async () => {
            signIn();
            mockInvite(PROJECT_INVITE);
            mockedAccept.mockResolvedValue({} as never);
            renderPage();

            fireEvent.click(await screen.findByRole('button', { name: 'Join project' }));

            await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/hub'));
            expect(mockedAccept).toHaveBeenCalledWith({ token: 'tok' });
        });

        it('joining refreshes the project list', async () => {
            signIn();
            mockInvite(PROJECT_INVITE);
            mockedAccept.mockResolvedValue({} as never);
            const invalidate = vi.spyOn(QueryClient.prototype, 'invalidateQueries');
            renderPage();

            fireEvent.click(await screen.findByRole('button', { name: 'Join project' }));

            await waitFor(() =>
                expect(invalidate).toHaveBeenCalledWith({ queryKey: ['/api/admin/projects'] })
            );
            invalidate.mockRestore();
        });

        it('shows the wrong-account message on 403 and stays on the page', async () => {
            signIn();
            mockInvite(PROJECT_INVITE);
            mockedAccept.mockRejectedValue(new ApiError(403, 'forbidden'));
            renderPage();

            fireEvent.click(await screen.findByRole('button', { name: 'Join project' }));

            expect(
                await screen.findByText(
                    'This invitation was sent to another address. Sign out, then open the link again.'
                )
            ).toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'Join project' })).toBeInTheDocument();
            expect(mockNavigate).not.toHaveBeenCalled();
        });

        it('shows the invalid-link screen on 400', async () => {
            signIn();
            mockInvite(PROJECT_INVITE);
            mockedAccept.mockRejectedValue(new ApiError(400, 'used'));
            renderPage();

            fireEvent.click(await screen.findByRole('button', { name: 'Join project' }));

            expect(await screen.findByText('Invalid invitation')).toBeInTheDocument();
        });
    });
});
