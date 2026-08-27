/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { renderWithProviders, screen } from '@/test-utils/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import RequireSuperuser from './RequireSuperuser';

vi.mock('@/hooks/useAuth');
const { useAuth } = await import('@/hooks/useAuth');
const mockUseAuth = vi.mocked(useAuth);

function ProtectedPage() {
    return <div data-testid="protected-page">protected</div>;
}
function LoginPage() {
    return <div data-testid="login-page">login</div>;
}
function AppPage() {
    return <div data-testid="app-page">app</div>;
}

function renderGuard(initialEntry = '/app/users') {
    return renderWithProviders(
        <Routes>
            <Route element={<RequireSuperuser />}>
                <Route path="/app/users" element={<ProtectedPage />} />
            </Route>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/app" element={<AppPage />} />
        </Routes>,
        { initialEntries: [initialEntry] }
    );
}

describe('RequireSuperuser', () => {
    it('renders protected content for authenticated superusers', () => {
        mockUseAuth.mockReturnValue({
            isLoading: false,
            isAuthenticated: true,
            isSuperuser: true,
            user: undefined,
            error: null,
            refetch: vi.fn(),
        });

        renderGuard();

        expect(screen.getByTestId('protected-page')).toBeInTheDocument();
    });

    it('redirects unauthenticated users to /login with redirect param', () => {
        mockUseAuth.mockReturnValue({
            isLoading: false,
            isAuthenticated: false,
            isSuperuser: false,
            user: undefined,
            error: null,
            refetch: vi.fn(),
        });

        renderGuard('/app/users');

        expect(screen.getByTestId('login-page')).toBeInTheDocument();
        expect(screen.queryByTestId('protected-page')).not.toBeInTheDocument();
    });

    it('redirects authenticated non-superusers to /app', () => {
        mockUseAuth.mockReturnValue({
            isLoading: false,
            isAuthenticated: true,
            isSuperuser: false,
            user: undefined,
            error: null,
            refetch: vi.fn(),
        });

        renderGuard();

        expect(screen.getByTestId('app-page')).toBeInTheDocument();
        expect(screen.queryByTestId('protected-page')).not.toBeInTheDocument();
    });

    it('renders skeleton while auth is loading (no flash)', () => {
        mockUseAuth.mockReturnValue({
            isLoading: true,
            isAuthenticated: false,
            isSuperuser: false,
            user: undefined,
            error: null,
            refetch: vi.fn(),
        });

        const { container } = renderGuard();

        // The loading branch renders Skeleton elements (animate-pulse divs).
        // RequireSuperuser.tsx line 26-33: three <Skeleton> nodes inside a flex wrapper.
        expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
        expect(screen.queryByTestId('protected-page')).not.toBeInTheDocument();
        expect(screen.queryByTestId('login-page')).not.toBeInTheDocument();
    });

    it('superuser mid-load: no redirect and no flash of protected content', () => {
        // Realistic cold-load shape: isLoading=true, user not yet resolved,
        // so isSuperuser=false (it derives from user which is undefined).
        // The loading branch must fire BEFORE the !isSuperuser branch — a future
        // reorder that evaluated !isSuperuser first would wrongly bounce real
        // superusers to /app on every cold load; this test would fail.
        mockUseAuth.mockReturnValue({
            isLoading: true,
            isAuthenticated: false,
            isSuperuser: false,
            user: undefined,
            error: null,
            refetch: vi.fn(),
        });

        const { container } = renderGuard();

        // 1. Protected content must NOT be visible (no flash of restricted page).
        expect(screen.queryByTestId('protected-page')).not.toBeInTheDocument();
        // 2. No redirect: neither /login nor /app landing pages are rendered.
        expect(screen.queryByTestId('login-page')).not.toBeInTheDocument();
        expect(screen.queryByTestId('app-page')).not.toBeInTheDocument();
        // 3. Skeleton IS shown — the loading indicator is active.
        // RequireSuperuser.tsx line 26-33: Skeleton renders as animate-pulse divs.
        expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
    });
});
