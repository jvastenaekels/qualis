/*
 * Heading-order guard for the study designer.
 *
 * Task 5.3's first cut promoted the toolbar's <h2> to the page's <h1> and deleted
 * the sr-only h1 above it. The h1 count stayed at one and every unit test, biome,
 * tsc and `npm run lint:a11y` passed — but the document then read h1 → h3, because
 * the editor panels are Radix Accordions and `AccordionHeader` hard-codes <h3>.
 * Only axe, in the Playwright a11y suite, caught it (rule `heading-order`).
 *
 * Count is not order. This file closes that instrument gap in the fast suite: it
 * walks every one of the seven designer steps and applies the same predicate axe's
 * `heading-order` uses — a heading may jump *up* any number of levels, but may only
 * descend one at a time. It restates the rule rather than calling axe-core, which
 * is only a transitive dependency here (via @axe-core/playwright); the equivalence
 * was checked by hand against axe-core 4.12.1 in both directions.
 *
 * The Playwright a11y suite audits the *intro* step only. That is how the q-sort
 * step's h2 → h4 skip (three alert-banner titles that opened at h4 under no h3)
 * survived unnoticed; this file caught it on first run.
 */
import { renderWithProviders, screen } from '@/test-utils/test-utils';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/test-utils/server';
import StudyDesignPage from './StudyDesignPage';
import { useStudyDesigner } from '@/store/useStudyDesigner';
import { useAuthStore } from '@/store/useAuthStore';
import type { DesignStepId } from '@/hooks/admin/useStudyDesignPage';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
    return {
        ...actual,
        useParams: vi.fn(() => ({
            studySlug: 'heading-order-study',
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

global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
};

const mockStudy = {
    id: 1,
    slug: 'heading-order-study',
    title: 'Draft Study',
    state: 'draft',
    grid_config: [
        { score: -1, capacity: 2 },
        { score: 0, capacity: 2 },
        { score: 1, capacity: 2 },
    ],
    statements: [{ code: 's1', translations: [{ language_code: 'en', text: 'S1' }] }],
    branding: { primary_color: '#4f46e5' },
    presort_config: {},
    postsort_config: {},
    translations: [{ language_code: 'en', title: 'Draft Study' }],
};

const STEPS: DesignStepId[] = [
    'intro',
    'pre-sort',
    'condition',
    'q-sort',
    'post-sort',
    'interface',
    'branding',
];

/** The levels of every h1–h6 in the container, in DOM order. */
function headingLevels(container: HTMLElement): { level: number; text: string }[] {
    return Array.from(container.querySelectorAll('h1,h2,h3,h4,h5,h6')).map((h) => ({
        level: Number(h.tagName[1]),
        text: (h.textContent ?? '').trim().slice(0, 40),
    }));
}

/** axe's `heading-order`: a heading may not be more than one level below its predecessor. */
function firstSkip(headings: { level: number; text: string }[]): string | null {
    for (let i = 1; i < headings.length; i++) {
        const prev = headings[i - 1];
        const cur = headings[i];
        if (prev && cur && cur.level > prev.level + 1) {
            return `h${prev.level} "${prev.text}" → h${cur.level} "${cur.text}"`;
        }
    }
    return null;
}

describe('StudyDesignPage heading order', () => {
    beforeEach(() => {
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
            user: { id: 1, email: 'admin@qualis.dev' },
            isAuthenticated: true,
        });
        useStudyDesigner.getState().resetDraft();
        server.use(
            http.get('*/api/admin/studies/heading-order-study', () => HttpResponse.json(mockStudy)),
            http.get('*/api/admin/studies/heading-order-study/participants', () =>
                HttpResponse.json({ items: [], total: 0 })
            )
        );
    });

    afterEach(() => server.resetHandlers());

    it('starts at a single h1 that names the page function', async () => {
        const { container } = renderWithProviders(<StudyDesignPage />, {
            initialEntries: ['/admin/studies/heading-order-study/design'],
        });
        await screen.findByRole('button', { name: 'Select language' });

        const headings = headingLevels(container);
        const h1s = headings.filter((h) => h.level === 1);
        expect(h1s).toHaveLength(1);
        expect(h1s[0]?.text).toBe('Design');
        // …and it is the first heading in the document, not one buried mid-page.
        expect(headings[0]?.level).toBe(1);
    }, 20000);

    it.each(STEPS)(
        'never skips a heading level on the %s step',
        async (step) => {
            useStudyDesigner.setState({ activeStep: step });
            const { container } = renderWithProviders(<StudyDesignPage />, {
                initialEntries: ['/admin/studies/heading-order-study/design'],
            });
            await screen.findByRole('button', { name: 'Select language' });

            const headings = headingLevels(container);
            // Guard the guard: a step that rendered no headings would pass vacuously.
            expect(headings.length).toBeGreaterThan(1);
            expect(firstSkip(headings)).toBeNull();
        },
        20000
    );
});
