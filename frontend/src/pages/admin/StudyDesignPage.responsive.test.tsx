import { renderWithProviders, screen } from '@/test-utils/test-utils';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/test-utils/server';
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
        useParams: vi.fn(() => ({ slug: 'test-study-responsive' })),
        useNavigate: vi.fn(() => vi.fn()),
        // Mock MemoryRouter to avoid nested router in preview
        MemoryRouter: ({ children }: { children: React.ReactNode }) => children,
        useBlocker: vi
            .fn()
            .mockReturnValue({ state: 'unblocked', proceed: vi.fn(), reset: vi.fn() }),
        useBeforeUnload: vi.fn(),
    };
});

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
};

describe('StudyDesignPage Responsive Layout', () => {
    const mockStudy = {
        id: 1,
        slug: 'test-study-responsive',
        title: 'Responsive Test Study',
        state: 'draft',
        grid_config: [{ column_id: 1, value: -3, count: 2 }],
        presort_config: {},
        postsort_config: {},
        branding: {},
        translations: [
            {
                language_code: 'en',
                title: 'Responsive Test Study',
                subtitle: 'Test',
            },
        ],
        statements: [],
    };

    beforeEach(() => {
        // Mock matchMedia for Desktop
        Object.defineProperty(window, 'matchMedia', {
            writable: true,
            value: vi.fn().mockImplementation((query) => ({
                matches: false,
                media: query,
                onchange: null,
                addListener: vi.fn(),
                removeListener: vi.fn(),
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
                dispatchEvent: vi.fn(),
            })),
        });

        useAuthStore.setState({
            user: { id: 1, email: 'admin@open-q.dev' },
            isAuthenticated: true,
        });
        useStudyDesigner.getState().resetDraft();

        server.use(
            http.get('*/api/admin/studies/test-study-responsive', () => {
                return HttpResponse.json(mockStudy);
            }),
            http.patch('*/api/admin/studies/test-study-responsive', async ({ request }) => {
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
            initialEntries: ['/admin/studies/test-study-responsive/design'],
        });
    };

    it('page renders with main tabs', async () => {
        renderPage();

        // Wait for page to load
        const welcomeTab = await screen.findByRole('tab', {
            name: /(Welcome|admin\.design\.tabs\.welcome)/i,
        });
        expect(welcomeTab).toBeTruthy();

        // Verify other tabs exist
        expect(
            screen.getByRole('tab', { name: /(Q-sort|admin\.design\.tabs\.qsort)/i })
        ).toBeTruthy();
        expect(
            screen.getByRole('tab', {
                name: /(Interface|admin\.design\.tabs\.interface)/i,
            })
        ).toBeTruthy();
    });

    it.skip('editor content area renders', async () => {
        renderPage();

        await screen.findByRole(
            'tab',
            { name: /(Welcome|admin\.design\.tabs\.welcome)/i },
            { timeout: 5000 }
        );

        // Verify the form inputs are present (indicates editor rendered)
        await screen.findByDisplayValue('Responsive Test Study');
    });
});
