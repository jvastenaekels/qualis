/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { renderWithProviders, screen, fireEvent, waitFor } from '@/test-utils/test-utils';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { FactorCanvas } from './FactorCanvas';
import type { InterpretPhaseApi } from '@/hooks/admin/useInterpretPhase';
import type { ParticipantAudioRecording } from '@/api/model/participantAudioRecording';
import type { ParticipantCardComment } from '@/api/model/participantCardComment';

// ── Hoisted mocks for the generated API hooks ─────────────────────────────────
const { mockAudiosHook, mockCommentsHook, mockUpdateHook, mockListRunsKey } = vi.hoisted(() => ({
    mockAudiosHook: vi.fn(),
    mockCommentsHook: vi.fn(),
    mockUpdateHook: vi.fn(),
    mockListRunsKey: vi.fn(() => ['/api/admin/studies/s/analysis/runs']),
}));

vi.mock('@/api/generated', () => ({
    useListAudiosForParticipantsApiAdminStudiesSlugAnalysisAudiosGet: mockAudiosHook,
    useListCommentsForParticipantsApiAdminStudiesSlugAnalysisCommentsGet: mockCommentsHook,
    useUpdateAnalysisRunApiAdminStudiesSlugAnalysisRunsRunIdPatch: mockUpdateHook,
    getListAnalysisRunsApiAdminStudiesSlugAnalysisRunsGetQueryKey: mockListRunsKey,
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function emptyOk<T>(): {
    data: T[];
    isLoading: boolean;
    isSuccess: boolean;
    isError: boolean;
} {
    return { data: [], isLoading: false, isSuccess: true, isError: false };
}

function dataOk<T>(data: T[]): {
    data: T[];
    isLoading: boolean;
    isSuccess: boolean;
    isError: boolean;
} {
    return { data, isLoading: false, isSuccess: true, isError: false };
}

function buildInterpret(overrides: Partial<InterpretPhaseApi> = {}): InterpretPhaseApi {
    const run = {
        id: 42,
        ran_at: '2026-04-29T10:00:00Z',
        n_factors: 3,
        extraction: 'pca',
        rotation: 'varimax',
        flagging: 'auto',
        notes: null,
        factor_notes: { '1': '' },
        result: {
            n_participants: 2,
            n_statements: 1,
            n_factors: 3,
            extraction: 'pca',
            rotation: 'varimax',
            eigenvalues: [3.0, 1.5, 0.8],
            total_variance_explained: 0.7,
            loadings: [[0.78, 0.0, 0.1]],
            rotated_loadings: [[0.78, 0.0, 0.1]],
            flags: [[true, false, false]],
            participants: [
                {
                    db_id: 1,
                    label: 'P1',
                    loadings: [0.78, 0.0, 0.1],
                    flagged_factors: [1],
                },
            ],
            statement_scores: [
                {
                    statement_id: 7,
                    code: 'S07',
                    text: 'Local food sovereignty matters more than ever to the community',
                    z_scores: [2.41, 0.1, -0.3],
                    factor_arrays: [4, 0, -2],
                },
            ],
            distinguishing: [
                {
                    statement_id: 7,
                    code: 'S07',
                    text: 'Local food sovereignty matters more than ever to the community',
                    z_scores: [2.41, 0.1, -0.3],
                    factor_arrays: [4, 0, -2],
                    significance: { '1': '*' },
                },
            ],
            consensus: [],
            factor_characteristics: [],
            correlation_matrix: [
                [1, 0, 0],
                [0, 1, 0],
                [0, 0, 1],
            ],
        },
    };
    const base: InterpretPhaseApi = {
        // The orval `AnalysisRunRead.result` type is JSONB-shaped; cast through
        // unknown so the fixture object is accepted as-is.
        run: run as unknown as InterpretPhaseApi['run'],
        isLoading: false,
        isError: false,
        activeFactor: 1,
        flaggedParticipants: [
            { db_id: 1, label: 'P1', loadings: [0.78, 0.0, 0.1], flagged_factors: [1] },
        ],
        narrativeDraft: '',
        setNarrativeDraft: vi.fn(),
        appendToNarrative: vi.fn(),
        showFactorNarratives: true,
        setShowFactorNarratives: vi.fn(),
        compareRun: null,
        deltaByStatement: null,
    };
    return { ...base, ...overrides };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('FactorCanvas', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockAudiosHook.mockReturnValue(emptyOk<ParticipantAudioRecording>());
        mockCommentsHook.mockReturnValue(emptyOk<ParticipantCardComment>());
        mockUpdateHook.mockReturnValue({ mutate: vi.fn(), isPending: false });
    });

    it('renders factor selector chips with active factor highlighted', () => {
        renderWithProviders(
            <FactorCanvas slug="s" interpret={buildInterpret()} onFocusChange={vi.fn()} />
        );
        const chips = screen.getAllByRole('tab');
        expect(chips).toHaveLength(3);
        expect(chips[0]).toHaveAttribute('aria-selected', 'true');
    });

    it('calls onFocusChange when a different chip is clicked', () => {
        const onFocusChange = vi.fn();
        renderWithProviders(
            <FactorCanvas slug="s" interpret={buildInterpret()} onFocusChange={onFocusChange} />
        );
        const chips = screen.getAllByRole('tab');
        const second = chips[1];
        if (!second) throw new Error('expected at least 2 chips');
        fireEvent.click(second);
        expect(onFocusChange).toHaveBeenCalledWith(2);
    });

    it('renders Statements panel with top |z| of active factor', () => {
        renderWithProviders(
            <FactorCanvas slug="s" interpret={buildInterpret()} onFocusChange={vi.fn()} />
        );
        expect(screen.getByText(/Local food sovereignty/)).toBeInTheDocument();
        expect(screen.getByText('+2.41')).toBeInTheDocument();
        expect(screen.getByText('S07')).toBeInTheDocument();
    });

    it('flags distinguishing statements with a D badge', () => {
        renderWithProviders(
            <FactorCanvas slug="s" interpret={buildInterpret()} onFocusChange={vi.fn()} />
        );
        expect(screen.getByLabelText(/distinguishing statement/i)).toBeInTheDocument();
    });

    it('shows defining-sorts count from interpret.flaggedParticipants.length', () => {
        renderWithProviders(
            <FactorCanvas slug="s" interpret={buildInterpret()} onFocusChange={vi.fn()} />
        );
        expect(screen.getByText(/Defining sorts:\s*1/i)).toBeInTheDocument();
    });

    it('renders the Narrative editor with the active factor in title', () => {
        renderWithProviders(
            <FactorCanvas slug="s" interpret={buildInterpret()} onFocusChange={vi.fn()} />
        );
        expect(screen.getByText(/Narrative.*F1/i)).toBeInTheDocument();
    });

    it('returns null when run.result is missing', () => {
        const empty = buildInterpret({ run: null });
        const { container } = renderWithProviders(
            <FactorCanvas slug="s" interpret={empty} onFocusChange={vi.fn()} />
        );
        expect(container.firstChild).toBeNull();
    });

    it('clicking a comment ▸+ button calls handleInsertCommentQuote → appendToNarrative', async () => {
        mockCommentsHook.mockReturnValue(
            dataOk<ParticipantCardComment>([
                {
                    participant_db_id: 1,
                    statement_id: 7,
                    statement_code: 'S07',
                    statement_text: 'Local food sovereignty matters',
                    grid_score: 4,
                    comment: 'Because food sovereignty matters',
                },
            ])
        );

        const appendToNarrative = vi.fn();
        const interpret = buildInterpret({ appendToNarrative });
        renderWithProviders(
            <FactorCanvas slug="s" interpret={interpret} onFocusChange={vi.fn()} />
        );

        const insertBtn = await screen.findByLabelText(/insert comment as quote/i);
        fireEvent.click(insertBtn);

        expect(appendToNarrative).toHaveBeenCalledTimes(1);
        const snippet = appendToNarrative.mock.calls[0]?.[0] as string;
        expect(snippet).toContain('Because food sovereignty matters');
        expect(snippet).toMatch(/^> /);
        expect(snippet).toContain('P1');
        expect(snippet).toContain('S07');
    });

    it('does NOT render an insert button on audio rows', async () => {
        mockAudiosHook.mockReturnValue(
            dataOk<ParticipantAudioRecording>([
                {
                    id: 1,
                    participant_db_id: 1,
                    question_key: 'rationale',
                    mime_type: 'audio/webm',
                    file_size_bytes: 1000,
                    s3_key: 'recordings/1.webm',
                    created_at: '2026-04-29T10:00:00Z',
                    presigned_url: '/fake/audio.webm',
                },
            ])
        );
        // Comments are empty, so the only voices content is the audio row.
        renderWithProviders(
            <FactorCanvas slug="s" interpret={buildInterpret()} onFocusChange={vi.fn()} />
        );
        await waitFor(() => {
            expect(document.querySelectorAll('audio')).toHaveLength(1);
        });
        expect(screen.queryByLabelText(/insert audio.*quote/i)).toBeNull();
        expect(screen.queryByLabelText(/insert comment as quote/i)).toBeNull();
    });
});
