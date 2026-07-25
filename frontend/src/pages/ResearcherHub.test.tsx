import { renderWithProviders, screen } from '@/test-utils/test-utils';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import ResearcherHub from './ResearcherHub';

const { mockUseAuthStore, mockUseAdminStore, mockProjectsHook, mockStudiesHook } = vi.hoisted(
    () => ({
        mockUseAuthStore: vi.fn(),
        mockUseAdminStore: vi.fn(),
        mockProjectsHook: vi.fn(),
        mockStudiesHook: vi.fn(),
    })
);

vi.mock('@/store/useAuthStore', () => ({
    useAuthStore: mockUseAuthStore,
}));

vi.mock('@/store/useAdminStore', () => ({
    useAdminStore: mockUseAdminStore,
}));

// The hub owns its data now: projects and studies come from the generated
// query hooks, not from the store (which ProjectSwitcher populates only inside
// AdminLayout — never on /hub, which was the empty-state bug).
vi.mock('@/api/generated', () => ({
    useListProjectsApiAdminProjectsGet: mockProjectsHook,
    useListStudiesAcrossProjectsApiAdminStudiesAcrossProjectsGet: mockStudiesHook,
}));

describe('ResearcherHub', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockUseAuthStore.mockReturnValue({
            user: { email: 'researcher@example.test', full_name: 'Researcher' },
        });
        mockUseAdminStore.mockReturnValue({
            setActiveStudy: vi.fn(),
            setActiveProject: vi.fn(),
        });
        mockProjectsHook.mockReturnValue({ data: { items: [] } });
        mockStudiesHook.mockReturnValue({ data: [] });
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

    it('renders the project card when projects exist, not the empty state', () => {
        // Regression guard for the /hub empty-state bug: the hub used to read
        // projects from the store, which is empty on this route, so a researcher
        // with a project saw "start your first project" anyway.
        mockProjectsHook.mockReturnValue({
            data: {
                items: [
                    {
                        id: 7,
                        title: 'Climate Perceptions',
                        slug: 'climate-perceptions',
                        user_role: 'owner',
                    },
                ],
            },
        });

        renderWithProviders(<ResearcherHub />);

        expect(screen.getByText('Climate Perceptions')).toBeInTheDocument();
        expect(
            screen.queryByRole('heading', { name: 'Start your first research project' })
        ).not.toBeInTheDocument();
    });

    it('groups a study under its project using project_id from the cross-project feed', () => {
        // Regression guard for the study-count bug: the hub can only show per-
        // project study counts if it receives studies from every project at once,
        // each carrying project_id. This is the shape the across-projects endpoint
        // returns (a bare array, not a paginated {items}).
        mockProjectsHook.mockReturnValue({
            data: {
                items: [
                    { id: 7, title: 'Climate Perceptions', slug: 'climate', user_role: 'owner' },
                ],
            },
        });
        mockStudiesHook.mockReturnValue({
            data: [
                {
                    id: 42,
                    project_id: 7,
                    slug: 'winter-sort',
                    state: 'active',
                    participant_count: 12,
                    translations: [{ language_code: 'en', title: 'Winter Sort' }],
                },
            ],
        });

        renderWithProviders(<ResearcherHub />);

        expect(screen.getByText('Winter Sort')).toBeInTheDocument();
    });
});
