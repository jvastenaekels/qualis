import { renderWithProviders, screen } from '@/test-utils/test-utils';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import ResearcherHub from './ResearcherHub';

const { mockUseAuthStore, mockUseAdminStore, mockStudiesHook } = vi.hoisted(() => ({
    mockUseAuthStore: vi.fn(),
    mockUseAdminStore: vi.fn(),
    mockStudiesHook: vi.fn(),
}));

vi.mock('@/store/useAuthStore', () => ({
    useAuthStore: mockUseAuthStore,
}));

vi.mock('@/store/useAdminStore', () => ({
    useAdminStore: mockUseAdminStore,
}));

vi.mock('@/api/generated', () => ({
    useListStudiesApiAdminStudiesGet: mockStudiesHook,
}));

describe('ResearcherHub', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockUseAuthStore.mockReturnValue({
            projects: [],
            user: { email: 'researcher@example.test', full_name: 'Researcher' },
        });
        mockUseAdminStore.mockReturnValue({
            setActiveStudy: vi.fn(),
            setActiveProject: vi.fn(),
        });
        mockStudiesHook.mockReturnValue({ data: { items: [] } });
    });

    it('shows a focused zero-project landing page without duplicate create actions', () => {
        renderWithProviders(<ResearcherHub />);

        expect(
            screen.getByRole('heading', { name: 'Start your first research project' })
        ).toBeInTheDocument();
        expect(
            screen.getByText('Create a project before adding concourses, Q-sets, or studies.')
        ).toBeInTheDocument();
        expect(screen.getAllByRole('button', { name: /new project/i })).toHaveLength(1);
    });
});
