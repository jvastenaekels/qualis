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
        useParams: vi.fn(() => ({
            studySlug: 'test-study-designer',
            projectSlug: 'test-workspace',
        })),
        useNavigate: vi.fn(() => vi.fn()),
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

                consent_title: 'Test Consent',
                consent_description: 'Test Description',
            },
        ],
    };

    beforeEach(() => {
        useAuthStore.setState({
            user: { id: 1, email: 'admin@qualis.dev' },
            isAuthenticated: true,
        });
        useStudyDesigner.getState().resetDraft();

        server.use(
            http.get('*/api/admin/studies/test-study-designer', () => {
                return HttpResponse.json(mockStudy);
            }),
            // Default to no participants so the rough-sort toggle is unlocked.
            // Individual tests can override this handler to assert the lock policy.
            http.get('*/api/admin/studies/test-study-designer/participants', () => {
                return HttpResponse.json({ items: [], total: 0 });
            })
        );
    });

    afterEach(() => {
        server.resetHandlers();
    });

    const renderPage = (slug = 'test-study-designer') => {
        return renderWithProviders(<StudyDesignPage />, {
            initialEntries: [`/admin/studies/${slug}/design`],
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
            // Check for specific checklist items and their completion
            const incompleteItems = screen.queryAllByTestId('checklist-item-incomplete');
            expect(incompleteItems).toHaveLength(0);
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

        await waitFor(
            async () => {
                // The "Grid balanced" item should be incomplete
                const incompleteItems = await screen.findAllByTestId('checklist-item-incomplete');
                expect(incompleteItems.length).toBeGreaterThan(0);
            },
            { timeout: 15000 }
        );
    });

    it('shows draft mode button when study is active', async () => {
        server.use(
            http.get('*/api/admin/studies/test-study-designer', () => {
                return HttpResponse.json({ ...mockStudy, state: 'active' });
            })
        );

        renderPage();

        const draftButton = await screen.findByRole('button', { name: /Draft Mode/i });
        expect(draftButton).toBeInTheDocument();
    });

    it('does not show draft mode button when study is paused', async () => {
        server.use(
            http.get('*/api/admin/studies/test-study-designer', () => {
                return HttpResponse.json({ ...mockStudy, state: 'paused' });
            })
        );

        renderPage();

        // Wait for the overlay to render (status badge appears)
        await screen.findByTestId('study-status');
        expect(screen.queryByRole('button', { name: /Draft Mode/i })).not.toBeInTheDocument();
    });

    // ── Rough-sort toggle (Phase 3 task 17) ───────────────────────
    // The toggle was moved into the Consignes (condition) tab so the
    // admin can pair the on/off switch with the matching pre-sort
    // instruction text. Tests pre-select that tab by seeding the
    // designer store to avoid extra clicks in Tabs UI.
    const seedConditionTab = () => {
        useStudyDesigner.setState({ activeStep: 'condition' });
    };

    it('renders the rough_sort toggle label and reflects the saved value', async () => {
        // mockStudy has rough_sort_enabled implicitly true (defaulted by store)
        seedConditionTab();
        renderPage();

        const toggle = await screen.findByTestId('rough-sort-toggle');
        expect(toggle).toBeInTheDocument();
        expect(toggle).toBeChecked();
        expect(toggle).not.toBeDisabled();
        // Label should render via i18n key (or its English fallback)
        expect(screen.getByText(/Enable preliminary sort \(3-pile triage\)/i)).toBeInTheDocument();
    });

    it('disables the toggle and shows lock banner when participants have started', async () => {
        // 3 participants past consent, 1 only on consent (should not count)
        server.use(
            http.get('*/api/admin/studies/test-study-designer/participants', () => {
                return HttpResponse.json({
                    items: [
                        { id: 1, last_step_reached: 2 },
                        { id: 2, last_step_reached: 3 },
                        { id: 3, last_step_reached: 4 },
                        { id: 4, last_step_reached: 1 },
                    ],
                    total: 4,
                });
            })
        );
        seedConditionTab();
        renderPage();

        const toggle = await screen.findByTestId('rough-sort-toggle');
        await waitFor(() => {
            expect(toggle).toBeDisabled();
        });
        const banner = await screen.findByTestId('rough-sort-lock-banner');
        // Count is interpolated via i18n {{count}} → text contains "3"
        expect(banner.textContent).toContain('3');
    });

    it('enables sequential navigation between steps', async () => {
        renderPage();

        // Should start at Welcome tab
        expect(await screen.findByText(/👋/)).toBeInTheDocument(); // Icon for Welcome tab

        // Click "Next Step"
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
            expect(screen.getByText(/👋/)).toBeInTheDocument();
        });
    });
});
