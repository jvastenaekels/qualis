import { renderWithProviders, screen, waitFor } from '@/test-utils/test-utils';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Routes, Route } from 'react-router-dom';
import { AppSidebar } from './AppSidebar';
import { SidebarProvider } from '@/components/ui/sidebar';
import testI18n from '@/test-utils/i18n-test';

vi.mock('@/hooks/useAuth', () => ({
    useAuth: () => ({ user: { id: 1, email: 'r@x.io', full_name: 'Ada Lovelace' } }),
}));
vi.mock('@/api/generated', async () => {
    const actual = await vi.importActual<Record<string, unknown>>('@/api/generated');
    return {
        ...actual,
        useListStudiesApiAdminStudiesGet: () => ({ data: { items: [] } }),
    };
});

// The real instance below would otherwise fetch locale files over the network.
vi.mock('i18next-http-backend', () => ({
    default: class {
        static type = 'backend';
        type = 'backend' as const;
        init() {}
        read(_lng: string, _ns: string, callback: (err: null, data: object) => void) {
            callback(null, {});
        }
    },
}));

describe('admin language choice', () => {
    afterEach(async () => {
        const { default: appI18n } = await vi.importActual<typeof import('@/i18n')>('@/i18n');
        await appI18n.changeLanguage('en');
        localStorage.removeItem('i18nextLng');
        await testI18n.changeLanguage('en');
    });

    it('the sidebar language menu persists the choice', async () => {
        renderWithProviders(
            <SidebarProvider>
                <Routes>
                    <Route path="/app/:projectSlug/dashboard" element={<AppSidebar />} />
                </Routes>
            </SidebarProvider>,
            { initialEntries: ['/app/demo/dashboard'] }
        );

        await userEvent.click(screen.getByRole('button', { name: /EN/ }));
        await userEvent.click(await screen.findByRole('menuitem', { name: /FR/ }));

        await waitFor(() => expect(localStorage.getItem('i18nextLng')).toBe('fr'));
    });

    it('a participant language change does not touch the admin choice', async () => {
        localStorage.setItem('i18nextLng', 'en');

        // setupTests mocks '@/i18n'; the real instance is what the detector configures.
        const { default: appI18n } = await vi.importActual<typeof import('@/i18n')>('@/i18n');
        await appI18n.changeLanguage('fi');

        expect(localStorage.getItem('i18nextLng')).toBe('en');
    });
});
