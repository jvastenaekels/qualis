import { renderWithProviders, screen } from '@/test-utils/test-utils';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { AdminDashboard } from './AdminDashboard';

// Hoisted mocks for generated API hooks
const { mockStudiesHook } = vi.hoisted(() => ({
    mockStudiesHook: vi.fn(),
}));

vi.mock('@/api/generated', () => ({
    useListStudiesApiAdminStudiesGet: mockStudiesHook,
}));

// Mock stores
const mockCurrentProject = {
    id: 1,
    slug: 'test-project',
    title: 'Test Project',
    user_role: 'owner',
};

vi.mock('@/store/useAuthStore', () => ({
    useAuthStore: () => ({ currentProject: mockCurrentProject }),
}));

const mockSetActiveStudy = vi.fn();
vi.mock('@/store/useAdminStore', () => ({
    useAdminStore: () => ({ setActiveStudy: mockSetActiveStudy }),
}));

// Mock child dialogs to avoid rendering complexity
vi.mock('@/components/admin/CreateStudyDialog', () => ({
    CreateStudyDialog: () => null,
}));
vi.mock('@/components/admin/ImportStudyDialog', () => ({
    ImportStudyDialog: () => null,
}));

// --- Helpers ---

const PROJECT_ID = 1;

function makeStudy(overrides: Record<string, unknown> = {}) {
    return {
        id: 1,
        slug: 'study-1',
        state: 'active',
        project_id: PROJECT_ID,
        participant_count: 12,
        created_at: '2025-12-01T00:00:00Z',
        translations: [{ language_code: 'en', title: 'My Study', pre_instruction: 'Welcome' }],
        statements: [{ id: 1, text: 'Statement 1' }],
        ...overrides,
    };
}

function setupDefaultHooks(overrides: { studies?: unknown[]; studiesLoading?: boolean } = {}) {
    const { studies = [], studiesLoading = false } = overrides;

    mockStudiesHook.mockReturnValue({
        data: { items: studies },
        isLoading: studiesLoading,
    });
}

describe('AdminDashboard', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('shows loading skeleton when data is loading', () => {
        setupDefaultHooks({ studiesLoading: true });

        const { container } = renderWithProviders(<AdminDashboard />);

        // The loading branch renders Skeleton components (pulse placeholders)
        const skeletons = container.querySelectorAll('[data-slot="skeleton"]');
        // If data-slot is not used, fall back to checking for animate-pulse class
        if (skeletons.length === 0) {
            const pulseElements = container.querySelectorAll('[class*="animate-pulse"]');
            expect(pulseElements.length).toBeGreaterThan(0);
        } else {
            expect(skeletons.length).toBeGreaterThan(0);
        }
    });

    it('shows onboarding when project has no studies', () => {
        setupDefaultHooks({ studies: [] });

        renderWithProviders(<AdminDashboard />);

        expect(screen.getByText('First steps')).toBeInTheDocument();
        expect(screen.getByText('Create your project')).toBeInTheDocument();
        expect(screen.getByText('Collect statements in the concourse')).toBeInTheDocument();
    });

    it('shows full dashboard with studies section when studies exist', () => {
        const study = makeStudy({
            state: 'active',
            participant_count: 5,
            end_date: '2027-06-01T00:00:00Z',
        });

        setupDefaultHooks({ studies: [study] });

        renderWithProviders(<AdminDashboard />);

        // Full dashboard shows project title and stats, not onboarding
        expect(screen.queryByText('First steps')).not.toBeInTheDocument();
        expect(screen.getByText('Test Project')).toBeInTheDocument();
    });

    it('shows SingleStudyCard layout when exactly 1 study exists', () => {
        const study = makeStudy({
            state: 'active',
            participant_count: 5,
            end_date: '2027-06-01T00:00:00Z',
        });

        setupDefaultHooks({ studies: [study] });

        renderWithProviders(<AdminDashboard />);

        // SingleStudyCard shows study title and tools (Design, Access, Data, Analysis)
        expect(screen.getByText('My Study')).toBeInTheDocument();
        expect(screen.getByText('Design')).toBeInTheDocument();
        expect(screen.getByText('Analysis')).toBeInTheDocument();
    });

    it('shows StudyGroups when multiple studies exist', () => {
        const study1 = makeStudy({
            id: 1,
            slug: 'study-1',
            state: 'active',
            participant_count: 5,
            end_date: '2027-06-01T00:00:00Z',
        });
        const study2 = makeStudy({
            id: 2,
            slug: 'study-2',
            state: 'draft',
            participant_count: 0,
            translations: [{ language_code: 'en', title: 'Second Study', pre_instruction: 'Hi' }],
        });

        setupDefaultHooks({ studies: [study1, study2] });

        renderWithProviders(<AdminDashboard />);

        // StudyGroups renders a "Studies" heading
        expect(screen.getByText('Studies')).toBeInTheDocument();
        expect(screen.getByText('My Study')).toBeInTheDocument();
        expect(screen.getByText('Second Study')).toBeInTheDocument();
    });

    it('shows alert when active study is near deadline', () => {
        const now = new Date();
        const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

        const study = makeStudy({
            state: 'active',
            participant_count: 2,
            end_date: threeDaysFromNow.toISOString(),
        });

        setupDefaultHooks({ studies: [study] });

        renderWithProviders(<AdminDashboard />);

        expect(screen.getByText('Needs attention')).toBeInTheDocument();
        // Alert message includes study name and days
        expect(screen.getByText(/My Study.*closing in 3 days/)).toBeInTheDocument();
    });
});
