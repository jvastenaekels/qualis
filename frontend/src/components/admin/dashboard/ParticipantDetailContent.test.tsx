/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, renderWithProviders as render, screen } from '@/test-utils/test-utils';
import { ParticipantDetailContent } from './ParticipantDetailContent';
import type { DumpParticipant, DumpResponse } from './types';

// Mock react-router-dom useParams so the component does not crash without a Route.
vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
    return {
        ...actual,
        useParams: () => ({ studySlug: 'test-study' }),
    };
});

// Mock GridSort's heavyweight children to mirror GridSort.overflow.test.tsx,
// so we can assert on real per-column slot counts without bringing in dnd-kit
// or layout calculations.
vi.mock('@dnd-kit/sortable', () => ({
    SortableContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    horizontalListSortingStrategy: {},
    rectSortingStrategy: {},
}));

vi.mock('@/components/SortableCard', () => ({
    default: ({ id }: { id: number }) => <div data-testid={`sortable-card-${id}`} />,
}));

vi.mock('@/components/DroppableSlot', () => ({
    default: ({
        children,
        id,
        className,
    }: {
        children: React.ReactNode;
        id: string;
        className: string;
    }) => (
        <div data-testid="droppable-slot" data-id={id} className={className}>
            {children}
        </div>
    ),
}));

vi.mock('@/components/ReadingZone', () => ({
    default: ({ variant }: { variant: string }) => (
        <div data-testid={`reading-zone-${variant}`}>Reading Zone ({variant})</div>
    ),
}));

/**
 * Count rendered slots in a column. The read-only GridSort path (used by the
 * admin viewer) does NOT render `<DroppableSlot>` — instead it emits a plain
 * `<div role="button" aria-label="Score X, row N">` per slot. We identify the
 * column by its `#column-{score}` wrapper id and count the row-N buttons inside.
 */
const countSlotsInColumnByScore = (score: number) => {
    const columnEl = document.getElementById(`column-${score}`);
    if (!columnEl) return 0;
    return columnEl.querySelectorAll('[role="button"][aria-label^="Score "]').length;
};

const buildStudyData = (
    distributionMode: 'forced' | 'free' | 'flexible' | undefined,
    statementCount: number,
    capacities: number[],
    postsortConfig?: Record<string, unknown>
): DumpResponse => {
    const statements = Array.from({ length: statementCount }, (_, i) => ({
        id: i + 1,
        code: `S${i + 1}`,
        translations: [{ lang: 'en', text: `Statement ${i + 1}` }],
    }));
    const gridConfig = capacities.map((capacity, i) => ({
        score: i - Math.floor(capacities.length / 2),
        capacity,
    }));

    return {
        study: {
            slug: 'test-study',
            statements,
            translations: [{ lang: 'en', title: 'Test Study' }],
            grid_config: gridConfig,
            state: 'active',
            // distribution_mode is the under-test field — propagated from the page.
            distribution_mode: distributionMode,
            postsort_config: postsortConfig,
        } as DumpResponse['study'],
        participants: [],
        statement_id_to_index: statements.reduce(
            (acc, s, idx) => {
                acc[s.id] = idx;
                return acc;
            },
            {} as Record<string, number>
        ),
    };
};

const buildParticipant = (
    placements: Record<string, number>,
    audioRecordings?: Record<string, unknown>
): DumpParticipant => ({
    id: 'session-1',
    db_id: 1,
    duration_seconds: 600,
    scores: [],
    placements,
    presort: {},
    postsort: {},
    audio_recordings: audioRecordings ?? {},
    language: 'en',
    is_discarded: false,
    discard_reason: null,
    status: 'completed',
    created_at: '2025-01-01T12:00:00Z',
    submitted_at: '2025-01-01T12:10:00Z',
});

const switchToGridTab = () => {
    // The grid tab is the third tab trigger (session, presort, grid, postsort).
    // Visible labels are hidden on the small jsdom viewport, so we identify
    // by Radix's id suffix instead of text. Radix Tabs only switches on
    // pointer events (not pure `click`), so dispatch the pointer sequence.
    const tabs = screen.getAllByRole('tab');
    const gridTab = tabs.find((tab) => (tab.getAttribute('id') || '').endsWith('-trigger-grid'));
    if (!gridTab) {
        throw new Error('Grid tab not found');
    }
    act(() => {
        fireEvent.pointerDown(gridTab, { button: 0 });
        fireEvent.mouseDown(gridTab);
        fireEvent.pointerUp(gridTab);
        fireEvent.click(gridTab);
    });
};

const switchToPostsortTab = () => {
    // Same rationale as switchToGridTab: identify by Radix's id suffix and
    // dispatch the full pointer sequence Radix Tabs requires to switch.
    const tabs = screen.getAllByRole('tab');
    const postsortTab = tabs.find((tab) =>
        (tab.getAttribute('id') || '').endsWith('-trigger-postsort')
    );
    if (!postsortTab) {
        throw new Error('Postsort tab not found');
    }
    act(() => {
        fireEvent.pointerDown(postsortTab, { button: 0 });
        fireEvent.mouseDown(postsortTab);
        fireEvent.pointerUp(postsortTab);
        fireEvent.click(postsortTab);
    });
};

describe('ParticipantDetailContent — read-only GridSort overflow propagation', () => {
    it('renders overflow rows in read-only view for free-mode participants', () => {
        // Three columns of capacity 2, score map: -1, 0, +1. Participant
        // overstacked column 1 (score 0) with 6 cards — capacity 2,
        // overflow = 4. The admin viewer must surface all 6 cards plus the
        // trailing empty slot (= 7 slots in column 1).
        const studyData = buildStudyData('free', 6, [2, 2, 2]);
        const placements: Record<string, number> = {};
        for (let i = 1; i <= 6; i++) {
            placements[String(i)] = 0; // score 0 → middle column (col idx 1)
        }
        const participant = buildParticipant(placements);

        render(
            <ParticipantDetailContent
                participant={participant}
                studyData={studyData}
                onToggleDiscard={() => {}}
            />
        );

        switchToGridTab();

        // Free-mode: column at score 0 hosts 6 cards in a capacity-2 column →
        // 7 slots (6 cards + 1 trailing empty); the -1 and +1 columns are
        // empty so they stay at capacity 2.
        expect(countSlotsInColumnByScore(-1)).toBe(2);
        expect(countSlotsInColumnByScore(0)).toBe(7);
        expect(countSlotsInColumnByScore(1)).toBe(2);
    });

    it('still renders col.capacity slots for forced-mode participants (regression guard)', () => {
        // Forced mode is the regression guard: identical placements but
        // distribution_mode='forced' must keep the original capacity-bound
        // rendering (2 slots per column).
        const studyData = buildStudyData('forced', 6, [2, 2, 2]);
        const placements: Record<string, number> = {
            '1': -1,
            '2': -1,
            '3': 0,
            '4': 0,
            '5': 1,
            '6': 1,
        };
        const participant = buildParticipant(placements);

        render(
            <ParticipantDetailContent
                participant={participant}
                studyData={studyData}
                onToggleDiscard={() => {}}
            />
        );

        switchToGridTab();

        expect(countSlotsInColumnByScore(-1)).toBe(2);
        expect(countSlotsInColumnByScore(0)).toBe(2);
        expect(countSlotsInColumnByScore(1)).toBe(2);
    });

    it('defaults to forced when distribution_mode is missing on the study', () => {
        // Legacy / unset distribution_mode must NOT silently switch on
        // overflow rendering: default to forced semantics.
        const studyData = buildStudyData(undefined, 6, [2, 2, 2]);
        const placements: Record<string, number> = {
            '1': 0,
            '2': 0,
            '3': 0,
            '4': 0,
            '5': 0,
            '6': 0,
        };
        const participant = buildParticipant(placements);

        render(
            <ParticipantDetailContent
                participant={participant}
                studyData={studyData}
                onToggleDiscard={() => {}}
            />
        );

        switchToGridTab();

        // Forced default → 2 slots in the score-0 column even though 6 cards
        // are stacked there. (Cards beyond capacity become invisible — that's
        // the legacy behaviour we want to preserve when distribution_mode
        // is unset.)
        expect(countSlotsInColumnByScore(0)).toBe(2);
    });
});

describe('ParticipantDetailContent — post-sort audio question labels', () => {
    it('resolves a custom post-sort audio question to its researcher-configured label', () => {
        // The upload path (Step2_Questionnaire.tsx) prefixes the researcher's
        // own question id with "question_" when saving the recording key.
        const studyData = buildStudyData(undefined, 1, [1, 1], {
            questions: {
                q_1737849283000: {
                    type: 'text_audio',
                    label: { en: 'Tell us why you placed the top card here' },
                    required: false,
                },
            },
        });
        const participant = buildParticipant(
            { '1': 0 },
            {
                question_q_1737849283000: {
                    presigned_url: 'https://example.com/audio.webm',
                    duration_seconds: 12,
                    file_size_bytes: 2048,
                },
            }
        );

        render(
            <ParticipantDetailContent
                participant={participant}
                studyData={studyData}
                onToggleDiscard={() => {}}
            />
        );

        switchToPostsortTab();

        // Positive: the researcher's own label is shown — proves the real
        // config was actually consulted, not just that nothing crashed and
        // the raw-key assertions below passed vacuously.
        expect(screen.getByText('Tell us why you placed the top card here')).toBeInTheDocument();
        // Negative: neither the bare config key nor the uploaded (prefixed)
        // key ever reach the screen.
        expect(screen.queryByText('q_1737849283000')).not.toBeInTheDocument();
        expect(screen.queryByText('question_q_1737849283000')).not.toBeInTheDocument();
    });

    it('falls back to a generic label — never the raw key — for a question no longer in the config', () => {
        // Simulates a researcher-generated key with no matching lookup entry
        // (e.g. the question was edited or removed from postsort_config
        // after the participant answered). This is resolution #3's required
        // safe-degrade case: an unmapped key must render the generic label,
        // never the identifier.
        const studyData = buildStudyData(undefined, 1, [1, 1], {
            questions: {
                // A different question exists in the config, but not the one
                // this participant's recording references — this proves a
                // real map lookup that missed, not an empty-config
                // short-circuit that would pass for the wrong reason.
                q_other: {
                    type: 'text_audio',
                    label: { en: 'A different question' },
                    required: false,
                },
            },
        });
        const participant = buildParticipant(
            { '1': 0 },
            {
                question_q_9999999999999: {
                    presigned_url: 'https://example.com/audio.webm',
                    duration_seconds: 5,
                    file_size_bytes: 1024,
                },
            }
        );

        render(
            <ParticipantDetailContent
                participant={participant}
                studyData={studyData}
                onToggleDiscard={() => {}}
            />
        );

        switchToPostsortTab();

        // Never the raw identifier, in either form.
        expect(screen.queryByText('q_9999999999999')).not.toBeInTheDocument();
        expect(screen.queryByText('question_q_9999999999999')).not.toBeInTheDocument();
        // The generic, honest fallback label is shown instead — this proves
        // the row actually rendered (not merely that the raw key is absent
        // because nothing rendered at all).
        expect(screen.getByText('Spoken response')).toBeInTheDocument();
    });
});
