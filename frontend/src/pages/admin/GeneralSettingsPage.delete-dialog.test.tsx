import { renderWithProviders, screen, waitFor } from '@/test-utils/test-utils';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import GeneralSettingsPage from './GeneralSettingsPage';
import type { StudyRead } from '@/api/model';
import { useAuthStore } from '@/store/useAuthStore';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const deleteStudy = vi.fn();
vi.mock('@/api/admin', () => ({
    AdminService: {
        deleteStudy: (...args: unknown[]) => deleteStudy(...args),
        updateStudyState: vi.fn(),
        updateStudy: vi.fn(),
    },
}));

const study: StudyRead = {
    id: 1,
    slug: 'climate-pilot',
    state: 'archived',
    project_id: 7,
    translations: [{ language: 'en', title: 'Climate Pilot', description: '' }],
    // biome-ignore lint/suspicious/noExplicitAny: minimal stub
} as any;

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
    return {
        ...actual,
        useLoaderData: () => ({ study, slug: 'climate-pilot' }),
        useParams: () => ({ projectSlug: 'demo', studySlug: 'climate-pilot' }),
        useNavigate: () => vi.fn(),
        useRevalidator: () => ({ revalidate: vi.fn() }),
    };
});

vi.mock('@/api/generated', async () => {
    const actual = await vi.importActual<Record<string, unknown>>('@/api/generated');
    return {
        ...actual,
        getStudyStorageUsageApiAdminStudiesSlugStorageUsageGet: vi.fn(),
        getListStudiesApiAdminStudiesGetQueryKey: () => ['studies'],
        getGetStudyApiAdminStudiesSlugGetQueryKey: () => ['study', 'climate-pilot'],
    };
});

describe('GeneralSettingsPage delete dialog', () => {
    beforeEach(() => {
        deleteStudy.mockReset();
        useAuthStore.setState({
            user: { id: 1, email: 'admin@qualis.dev', is_superuser: true },
            isAuthenticated: true,
        });
    });

    it('opens an AlertDialog and disables the action until the slug is typed', async () => {
        renderWithProviders(<GeneralSettingsPage />);
        await userEvent.click(screen.getByRole('button', { name: /delete study/i }));

        const dialog = await screen.findByRole('alertdialog');
        const confirmBtn = await screen.findByRole('button', { name: /^delete permanently$/i });
        expect(confirmBtn).toBeDisabled();
        expect(deleteStudy).not.toHaveBeenCalled();

        const typedField = screen.getByLabelText(/type the study slug/i);
        await userEvent.type(typedField, 'climate-pilot');
        expect(confirmBtn).toBeEnabled();

        await userEvent.click(confirmBtn);
        await waitFor(() => expect(deleteStudy).toHaveBeenCalledWith('climate-pilot'));
        expect(dialog).not.toBeInTheDocument();
    });

    it('does not call deleteStudy when the typed slug is wrong', async () => {
        renderWithProviders(<GeneralSettingsPage />);
        await userEvent.click(screen.getByRole('button', { name: /delete study/i }));

        const typedField = screen.getByLabelText(/type the study slug/i);
        await userEvent.type(typedField, 'wrong-slug');
        const confirmBtn = await screen.findByRole('button', { name: /^delete permanently$/i });
        expect(confirmBtn).toBeDisabled();
    });
});
