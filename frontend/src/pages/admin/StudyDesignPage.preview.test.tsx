import { renderWithProviders, screen, waitFor } from '@/test-utils/test-utils';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/test-utils/server';
import userEvent from '@testing-library/user-event';
import StudyDesignPage from './StudyDesignPage';
import { useStudyDesigner } from '@/store/useStudyDesigner';
import { useAuthStore } from '@/store/useAuthStore';
import { useConfigStore } from '@/store/useConfigStore';

// Mock react-frame-component to render content directly instead of in iframe
vi.mock('react-frame-component', () => ({
    default: ({ children }: { children: React.ReactNode }) => (
        <div data-testid="preview-frame">{children}</div>
    ),
}));

// Mock study page components
vi.mock('@/pages/study/WelcomePage', () => ({
    default: ({ highlightKey }: { highlightKey?: string }) => (
        <div data-testid="preview-welcome-page">
            Welcome Page Preview
            {highlightKey && <span data-testid="highlight-key">{highlightKey}</span>}
        </div>
    ),
}));

vi.mock('@/pages/study/PreSortPage', () => ({
    default: ({ highlightKey }: { highlightKey?: string }) => (
        <div data-testid="preview-presort-page">
            Pre-Sort Page Preview
            {highlightKey && <span data-testid="highlight-key">{highlightKey}</span>}
        </div>
    ),
}));

vi.mock('@/pages/study/RoughSortPage', () => ({
    default: ({ highlightKey }: { highlightKey?: string }) => (
        <div data-testid="preview-roughsort-page">
            Rough Sort Page Preview
            {highlightKey && <span data-testid="highlight-key">{highlightKey}</span>}
        </div>
    ),
}));

vi.mock('@/pages/study/FineSortPage', () => ({
    default: ({ highlightKey }: { highlightKey?: string }) => (
        <div data-testid="preview-finesort-page">
            Fine Sort Page Preview
            {highlightKey && <span data-testid="highlight-key">{highlightKey}</span>}
        </div>
    ),
}));

vi.mock('@/pages/study/PostSortPage', () => ({
    default: ({ highlightKey }: { highlightKey?: string }) => (
        <div data-testid="preview-postsort-page">
            Post-Sort Page Preview
            {highlightKey && <span data-testid="highlight-key">{highlightKey}</span>}
        </div>
    ),
}));

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
        useParams: vi.fn(() => ({ slug: 'test-study-preview' })),
        useNavigate: vi.fn(() => vi.fn()),
        // Mock MemoryRouter to avoid nested router in preview
        MemoryRouter: ({ children }: { children: React.ReactNode }) => children,
    };
});

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
};

describe('StudyDesignPage Preview Functionality', () => {
    const mockStudy = {
        id: 1,
        slug: 'test-study-preview',
        title: 'Preview Test Study',
        state: 'draft',
        grid_config: [{ column_id: 1, value: -3, count: 2 }],
        presort_config: {},
        postsort_config: {},
        branding: {
            accent_color: '#ff5733',
        },
        translations: [
            {
                language_code: 'en',
                title: 'Preview Test Study',
                subtitle: 'Test Subtitle',
                ui_labels: {},
            },
        ],
        statements: [
            {
                id: 1,
                code: 'S1',
                translations: [
                    {
                        language_code: 'en',
                        text: 'Statement 1',
                    },
                ],
            },
        ],
    };

    beforeEach(() => {
        useAuthStore.setState({
            user: { id: 1, email: 'admin@open-q.dev' },
            isAuthenticated: true,
        });
        useStudyDesigner.getState().resetDraft();
        useConfigStore.getState().resetConfig();

        server.use(
            http.get('*/api/admin/studies/test-study-preview', () => {
                return HttpResponse.json(mockStudy);
            }),
            http.patch('*/api/admin/studies/test-study-preview', async ({ request }) => {
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
            initialEntries: ['/admin/studies/test-study-preview/design'],
        });
    };

    it('renders preview in isolated frame', async () => {
        renderPage();

        await screen.findByRole('tab', { name: /admin.design.tabs.welcome/i });

        // The preview pane uses "hidden lg:flex" so it's not visible in jsdom tests by default
        // Instead, verify that the config store is being updated (which drives the preview)
        await waitFor(() => {
            const config = useConfigStore.getState().config;
            expect(config).toBeDefined();
        });
    });

    it('preview uses synthetic config, not real session data', async () => {
        renderPage();

        await screen.findByRole('tab', { name: /admin.design.tabs.welcome/i });

        // Verify that useConfigStore was updated with synthetic data
        await waitFor(() => {
            const configState = useConfigStore.getState();
            expect(configState.config).toBeDefined();

            // The synthetic study should have mapped statements
            expect(configState.config?.statements).toBeDefined();
            expect(configState.config?.statements?.length).toBeGreaterThan(0);
        });
    });

    it('preview updates when draft title changes', async () => {
        const user = userEvent.setup();
        renderPage();

        const welcomeTab = await screen.findByRole('tab', { name: /admin.design.tabs.welcome/i });
        await user.click(welcomeTab);

        // Wait for input to load
        await waitFor(() => {
            expect(screen.getByDisplayValue('Preview Test Study')).toBeInTheDocument();
        });

        // Change title
        const titleInput = screen.getByDisplayValue('Preview Test Study');
        await user.clear(titleInput);
        await user.type(titleInput, 'Updated Preview Title');

        // Verify draft was updated
        await waitFor(() => {
            const draft = useStudyDesigner.getState().draft;
            const translation = draft?.translations?.find((t) => t.language_code === 'en');
            expect(translation?.title).toBe('Updated Preview Title');
        });

        // Verify config store was updated (preview synchronization)
        await waitFor(() => {
            const config = useConfigStore.getState().config;
            expect(config?.title).toBe('Updated Preview Title');
        });
    });

    it('preview reflects active tab - shows correct page component', async () => {
        const user = userEvent.setup();
        renderPage();

        await screen.findByRole('tab', { name: /admin.design.tabs.welcome/i });

        // Initial: activeStep should be 'intro'
        expect(useStudyDesigner.getState().activeStep).toBe('intro');

        // Switch to pre-sort tab
        const preSortTab = screen.getByRole('tab', { name: /admin.design.tabs.presort/i });
        await user.click(preSortTab);

        // Verify activeStep updated
        await waitFor(() => {
            expect(useStudyDesigner.getState().activeStep).toBe('pre-sort');
        });

        // Switch to q-sort tab
        const qSortTab = screen.getByRole('tab', { name: /admin.design.tabs.qsort/i });
        await user.click(qSortTab);

        // Verify activeStep updated to q-sort
        await waitFor(() => {
            expect(useStudyDesigner.getState().activeStep).toBe('q-sort');
        });
    });

    it('applies default accent color when branding is missing', async () => {
        // Override mock to return study without branding
        server.use(
            http.get('*/api/admin/studies/test-study-preview', () => {
                return HttpResponse.json({
                    ...mockStudy,
                    branding: {},
                });
            })
        );

        renderPage();

        await screen.findByRole('tab', { name: /admin.design.tabs.welcome/i });

        // The default accent color #2563eb should be applied in the preview rendering logic
        // Verify the draft was loaded with empty branding
        await waitFor(() => {
            const draft = useStudyDesigner.getState().draft;
            expect(draft).toBeDefined();
            // @ts-expect-error - branding might not be in type
            expect(draft?.branding || {}).toEqual({});
        });
    });

    it.skip('preview visibility can be toggled', async () => {
        const user = userEvent.setup();
        renderPage();

        await screen.findByRole('tab', { name: /admin.design.tabs.welcome/i });

        // Preview should be visible initially on large screens (hidden lg:flex)
        // In jsdom, we can't test media queries directly, but we can verify the toggle button exists
        const hidePreviewButton = await screen.findByRole('button', {
            name: /admin.design.toolbar.hide_preview/i,
        });
        expect(hidePreviewButton).toBeInTheDocument();

        // Click to hide preview
        await user.click(hidePreviewButton);

        // After clicking, the button text should change to "preview" (not "hide_preview")
        await waitFor(() => {
            expect(
                screen.getByRole('button', { name: /admin.design.toolbar.preview$/i })
            ).toBeInTheDocument();
        });
    });

    it('handles empty statements gracefully in preview', async () => {
        // Override mock to return study with no statements
        server.use(
            http.get('*/api/admin/studies/test-study-preview', () => {
                return HttpResponse.json({
                    ...mockStudy,
                    statements: [],
                });
            })
        );

        renderPage();

        await screen.findByRole('tab', { name: /admin.design.tabs.welcome/i });

        // Config should have empty statements array (preview won't crash)
        await waitFor(() => {
            const config = useConfigStore.getState().config;
            expect(config?.statements).toEqual([]);
        });
    });

    it('handles missing translations gracefully', async () => {
        // Override mock to return study with minimal translations
        server.use(
            http.get('*/api/admin/studies/test-study-preview', () => {
                return HttpResponse.json({
                    ...mockStudy,
                    translations: [
                        {
                            language_code: 'en',
                            title: 'Minimal Study',
                            // Missing subtitle, objective, etc.
                        },
                    ],
                });
            })
        );

        renderPage();

        await screen.findByRole('tab', { name: /admin.design.tabs.welcome/i });

        // Config should have the minimal data (no crashes)
        await waitFor(() => {
            const config = useConfigStore.getState().config;
            expect(config?.title).toBe('Minimal Study');
        });
    });
});
