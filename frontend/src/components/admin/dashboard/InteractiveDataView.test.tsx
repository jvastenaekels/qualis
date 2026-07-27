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
        // default) whose own TooltipTrigger is explicitly OUT of this
        // task's scope and must remain a real tab stop.
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
        // remained. After this task's chip conversion (this row has no
        // duplicate IP, so that badge never renders here): the submitted_at
        // trigger is converted too — role="img" like the rest — so the row
        // has zero focusable buttons. (A follow-up task gives the row its
        // first real, operable action; see the 6.7i report.)
        const focusable = within(row).queryAllByRole('button');
        expect(focusable).toHaveLength(0);

        // The OS/browser fact is still announced, with the name it never had.
        expect(
            within(row).getByRole('img', { name: 'Device: Windows, Chrome' })
        ).toBeInTheDocument();

        // The submitted_at date is also still announced, just no longer a
        // tab stop (Task 6.7i).
        expect(
            within(row).getByRole('img', {
                name: expectedSubmittedLabel('2026-01-01T00:10:19Z'),
            })
        ).toBeInTheDocument();
    });

    it('drops the duplicate-IP badge as an inert tab stop too: a duplicate-IP row loses both of its remaining phantom buttons (Task 6.7i)', async () => {
        // The fixture must actually trip the duplicate-IP badge, or this
        // count would already read "0 focusable buttons" from the
        // submitted_at conversion alone, proving nothing about whether the
        // badge itself got fixed. Two participants sharing an IP is what
        // populates duplicateIpGroups (useInteractiveDataView.ts).
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

        // The duplicate-IP badge is a fact, not a control: named via
        // role="img", absent from the button role.
        expect(within(row).getByRole('img', { name: 'Duplicate IP #1' })).toBeInTheDocument();
        expect(within(row).queryByRole('button', { name: /Duplicate IP/ })).not.toBeInTheDocument();

        // Same for the submitted_at date: was a TooltipTrigger button
        // revealing the full timestamp on hover, now a named,
        // non-focusable fact.
        expect(
            within(row).getByRole('img', {
                name: expectedSubmittedLabel('2026-01-01T00:10:19Z'),
            })
        ).toBeInTheDocument();

        // Before this task, a duplicate-IP row carried two inert tab stops
        // (this badge's own TooltipTrigger, plus the untouched submitted_at
        // trigger from 6.7g). After: zero — this row has no real action yet
        // either (that's the companion 6.7i task), so it is, for now,
        // entirely unreachable by keyboard. That gap is closed next.
        expect(within(row).queryAllByRole('button')).toHaveLength(0);
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
