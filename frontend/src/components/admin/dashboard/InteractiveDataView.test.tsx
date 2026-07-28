/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

/**
 * InteractiveDataView.test.tsx
 *
 * Guards the responses table's header/body cell parity (Task 1.1). The
 * regression: with a multilingual study, `showLanguageColumn` adds a
 * `language` column whose body cells render but whose header did not —
 * leaving every column from "Status" onward reading under the wrong
 * label. Root cause was a React Compiler auto-memoization bug in the
 * thead render (InteractiveDataView.tsx), not the column definitions in
 * InteractiveDataView.columns.tsx — see the `'use no memo'` doc comment at
 * the top of InteractiveDataView for the full mechanism. These tests can't
 * reproduce the compiler-specific defect directly (Vitest doesn't run the
 * React Compiler babel pass — see vitest.config.ts vs vite.config.ts), but
 * they pin the structural contract the bug violated: header count must
 * match body cell count, and the language column must have a visible
 * header. The compiler-specific RED/GREEN guard lives in
 * frontend/e2e/admin/data-table-columns.spec.ts, which runs against the
 * real `npm run dev` pipeline (React Compiler included).
 */

import { computeAccessibleName } from 'dom-accessibility-api';
import { renderWithProviders, screen, within } from '@/test-utils/test-utils';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { Routes, Route } from 'react-router-dom';
import type { ReactElement } from 'react';
import { format } from 'date-fns';
import { enUS } from 'date-fns/locale';
import type { DumpParticipant, DumpResponse } from './types';
import InteractiveDataView from './InteractiveDataView';

// The submitted_at cell renders `format(date, 'MMM d, HH:mm', { locale })`
// (InteractiveDataView.columns.tsx) in the *local* timezone of whatever
// machine runs the test — computing the expected label the same way the
// component does (rather than hardcoding a string like "Jan 1, 00:10")
// keeps these assertions correct regardless of the runner's TZ.
function expectedSubmittedLabel(iso: string): string {
    return format(new Date(iso), 'MMM d, HH:mm', { locale: enUS });
}

// The submitted_at cell's `title` carries the full timestamp (Task 6.7i) —
// same local-timezone-independence reasoning as expectedSubmittedLabel above.
function expectedFullSubmittedLabel(iso: string): string {
    return format(new Date(iso), 'PPpp', { locale: enUS });
}

const { mockDumpQuery } = vi.hoisted(() => ({ mockDumpQuery: vi.fn() }));

vi.mock('@/api/generated', () => ({
    useGetStudyDumpApiAdminStudiesSlugDumpGet: () => mockDumpQuery(),
    getGetStudyDumpApiAdminStudiesSlugDumpGetQueryKey: (slug: string) => ['dump', slug],
}));
vi.mock('@/api/mutator', () => ({ customInstance: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function makeParticipant(over: Partial<DumpParticipant> = {}): DumpParticipant {
    return {
        id: 'abcd1234',
        db_id: 1,
        duration_seconds: 619,
        scores: [],
        placements: {},
        presort: {},
        postsort: {},
        language: 'en',
        is_discarded: false,
        created_at: '2026-01-01T00:00:00Z',
        submitted_at: '2026-01-01T00:10:19Z',
        status: 'completed',
        ...over,
    } as DumpParticipant;
}

// A two-translation study is what turns showLanguageColumn on
// (useInteractiveDataView.ts: `showLanguageColumn = data.study.translations.length > 1`).
function dumpResponseWithTranslations(langs: string[]): DumpResponse {
    return {
        study: {
            slug: 'demo',
            statements: [],
            translations: langs.map((lang) => ({ lang, title: `Study (${lang})` })),
            presort_config: {},
            postsort_config: {},
            state: 'active',
            rough_sort_enabled: true,
        },
        participants: [makeParticipant()],
        statement_id_to_index: {},
    } as unknown as DumpResponse;
}

beforeEach(() => {
    vi.clearAllMocks();
    mockDumpQuery.mockReturnValue({
        data: dumpResponseWithTranslations(['en', 'fr']),
        isLoading: false,
        error: null,
    });
});

describe('InteractiveDataView — responses table header/body alignment', () => {
    it('renders one header cell per data cell when the study is multilingual', async () => {
        renderWithProviders(<InteractiveDataView slug="demo" />);

        const table = await screen.findByRole('table');
        const headerCells = within(table).getAllByRole('columnheader');
        const firstBodyRow = within(table).getAllByRole('row')[1];
        const bodyCells = within(firstBodyRow).getAllByRole('cell');

        expect(headerCells).toHaveLength(bodyCells.length);
    });

    it('labels the language column', async () => {
        renderWithProviders(<InteractiveDataView slug="demo" />);

        expect(await screen.findByRole('columnheader', { name: /lang/i })).toBeInTheDocument();
    });
});

describe('InteractiveDataView — control names (Task 6.7c)', () => {
    it('names the pagination and "more actions" controls', async () => {
        // PAGE_SIZE is 25; 30 live (non-discarded) participants on a draft
        // study exercises both the pagination buttons (page count > 1) and
        // the kebab "more actions" menu (liveCount > 0 && state === 'draft').
        const participants = Array.from({ length: 30 }, (_, i) =>
            makeParticipant({ id: `p${i}`, db_id: i })
        );
        mockDumpQuery.mockReturnValue({
            data: {
                study: {
                    slug: 'demo',
                    statements: [],
                    translations: [{ lang: 'en', title: 'Study' }],
                    presort_config: {},
                    postsort_config: {},
                    state: 'draft',
                    rough_sort_enabled: true,
                },
                participants,
                statement_id_to_index: {},
            } as unknown as DumpResponse,
            isLoading: false,
            error: null,
        });

        renderWithProviders(<InteractiveDataView slug="demo" />);
        await screen.findByRole('table');

        expect(screen.getByRole('button', { name: 'Previous page' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Next page' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'More actions' })).toBeInTheDocument();
    });

    it('names the seven per-row indicator TooltipTriggers (InteractiveDataView.columns.tsx)', async () => {
        // One participant that trips every flag the "Consent" and "Flags"
        // columns render an icon-only tooltip chip for: up to seven
        // previously-anonymous tab stops in a single row.
        const participant = makeParticipant({
            id: 'p1',
            db_id: 1,
            duration_seconds: 30, // < SUSPECT_DURATION_THRESHOLD (120)
            recruitment_token: 'REF123',
            postsort: {
                email: 'ada@example.com',
                newsletter_consent: true,
                interview_consent: true,
                card_comments: { s1: 'a comment' },
            },
            audio_recordings: { s1: {} },
        });
        mockDumpQuery.mockReturnValue({
            data: {
                ...dumpResponseWithTranslations(['en']),
                participants: [participant],
            },
            isLoading: false,
            error: null,
        });

        renderWithProviders(<InteractiveDataView slug="demo" />);
        await screen.findByRole('table');

        expect(screen.getByRole('img', { name: 'Email provided' })).toBeInTheDocument();
        expect(screen.getByRole('img', { name: 'Wants results' })).toBeInTheDocument();
        expect(screen.getByRole('img', { name: 'Accepts follow-up' })).toBeInTheDocument();
        expect(screen.getByRole('img', { name: 'Recruitment link: REF123' })).toBeInTheDocument();
        expect(
            screen.getByRole('img', {
                name: 'Potentially suspect: session duration < 2 minutes',
            })
        ).toBeInTheDocument();
        expect(
            screen.getByRole('img', {
                name: 'Contains participant comments on cards',
            })
        ).toBeInTheDocument();
        expect(screen.getByRole('img', { name: 'Has audio responses' })).toBeInTheDocument();

        // The user-visible claim (Task 6.7g): these seven facts are still
        // announced during table navigation, but none of them are tab stops
        // any more — a screen reader user tabbing through this row no longer
        // hits seven anonymous-purpose "button"s that do nothing on
        // activation. Scope to the row via the participant-id badge and
        // assert none of the seven names resolve on `button` (they moved
        // role, not just gained a label) while every one of them still
        // resolves via `img` — the real accname algorithm, not an
        // attribute-presence proxy.
        const row = screen.getByText('p1').closest('tr');
        if (!row) throw new Error('participant row not found');
        for (const name of [
            'Email provided',
            'Wants results',
            'Accepts follow-up',
            'Recruitment link: REF123',
            'Potentially suspect: session duration < 2 minutes',
            'Contains participant comments on cards',
            'Has audio responses',
        ]) {
            expect(within(row).queryByRole('button', { name })).not.toBeInTheDocument();
            expect(computeAccessibleName(within(row).getByRole('img', { name }))).toBe(name);
        }
    });

    it('drops the row focusable-control count from 8 to 1 by converting per-row status chips into non-focusable indicators (Task 6.7g)', async () => {
        // Same fixture as above, plus a user_agent so ParticipantCell's
        // OS/browser chip (also in scope for 6.7g) renders too, and a
        // submitted_at timestamp (already present via makeParticipant's
        // default), whose own TooltipTrigger was out of 6.7g's scope but is
        // in 6.7i's (see below).
        const participant = makeParticipant({
            id: 'p1',
            db_id: 1,
            duration_seconds: 30, // < SUSPECT_DURATION_THRESHOLD (120)
            recruitment_token: 'REF123',
            user_agent:
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36',
            postsort: {
                email: 'ada@example.com',
                newsletter_consent: true,
                interview_consent: true,
                card_comments: { s1: 'a comment' },
            },
            audio_recordings: { s1: {} },
        });
        mockDumpQuery.mockReturnValue({
            data: {
                ...dumpResponseWithTranslations(['en']),
                participants: [participant],
            },
            isLoading: false,
            error: null,
        });

        renderWithProviders(<InteractiveDataView slug="demo" />);
        await screen.findByRole('table');

        const row = screen.getByText('p1').closest('tr');
        if (!row) throw new Error('participant row not found');

        // Before 6.7g: 7 status chips + the OS/browser chip (unreachable at
        // the time via a bare `asChild` div, so it didn't add to the count) +
        // the submitted_at tooltip trigger = 8 focusable `button`s in this
        // row. After 6.7g: only the (then out-of-scope) submitted_at trigger
        // remained. After 6.7i's chip conversion (this row has no duplicate
        // IP, so that badge never renders here): the submitted_at trigger is
        // converted too — role="img" like the rest — but the row gained its
        // own real action (the trailing "row_actions" column), so the count
        // is still 1, for a different and now-functional reason.
        const focusable = within(row).getAllByRole('button');
        expect(focusable).toHaveLength(1);
        expect(focusable[0]).toHaveAccessibleName('View participant p1');

        // The OS/browser fact is still announced, with the name it never had.
        expect(
            within(row).getByRole('img', { name: 'Device: Windows, Chrome' })
        ).toBeInTheDocument();

        // The submitted_at date is also still announced, just no longer a
        // tab stop (Task 6.7i). It carries no role at all now (review
        // finding 2): it already has an accessible name from its own
        // visible text, so role="img" would have turned it into a graphic
        // node instead. The visible short label and the sr-only full
        // timestamp are two separate text-node-owning elements (RTL's
        // getByText matches an element's own direct text nodes, not its
        // descendants' — no `title` any more, single channel, see
        // columns.tsx), so both are queried independently.
        expect(
            within(row).getByText(expectedSubmittedLabel('2026-01-01T00:10:19Z'))
        ).toBeInTheDocument();
        expect(
            within(row).getByText(expectedFullSubmittedLabel('2026-01-01T00:10:19Z'))
        ).toBeInTheDocument();
    });

    it('counts focusable controls in a duplicate-IP row: the badge and the date are no longer tab stops, leaving exactly one real, named action (Task 6.7i)', async () => {
        // The fixture must actually trip the duplicate-IP badge — a row
        // without it would already read "1 focusable button" before this
        // task (the untouched submitted_at trigger), proving nothing about
        // whether the badge itself got fixed. Two participants sharing an
        // IP is what populates duplicateIpGroups (useInteractiveDataView.ts).
        const participants = [
            makeParticipant({ id: 'p1', db_id: 1, ip_address: '203.0.113.5' }),
            makeParticipant({ id: 'p2', db_id: 2, ip_address: '203.0.113.5' }),
        ];
        mockDumpQuery.mockReturnValue({
            data: { ...dumpResponseWithTranslations(['en']), participants },
            isLoading: false,
            error: null,
        });

        renderWithProviders(<InteractiveDataView slug="demo" />);
        await screen.findByRole('table');

        const row = screen.getByText('p1').closest('tr');
        if (!row) throw new Error('participant row not found');

        // The duplicate-IP badge is a fact, not a control: plain visible
        // text, no role at all (Task 6.7i review finding 2 — it already had
        // an accessible name from its own text, so role="img" would have
        // wrongly turned it into a graphic node). "Duplicate IP #1" is the
        // badge's own direct text (RTL's getByText matches an element's own
        // text nodes, not its descendants' — so this specifically excludes
        // the nested sr-only span's text); the hint/IP-hash-prefix lives
        // only in that sr-only span now (no `title` any more, single
        // channel — see columns.tsx), queried separately below.
        expect(within(row).getByText('Duplicate IP #1')).toBeInTheDocument();
        expect(within(row).getByText(/Shares IP hash with other participants/)).toBeInTheDocument();
        expect(within(row).queryByRole('img', { name: /Duplicate IP/ })).not.toBeInTheDocument();
        expect(within(row).queryByRole('button', { name: /Duplicate IP/ })).not.toBeInTheDocument();

        // Same for the submitted_at date: was a TooltipTrigger button
        // revealing the full timestamp on hover, now plain text, split
        // across a visible short label and an sr-only full timestamp — not
        // a role="img" either, for the same reason.
        expect(
            within(row).getByText(expectedSubmittedLabel('2026-01-01T00:10:19Z'))
        ).toBeInTheDocument();
        expect(
            within(row).getByText(expectedFullSubmittedLabel('2026-01-01T00:10:19Z'))
        ).toBeInTheDocument();
        expect(
            within(row).queryByRole('img', { name: expectedSubmittedLabel('2026-01-01T00:10:19Z') })
        ).not.toBeInTheDocument();

        // Before this task, a duplicate-IP row carried two inert tab stops
        // (this badge's own TooltipTrigger, plus the untouched submitted_at
        // trigger from 6.7g) and zero paths to the row's real action. After:
        // exactly one focusable button, and it is that real action, not a
        // leftover inert trigger.
        const focusable = within(row).getAllByRole('button');
        expect(focusable).toHaveLength(1);
        expect(focusable[0]).toHaveAccessibleName('View participant p1');
    });
});

describe('InteractiveDataView — row keyboard path (Task 6.7i)', () => {
    // Real navigation (Routes/Route), not a mocked `useNavigate` — same
    // pattern as AdminDashboard.test.tsx's keyboard-operable-cards suite.
    // Proves the whole chain: focusable -> Enter -> onClick ->
    // handleViewParticipant -> navigate() -> route change, not just that
    // some callback fired with the right argument.
    function renderWithRoutes(ui: ReactElement) {
        return renderWithProviders(
            <Routes>
                <Route path="/" element={ui} />
                <Route
                    path="/admin/studies/demo/participants/:id"
                    element={<div data-testid="participant-detail" />}
                />
            </Routes>
        );
    }

    it("gives the row a keyboard path to its own action: focus the row's View control, press Enter, and the participant opens", async () => {
        const user = userEvent.setup();
        renderWithRoutes(<InteractiveDataView slug="demo" />);
        await screen.findByRole('table');

        const viewButton = screen.getByRole('button', { name: 'View participant abcd1234' });
        expect(screen.queryByTestId('participant-detail')).not.toBeInTheDocument();

        viewButton.focus();
        await user.keyboard('{Enter}');

        expect(await screen.findByTestId('participant-detail')).toBeInTheDocument();
    });

    it('still lets a mouse user click anywhere in the row, unchanged', async () => {
        const user = userEvent.setup();
        renderWithRoutes(<InteractiveDataView slug="demo" />);
        await screen.findByRole('table');

        const row = screen.getByText('abcd1234').closest('tr');
        if (!row) throw new Error('participant row not found');
        expect(screen.queryByTestId('participant-detail')).not.toBeInTheDocument();

        // Click a cell that is NOT the new View button — the row's own
        // onClick (InteractiveDataView.tsx, mouse-only, untouched by this
        // task) must still fire.
        await user.click(within(row).getByText('abcd1234'));

        expect(await screen.findByTestId('participant-detail')).toBeInTheDocument();
    });

    it('also lets a mouse user click the View control directly, not only the row at large', async () => {
        const user = userEvent.setup();
        renderWithRoutes(<InteractiveDataView slug="demo" />);
        await screen.findByRole('table');

        const viewButton = screen.getByRole('button', { name: 'View participant abcd1234' });
        expect(screen.queryByTestId('participant-detail')).not.toBeInTheDocument();

        // The button sits inside the row, which has its own onClick
        // (InteractiveDataView.tsx). Clicking the button dispatches one
        // native click that bubbles to the row; the button's handler calls
        // stopPropagation so the row's handler doesn't also fire — a real
        // double-navigate would still land here (same destination), so this
        // is a smoke check that the button itself is independently
        // clickable, not a substitute for the stopPropagation reasoning
        // documented at the call site.
        await user.click(viewButton);

        expect(await screen.findByTestId('participant-detail')).toBeInTheDocument();
    });
});

describe('InteractiveDataView — sort-header icon contrast (Task 6.7d)', () => {
    it('renders the idle sort indicator at a legible contrast and keeps sorting operable', async () => {
        renderWithProviders(<InteractiveDataView slug="demo" />);
        await screen.findByRole('table');

        const languageHeader = screen.getByRole('columnheader', { name: /lang/i });
        const sortButton = within(languageHeader).getByRole('button');
        const arrowIcon = sortButton.querySelector('svg.lucide-arrow-up-down');
        expect(arrowIcon).not.toBeNull();
        expect(arrowIcon).toHaveClass('text-slate-500');
        expect(arrowIcon).not.toHaveClass('text-slate-300');

        // The color change didn't touch operability: the header is still a
        // real, clickable sort toggle.
        await userEvent.click(sortButton);
        expect(sortButton).toBeInTheDocument();
    });
});

describe('InteractiveDataView — discarded rows carry no resting opacity (task 6.5 review, F2)', () => {
    function renderWithDiscardedRow() {
        mockDumpQuery.mockReturnValue({
            data: {
                study: {
                    slug: 'demo',
                    statements: [],
                    translations: [{ lang: 'en', title: 'Study' }],
                    presort_config: {},
                    postsort_config: {},
                    state: 'active',
                    rough_sort_enabled: true,
                },
                participants: [makeParticipant({ id: 'p1', db_id: 1, is_discarded: true })],
                statement_id_to_index: {},
            } as unknown as DumpResponse,
            isLoading: false,
            error: null,
        });
        return renderWithProviders(<InteractiveDataView slug="demo" />);
    }

    it('de-emphasises a discarded row without compositing its cells below the floor', async () => {
        // The row used to read `opacity-60 grayscale-[0.5]`. Opacity
        // multiplies into the computed contrast, so promoting the cells'
        // colour token alone would have left them failing: the four `—`
        // empty-value markers and the device/browser/language glyphs sat at
        // slate-500 @ 60% over white = #a2acb9 → 2.30:1, under even the 3:1
        // non-text floor — and the row is not an inactive component, it stays
        // clickable. A future "just bump the shade" edit that reinstates the
        // opacity has to trip this.
        renderWithDiscardedRow();

        const table = await screen.findByRole('table');
        const bodyRow = within(table).getAllByRole('row')[1];

        expect(bodyRow.className).not.toMatch(/(?:^|\s)opacity-\d/);
        // The de-emphasis is still signalled — by a surface tint and a
        // desaturation, neither of which reduces foreground contrast.
        expect(bodyRow).toHaveClass('bg-slate-50');
        expect(bodyRow).toHaveClass('grayscale-[0.5]');
    });

    it('leaves the row operable, which is why the inactive-component exemption never applied', async () => {
        renderWithDiscardedRow();

        const table = await screen.findByRole('table');
        const bodyRow = within(table).getAllByRole('row')[1];

        expect(bodyRow).toHaveClass('cursor-pointer');
    });

    it('applies neither treatment to a live row', async () => {
        renderWithProviders(<InteractiveDataView slug="demo" />);

        const table = await screen.findByRole('table');
        const bodyRow = within(table).getAllByRole('row')[1];

        expect(bodyRow).not.toHaveClass('bg-slate-50');
        expect(bodyRow.className).not.toMatch(/(?:^|\s)opacity-\d/);
    });
});
