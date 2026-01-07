import { renderWithProviders, screen, waitFor } from '@/test-utils/test-utils';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/test-utils/server';
import userEvent from '@testing-library/user-event';
import StudyDesignPage from './StudyDesignPage';
import { useStudyDesigner } from '@/store/useStudyDesigner';
import { useAuthStore } from '@/store/useAuthStore';

// Mock Sonner toast
vi.mock('sonner', () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn(),
    },
}));

// Mock react-router-dom useParams
vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
    return {
        ...actual,
        useParams: vi.fn(() => ({ slug: 'test-study-integration' })),
        useNavigate: vi.fn(() => vi.fn()),
        // Mock MemoryRouter to avoid nested router in preview
        MemoryRouter: ({ children }: { children: React.ReactNode }) => children,
    };
});

// Mock ResizeObserver for Tabs (common issue in jsdom)
global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
};

describe('StudyDesignPage Integration', () => {
    const mockStudy = {
        id: 1,
        slug: 'test-study-integration',
        title: 'Integration Test Study',
        state: 'draft',
        grid_config: [],
        presort_config: {},
        postsort_config: {},
        branding: {},
        translations: [
            {
                language_code: 'en',
                title: 'Integration Test Study',
                ui_labels: {},
            },
        ],
        statements: [],
    };

    beforeEach(() => {
        // Authenticate
        useAuthStore.setState({ user: { id: 1, email: 'admin@openq.dev' }, isAuthenticated: true });

        // Reset Store
        useStudyDesigner.getState().resetDraft();

        // Mock API handlers
        server.use(
            http.get('*/api/admin/studies/test-study-integration', () => {
                return HttpResponse.json(mockStudy);
            }),
            http.patch('*/api/admin/studies/test-study-integration', async ({ request }) => {
                const body = await request.json();
                return HttpResponse.json({ ...mockStudy, ...(body as object) });
            })
        );
    });

    afterEach(() => {
        server.resetHandlers();
    });

    const renderPage = () => {
        return renderWithProviders(<StudyDesignPage />, {
            initialEntries: ['/admin/studies/test-study-integration/design'],
        });
    };

    it('loads study data and renders the shell', async () => {
        renderPage();

        // Wait for Loading State to disappear or Data to appear
        // The page layout renders tabs. "Welcome" is the default tab name locally.
        const welcomeTab = await screen.findByRole('tab', { name: /admin.design.tabs.welcome/i });
        expect(welcomeTab).toBeInTheDocument();

        // Verify loaded data injected into store
        // Introduction tab is default 'intro'.
        // Inside IntroductionEditor, we expect input with value "Integration Test Study"
        await waitFor(() => {
            expect(screen.getByDisplayValue('Integration Test Study')).toBeInTheDocument();
        });
    });

    it('switches tabs correctly', async () => {
        const user = userEvent.setup();
        renderPage();

        // Use role to find tab
        const welcomeTab = await screen.findByRole('tab', { name: /admin.design.tabs.welcome/i });
        expect(welcomeTab).toBeInTheDocument();

        // Click on "Q-Sort" tab
        const qSortTab = screen.getByRole('tab', { name: /admin.design.tabs.qsort/i });
        await user.click(qSortTab);

        // Expect QSortEditor to appear
        await waitFor(() => {
            expect(screen.getByText(/admin.design.guidance.qsort_title/i)).toBeInTheDocument();
        });

        expect(useStudyDesigner.getState().activeStep).toBe('q-sort');
    });

    it('allows editing form inputs', async () => {
        const user = userEvent.setup();
        renderPage();

        // Wait for page to initialize and ensure we are on the welcome tab
        const welcomeTab = await screen.findByRole('tab', { name: /admin.design.tabs.welcome/i });
        await user.click(welcomeTab);

        // Wait for data to populate
        await waitFor(() => {
            expect(screen.getByDisplayValue('Integration Test Study')).toBeInTheDocument();
        });

        const titleInput = screen.getByDisplayValue('Integration Test Study');

        // Verify input is interactive
        await user.clear(titleInput);
        await user.type(titleInput, 'Updated Title');

        // Verify the input value changed
        expect(titleInput).toHaveValue('Updated Title');
    });
});
