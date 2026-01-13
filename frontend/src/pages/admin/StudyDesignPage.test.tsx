import { renderWithProviders, screen, waitFor, fireEvent } from '@/test-utils/test-utils';
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
        warning: vi.fn(),
        info: vi.fn(),
    },
}));

// Mock react-router-dom
vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
    return {
        ...actual,
        useParams: vi.fn(() => ({ slug: 'test-study-designer' })),
        useNavigate: vi.fn(() => vi.fn()),
        MemoryRouter: ({ children }: { children: React.ReactNode }) => children,
    };
});

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
};

describe('StudyDesignPage Feature Tests', () => {
    const mockStudy = {
        id: 1,
        slug: 'test-study-designer',
        title: 'Draft Study',
        state: 'draft',
        grid_config: [
            { score: -1, capacity: 2 },
            { score: 0, capacity: 2 },
            { score: 1, capacity: 2 },
        ],
        statements: [
            { code: 's1', translations: [{ language_code: 'en', text: 'S1' }] },
            { code: 's2', translations: [{ language_code: 'en', text: 'S2' }] },
            { code: 's3', translations: [{ language_code: 'en', text: 'S3' }] },
            { code: 's4', translations: [{ language_code: 'en', text: 'S4' }] },
            { code: 's5', translations: [{ language_code: 'en', text: 'S5' }] },
            { code: 's6', translations: [{ language_code: 'en', text: 'S6' }] },
        ],
        branding: { primary_color: '#4f46e5' },
        translations: [
            {
                language_code: 'en',
                title: 'Draft Study',
                condition_of_instruction: 'Test instruction',
                pre_instruction: 'Test pre-instruction',
                consent_title: 'Test Consent',
                consent_description: 'Test Description',
            },
        ],
    };

    beforeEach(() => {
        useAuthStore.setState({
            user: { id: 1, email: 'admin@open-q.dev' },
            isAuthenticated: true,
        });
        useStudyDesigner.getState().resetDraft();

        server.use(
            http.get('*/api/admin/studies/test-study-designer', () => {
                return HttpResponse.json(mockStudy);
            })
        );
    });

    afterEach(() => {
        server.resetHandlers();
    });

    const renderPage = () => {
        return renderWithProviders(<StudyDesignPage />, {
            initialEntries: ['/admin/studies/test-study-designer/design'],
        });
    };

    it('renders the launch readiness checklist', async () => {
        renderPage();
        expect(await screen.findByTestId('readiness-checklist')).toBeInTheDocument();

        // Check for specific checklist items
        expect(screen.getAllByText(/^Statements$/i)[0]).toBeInTheDocument();
        expect(screen.getByText(/Grid balanced/i)).toBeInTheDocument();
    });

    it('signals ready status in checklist when all required fields are valid', async () => {
        renderPage();

        await waitFor(() => {
            const status = screen.getByTestId('checklist-status');
            expect(status.textContent).toMatch(/All essential parts are ready/i);

            const progress = screen.getByTestId('checklist-progress')
                .firstElementChild as HTMLElement;
            // 3 required items in mockStudy: Statements (3), Grid (6 slots, 6 items), Instructions (Test instruction)
            // Wait, mockStudy has these:
            // statements: length 6
            // grid_config: capacity 6
            // condition_of_instruction: 'Test instruction'
            // Branding: primary_color exists
            // All 4 required items are complete (I removed Branding from required in the code actually, let's check)
            expect(progress.style.width).toBe('100%');
        });
    });

    it('signals pending status when grid is unbalanced', async () => {
        // Mock a study with unbalanced grid
        server.use(
            http.get('*/api/admin/studies/test-study-designer', () => {
                return HttpResponse.json({
                    ...mockStudy,
                    statements: [...mockStudy.statements, { code: 's7', translations: [] }],
                });
            })
        );

        renderPage();

        await waitFor(() => {
            const status = screen.getByTestId('checklist-status');
            expect(status.textContent).toMatch(/Complete the required steps/i);
        });
    });

    it('enables sequential navigation between steps', async () => {
        renderPage();

        // Should start at Welcome tab
        expect(await screen.findByText(/Welcome to the Studio/i)).toBeInTheDocument();

        // Click "Next Step" - using fireEvent to bypass potential pointer-events issues in JSDOM
        const nextButton = await screen.findByTestId('next-step-button');
        fireEvent.click(nextButton);

        // Should move to Presort
        await waitFor(() => {
            expect(screen.getByText(/📋/)).toBeInTheDocument(); // Icon for Pre-sort tab
        });

        // Click "Back"
        const backButton = await screen.findByTestId('back-step-button');
        fireEvent.click(backButton);

        // Should be back at Welcome
        await waitFor(() => {
            expect(screen.getByText(/Welcome to the Studio/i)).toBeInTheDocument();
        });
    });
});
