import { renderWithProviders, screen, waitFor, within, fireEvent } from '@/test-utils/test-utils';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/test-utils/server';
import i18n from '@/test-utils/i18n-test';
import frAdmin from '../../../public/locales/fr/admin.json';
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
        // Even without a "Draft Mode" affordance, the paused notice must still
        // be a real, accessible, dismissible dialog — not a trap.
        const dialog = await screen.findByRole('dialog');
        expect(dialog).toHaveAccessibleName(/paused/i);
        expect(screen.getByRole('button', { name: /view read-only/i })).toBeInTheDocument();
    });

    // ── Lock notice is a real dialog, not a trap (Phase 3 task 3.2) ─
    it('exposes the lock notice as an accessible dialog, not an orphan heading', async () => {
        server.use(
            http.get('*/api/admin/studies/test-study-designer', () => {
                return HttpResponse.json({ ...mockStudy, state: 'active' });
            })
        );

        renderPage();

        const dialog = await screen.findByRole('dialog');
        expect(dialog).toHaveAccessibleName(/active/i);
        // The old implementation rendered the message as an orphan <h3> with
        // no dialog semantics at all; that heading must be gone now that the
        // message lives inside a properly labelled dialog.
        expect(
            screen.queryByRole('heading', { level: 3, name: /active/i })
        ).not.toBeInTheDocument();
    });

    it('dismisses the lock dialog on Escape', async () => {
        const user = userEvent.setup();
        server.use(
            http.get('*/api/admin/studies/test-study-designer', () => {
                return HttpResponse.json({ ...mockStudy, state: 'active' });
            })
        );

        renderPage();

        await screen.findByRole('dialog');
        await user.keyboard('{Escape}');

        await waitFor(() => {
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        });
    });

    it('can be dismissed via "View read-only", leaving the configuration visible but inert', async () => {
        const user = userEvent.setup();
        server.use(
            http.get('*/api/admin/studies/test-study-designer', () => {
                return HttpResponse.json({ ...mockStudy, state: 'active' });
            })
        );

        renderPage();

        await screen.findByRole('dialog');
        await user.click(screen.getByRole('button', { name: /view read-only/i }));

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

        // The configuration underneath must be legible but not editable: the
        // field is present (readable) and disabled (not a silently-dropped-edit trap).
        const titleField = screen.getByLabelText(/study title/i);
        expect(titleField).toBeInTheDocument();
        expect(titleField).toBeDisabled();
    });

    // ── Dismissal must not strand the researcher (review finding 1) ──
    // `handleSwitchToDraft` used to be called from exactly one place: inside
    // the lock dialog. A researcher who took the "View read-only" escape to
    // inspect an active study, then decided to edit it, had every field
    // disabled and no control anywhere on the page to unlock them — recovery
    // required a page reload or a detour to the study overview.
    it('keeps an unlock affordance on the page after the lock dialog is dismissed', async () => {
        const user = userEvent.setup();
        server.use(
            http.get('*/api/admin/studies/test-study-designer', () => {
                return HttpResponse.json({ ...mockStudy, state: 'active' });
            })
        );

        renderPage();

        const dialog = await screen.findByRole('dialog');
        // Before dismissal the dialog owns the unlock action.
        expect(within(dialog).getByRole('button', { name: /draft mode/i })).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: /view read-only/i }));
        await waitFor(() => {
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        });

        // Positive: the unlock action survives dismissal, outside any dialog.
        const unlock = screen.getByRole('button', { name: /draft mode/i });
        expect(unlock).toBeEnabled();
        expect(unlock.closest('[role="dialog"]')).toBeNull();
        // ...and the notice that explains *why* the fields are inert stays on
        // screen with it, so the affordance is not an unexplained button.
        expect(screen.getByTestId('design-lock-banner')).toHaveTextContent(/this study is active/i);

        // Negative: dismissing the dialog does not silently unlock the design.
        expect(screen.getByLabelText(/study title/i)).toBeDisabled();
    });

    // ── The lock dialog describes itself (review findings 5 and 6) ──
    it('gives the lock dialog a description in every locked state', async () => {
        // The paused state used to render no DialogDescription at all, so
        // Radix warned and the dialog shipped with no accessible description.
        server.use(
            http.get('*/api/admin/studies/test-study-designer', () => {
                return HttpResponse.json({ ...mockStudy, state: 'paused' });
            })
        );

        renderPage();

        const dialog = await screen.findByRole('dialog');
        expect(dialog).toHaveAccessibleDescription(/read the configuration without changing it/i);
        // Negative: it is not left undescribed, as the paused branch was.
        expect(dialog).not.toHaveAccessibleDescription('');
    });

    it('describes the lock dialog, not the consequence of one of its buttons', async () => {
        server.use(
            http.get('*/api/admin/studies/test-study-designer', () => {
                return HttpResponse.json({ ...mockStudy, state: 'active' });
            })
        );

        renderPage();

        const dialog = await screen.findByRole('dialog');
        // Negative: the Draft-Mode *confirm* copy is no longer the dialog's
        // description. Announced before "View read-only", it invited a
        // screen-reader user to attribute "stops data collection" to the
        // wrong button.
        expect(dialog).not.toHaveAccessibleDescription(/stop data collection/i);
        // Positive: the description now describes the dialog.
        expect(dialog).toHaveAccessibleDescription(/read the configuration without changing it/i);
    });

    it('uses an amber lock icon on the lock notice instead of the green globe', async () => {
        server.use(
            http.get('*/api/admin/studies/test-study-designer', () => {
                return HttpResponse.json({ ...mockStudy, state: 'active' });
            })
        );

        renderPage();
        const dialog = await screen.findByRole('dialog');

        expect(dialog.querySelector('svg.lucide-lock.text-amber-600')).toBeInTheDocument();
        expect(dialog.querySelector('svg.lucide-globe')).not.toBeInTheDocument();
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

    // The tab-bar scroll chevrons' aria-label used to be a hardcoded English
    // literal ("Scroll left" / "Scroll right"), so a screen reader on a
    // translated interface would announce them in English regardless of the
    // researcher's chosen language. jsdom/happy-dom don't compute real
    // scroll geometry, so the arrows' visibility is forced by stubbing the
    // tablist's scroll metrics directly and firing the same `scroll` event
    // the real DOM would dispatch, which drives the component's own
    // `checkScroll` handler — not a shortcut around it.
    it('names the scroll chevrons via t(), not a hardcoded literal', async () => {
        renderPage();
        const tablist = await screen.findByRole('tablist');

        Object.defineProperty(tablist, 'clientWidth', { value: 300, configurable: true });
        Object.defineProperty(tablist, 'scrollWidth', { value: 900, configurable: true });
        Object.defineProperty(tablist, 'scrollLeft', { value: 100, configurable: true });
        fireEvent.scroll(tablist);

        expect(await screen.findByRole('button', { name: 'Scroll left' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Scroll right' })).toBeInTheDocument();
    });

    // The English names alone can't distinguish a real t() call from a
    // literal that happens to already read "Scroll left" / "Scroll right"
    // in English (the canonical fallback text is unchanged from the
    // original hardcoded value). Assert the real fr/admin.json translation.
    it("resolves the scroll chevrons to the researcher's active language", async () => {
        i18n.addResourceBundle('fr', 'admin', frAdmin, true, true);
        await i18n.changeLanguage('fr');
        try {
            renderPage();
            const tablist = await screen.findByRole('tablist');

            Object.defineProperty(tablist, 'clientWidth', { value: 300, configurable: true });
            Object.defineProperty(tablist, 'scrollWidth', { value: 900, configurable: true });
            Object.defineProperty(tablist, 'scrollLeft', { value: 100, configurable: true });
            fireEvent.scroll(tablist);

            expect(
                await screen.findByRole('button', { name: 'Défiler vers la gauche' })
            ).toBeInTheDocument();
            expect(
                screen.getByRole('button', { name: 'Défiler vers la droite' })
            ).toBeInTheDocument();
        } finally {
            await i18n.changeLanguage('en');
        }
    });
});
