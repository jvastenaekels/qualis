/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { renderWithProviders, screen } from '@/test-utils/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import RequireAdmin from './RequireAdmin';

const { mockProjectsHook } = vi.hoisted(() => ({ mockProjectsHook: vi.fn() }));

vi.mock('@/hooks/useAuth');
vi.mock('@/api/generated', () => ({
    useListProjectsApiAdminProjectsGet: mockProjectsHook,
}));
const { useAuth } = await import('@/hooks/useAuth');
const mockUseAuth = vi.mocked(useAuth);

function setAuth(isAuthenticated: boolean) {
    mockUseAuth.mockReturnValue({
        isLoading: false,
        isAuthenticated,
        isSuperuser: false,
        user: undefined,
        error: null,
        refetch: vi.fn(),
    });
}

function renderGuard(initialEntry: string) {
    return renderWithProviders(
        <Routes>
            <Route element={<RequireAdmin />}>
                <Route path="/hub" element={<div data-testid="page">hub</div>} />
                <Route path="/app/projects/new" element={<div data-testid="page">new</div>} />
                <Route path="/app/:slug/dashboard" element={<div data-testid="page">dash</div>} />
            </Route>
            <Route path="/login" element={<div data-testid="login-page">login</div>} />
        </Routes>,
        { initialEntries: [initialEntry] }
    );
}

describe('RequireAdmin', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockProjectsHook.mockReturnValue({ data: { items: [] }, isLoading: false });
    });

    it('shows the hub to a user without a project', () => {
        setAuth(true);
        renderGuard('/hub');
        expect(screen.getByTestId('page')).toHaveTextContent('hub');
    });

    it('shows /app/projects/new to a user without a project', () => {
        setAuth(true);
        renderGuard('/app/projects/new');
        expect(screen.getByTestId('page')).toHaveTextContent('new');
    });

    it('denies a project page to a user without a project', () => {
        setAuth(true);
        renderGuard('/app/demo/dashboard');
        expect(screen.queryByTestId('page')).not.toBeInTheDocument();
        expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    it('redirects an anonymous visitor to login', () => {
        setAuth(false);
        renderGuard('/hub');
        expect(screen.getByTestId('login-page')).toBeInTheDocument();
    });

    it('lets a project member through', () => {
        setAuth(true);
        mockProjectsHook.mockReturnValue({ data: { items: [{ id: 1 }] }, isLoading: false });
        renderGuard('/app/demo/dashboard');
        expect(screen.getByTestId('page')).toHaveTextContent('dash');
    });
});
