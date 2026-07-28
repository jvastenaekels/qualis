import { renderWithProviders, screen } from '@/test-utils/test-utils';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { Routes, Route } from 'react-router-dom';
import { AdminDashboard } from './AdminDashboard';

// Hoisted mocks for generated API hooks
const { mockStudiesHook, mockConcoursesHook } = vi.hoisted(() => ({
    mockStudiesHook: vi.fn(),
    mockConcoursesHook: vi.fn(() => ({ data: { items: [] }, isLoading: false })),
}));

vi.mock('@/api/generated', () => ({
    useListStudiesApiAdminStudiesGet: mockStudiesHook,
    useListConcoursesApiAdminConcoursesGet: mockConcoursesHook,
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

    it('keeps onboarding visible while the first study is still a draft', () => {
        setupDefaultHooks({ studies: [makeStudy({ state: 'draft' })] });

        renderWithProviders(<AdminDashboard />);

        expect(screen.getByText('First steps')).toBeInTheDocument();
        expect(screen.getByText('Launch recruitment')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Open study' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Create study' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Import study' })).toBeInTheDocument();
    });

    it('shows SingleStudyCard layout when exactly 1 study exists', () => {
        const study = makeStudy({
            state: 'active',
            participant_count: 5,
            end_date: '2027-06-01T00:00:00Z',
        });

        setupDefaultHooks({ studies: [study] });

        renderWithProviders(<AdminDashboard />);

        // Wave D — D5: SingleStudyCard no longer shows the 4-button sub-action
        // grid (Design / Access / Data / Analysis). The card carries title +
        // metadata + state badge; sub-actions live in the study sidebar after
        // clicking through. Asserting on the title is enough.
        expect(screen.getByText('My Study')).toBeInTheDocument();
        expect(screen.queryByText('Design')).not.toBeInTheDocument();
        expect(screen.queryByText('Analysis')).not.toBeInTheDocument();
    });

    it('offers exactly one study-creation action (task 5.3)', () => {
        // The page header's "Create study" and the Studies section's "Add study"
        // opened the same dialog ~160px apart in two different button styles.
        // The page header is the established home for primary actions.
        setupDefaultHooks({ studies: [makeStudy({ state: 'active' })] });

        renderWithProviders(<AdminDashboard />);

        expect(screen.getAllByRole('button', { name: /(create|add) study/i })).toHaveLength(1);
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

        // Multi-study branch renders the StudyGroups directly (no parent
        // "Studies" header — subgroup labels carry the semantics).
        expect(screen.getByText('My Study')).toBeInTheDocument();
        expect(screen.getByText('Second Study')).toBeInTheDocument();
    });

    it('keeps the Concourse heading level with Studies, with no skipped level', () => {
        const study = makeStudy({ state: 'active' });
        setupDefaultHooks({ studies: [study] });

        renderWithProviders(<AdminDashboard />);

        // Positive: Concourse sits at the same level as the Studies heading.
        expect(screen.getByRole('heading', { level: 2, name: 'Concourse' })).toBeInTheDocument();
        expect(screen.getByRole('heading', { level: 2, name: 'Studies' })).toBeInTheDocument();

        // Negative: it is no longer demoted to level 3, which skipped a level
        // under the page's level-1 heading and preceded its level-2 sibling.
        expect(
            screen.queryByRole('heading', { level: 3, name: 'Concourse' })
        ).not.toBeInTheDocument();
    });

    // ── Headings must survive the accessibility tree (review finding 2) ──
    // WAI-ARIA §5.2.7 gives `button` presentational children: Chrome and
    // Firefox prune heading descendants of a button from the accessibility
    // tree. `dom-testing-library`'s role engine does not implement that rule,
    // so `getByRole('heading', …)` alone cannot tell a real heading from one
    // a screen reader will never hear. These tests assert the structure the
    // rule turns on — the heading must not sit inside the card button — and
    // pair it with the card staying operable.
    it('keeps the card headings outside the card button, so AT can hear them', () => {
        setupDefaultHooks({ studies: [makeStudy({ state: 'active' })] });

        renderWithProviders(<AdminDashboard />);

        const concourseHeading = screen.getByRole('heading', { level: 2, name: 'Concourse' });
        const studyHeading = screen.getByRole('heading', { level: 3, name: 'My Study' });

        // Negative: neither heading is pruned by an ancestor button role.
        expect(concourseHeading.closest('button')).toBeNull();
        expect(studyHeading.closest('button')).toBeNull();

        // Positive: each card is still a real button, and now takes its
        // accessible name from the heading it labels rather than from the
        // whole card blurb.
        expect(screen.getByRole('button', { name: 'Concourse' }).tagName).toBe('BUTTON');
        expect(screen.getByRole('button', { name: 'My Study' }).tagName).toBe('BUTTON');
    });

    it('keeps multi-study row headings outside the row button', () => {
        setupDefaultHooks({
            studies: [
                makeStudy({ id: 1, slug: 'study-1', state: 'active' }),
                makeStudy({
                    id: 2,
                    slug: 'study-2',
                    state: 'draft',
                    translations: [
                        { language_code: 'en', title: 'Second Study', pre_instruction: 'Hi' },
                    ],
                }),
            ],
        });

        renderWithProviders(<AdminDashboard />);

        const rowHeading = screen.getByRole('heading', { level: 3, name: 'Second Study' });

        // Negative: not pruned by an ancestor button role.
        expect(rowHeading.closest('button')).toBeNull();
        // Positive: the row is still operable and named by its heading.
        expect(screen.getByRole('button', { name: 'Second Study' }).tagName).toBe('BUTTON');
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

    describe('keyboard-operable cards', () => {
        // Real navigation (Routes/Route), not a mocked `useNavigate` — same
        // pattern as AdminDashboard.onboarding.test.tsx. Proves the whole
        // chain: focusable -> Enter -> onClick -> navigate -> route change,
        // not just that some callback fired.
        function renderDashboardWithRoutes() {
            return renderWithProviders(
                <Routes>
                    <Route path="/app/:projectSlug/dashboard" element={<AdminDashboard />} />
                    <Route
                        path="/app/:projectSlug/studies/:slug"
                        element={<div data-testid="study-detail" />}
                    />
                    <Route
                        path="/app/:projectSlug/concourses"
                        element={<div data-testid="concourse-page" />}
                    />
                </Routes>,
                { initialEntries: ['/app/test-project/dashboard'] }
            );
        }

        it('exposes the single-study card as a real, keyboard-operable button', async () => {
            const user = userEvent.setup();
            setupDefaultHooks({ studies: [makeStudy({ state: 'active' })] });

            renderDashboardWithRoutes();

            const card = screen.getByRole('button', { name: /my study/i });
            // Positive: it is a genuine <button>, not a div faking the role.
            expect(card.tagName).toBe('BUTTON');
            // Negative: no hand-rolled role attribute needed — the tag itself
            // carries the semantics.
            expect(card).not.toHaveAttribute('role');
            // Negative: nothing has navigated yet.
            expect(screen.queryByTestId('study-detail')).not.toBeInTheDocument();

            card.focus();
            await user.keyboard('{Enter}');

            // Positive: Enter on the focused card actually navigated.
            expect(await screen.findByTestId('study-detail')).toBeInTheDocument();
        });

        it('exposes multi-study rows as real buttons, not ARIA-only divs', async () => {
            const user = userEvent.setup();
            const study1 = makeStudy({ id: 1, slug: 'study-1', state: 'active' });
            const study2 = makeStudy({
                id: 2,
                slug: 'study-2',
                state: 'draft',
                translations: [
                    { language_code: 'en', title: 'Second Study', pre_instruction: 'Hi' },
                ],
            });
            setupDefaultHooks({ studies: [study1, study2] });

            renderDashboardWithRoutes();

            const row = screen.getByRole('button', { name: /second study/i });
            expect(row.tagName).toBe('BUTTON');
            expect(row).not.toHaveAttribute('role');
            expect(screen.queryByTestId('study-detail')).not.toBeInTheDocument();

            row.focus();
            await user.keyboard('{Enter}');

            expect(await screen.findByTestId('study-detail')).toBeInTheDocument();
        });

        it('exposes the concourse card as a real button, not an ARIA-only div', async () => {
            const user = userEvent.setup();
            setupDefaultHooks({ studies: [makeStudy({ state: 'active' })] });

            renderDashboardWithRoutes();

            const card = screen.getByRole('button', { name: /concourse/i });
            expect(card.tagName).toBe('BUTTON');
            expect(card).not.toHaveAttribute('role');
            expect(screen.queryByTestId('concourse-page')).not.toBeInTheDocument();

            card.focus();
            await user.keyboard('{Enter}');

            expect(await screen.findByTestId('concourse-page')).toBeInTheDocument();
        });
    });
});
