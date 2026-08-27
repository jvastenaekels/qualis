import { renderWithProviders, screen } from '@/test-utils/test-utils';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { Routes, Route } from 'react-router-dom';
import { AdminDashboard } from './AdminDashboard';

vi.mock('@/api/generated', async () => {
    const actual = await vi.importActual<Record<string, unknown>>('@/api/generated');
    return {
        ...actual,
        useListStudiesApiAdminStudiesGet: () => ({
            data: { items: [] },
            isLoading: false,
        }),
        useListConcoursesApiAdminConcoursesGet: () => ({
            data: { items: [] },
            isLoading: false,
        }),
    };
});

vi.mock('@/store/useAuthStore', () => ({
    useAuthStore: () => ({ currentProject: { id: 1, slug: 'demo', title: 'Demo' } }),
}));

function ConcoursePage() {
    return <div data-testid="concourse-list">concourses</div>;
}

describe('AdminDashboard onboarding', () => {
    it('navigates to the concourse list from the statement-collection step', async () => {
        renderWithProviders(
            <Routes>
                <Route path="/app/:projectSlug/dashboard" element={<AdminDashboard />} />
                <Route path="/app/:projectSlug/concourses" element={<ConcoursePage />} />
            </Routes>,
            { initialEntries: ['/app/demo/dashboard'] }
        );

        const button = await screen.findByRole('button', { name: /open concourse/i });
        await userEvent.click(button);
        expect(await screen.findByTestId('concourse-list')).toBeInTheDocument();
    });
});
