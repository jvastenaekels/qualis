import { renderWithProviders, screen, waitFor } from '@/test-utils/test-utils';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { FactorVoicesPanel } from './FactorVoicesPanel';
import type { ParticipantLoading } from '@/api/model/participantLoading';
import type { ParticipantAudioRecording } from '@/api/model/participantAudioRecording';
import type { ParticipantCardComment } from '@/api/model/participantCardComment';

// Hoisted mocks for both API hooks
const { mockAudiosHook, mockCommentsHook } = vi.hoisted(() => ({
    mockAudiosHook: vi.fn(),
    mockCommentsHook: vi.fn(),
}));

vi.mock('@/api/generated', () => ({
    useListAudiosForParticipantsApiAdminStudiesSlugAnalysisAudiosGet: mockAudiosHook,
    useListCommentsForParticipantsApiAdminStudiesSlugAnalysisCommentsGet: mockCommentsHook,
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeParticipant(
    dbId: number,
    label: string,
    flaggedFactors: number[]
): ParticipantLoading {
    return {
        db_id: dbId,
        label,
        loadings: [0.8, 0.1, 0.05],
        flagged_factors: flaggedFactors,
    };
}

function makeRecording(
    id: number,
    participantDbId: number,
    questionKey: string,
    presignedUrl: string
): ParticipantAudioRecording {
    return {
        id,
        participant_db_id: participantDbId,
        question_key: questionKey,
        mime_type: 'audio/webm',
        file_size_bytes: 12345,
        s3_key: `recordings/${id}.webm`,
        created_at: '2025-04-01T10:00:00Z',
        presigned_url: presignedUrl,
    };
}

function makeComment(
    participantDbId: number,
    statementId: number,
    statementCode: string,
    statementText: string,
    gridScore: number,
    comment: string
): ParticipantCardComment {
    return {
        participant_db_id: participantDbId,
        statement_id: statementId,
        statement_code: statementCode,
        statement_text: statementText,
        grid_score: gridScore,
        comment,
    };
}

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

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('FactorVoicesPanel', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // ── Test 1: empty state when neither audio nor comments are present ───────
    it('renders empty state when no flagged participant has audio or comments', () => {
        const participants = [makeParticipant(1, 'Alice', [1]), makeParticipant(2, 'Bob', [2])];

        mockAudiosHook.mockReturnValue(emptyOk<ParticipantAudioRecording>());
        mockCommentsHook.mockReturnValue(emptyOk<ParticipantCardComment>());

        renderWithProviders(
            <FactorVoicesPanel slug="demo-study" factorIndex={0} participants={participants} />
        );

        expect(
            screen.getByText(
                /No post-sort audio recordings or written comments from participants flagged on this factor/i
            )
        ).toBeInTheDocument();
    });

    // ── Test 2: renders <audio> per recording ─────────────────────────────────
    it('renders an audio element per recording when the API returns recordings', async () => {
        const participants = [makeParticipant(10, 'Carol', [1]), makeParticipant(11, 'Dave', [1])];

        const recordings = [
            makeRecording(100, 10, 'post_sort_q1', 'https://cdn.example.com/rec100.webm'),
            makeRecording(101, 11, 'post_sort_q1', 'https://cdn.example.com/rec101.webm'),
            makeRecording(102, 11, 'post_sort_q2', 'https://cdn.example.com/rec102.webm'),
        ];

        mockAudiosHook.mockReturnValue(dataOk(recordings));
        mockCommentsHook.mockReturnValue(emptyOk<ParticipantCardComment>());

        renderWithProviders(
            <FactorVoicesPanel slug="demo-study" factorIndex={0} participants={participants} />
        );

        await waitFor(() => {
            const audioEls = document.querySelectorAll('audio');
            expect(audioEls).toHaveLength(3);
        });

        const audioEls = document.querySelectorAll('audio');
        const srcs = Array.from(audioEls).map((el) => el.getAttribute('src'));
        expect(srcs).toContain('https://cdn.example.com/rec100.webm');
        expect(srcs).toContain('https://cdn.example.com/rec101.webm');
        expect(srcs).toContain('https://cdn.example.com/rec102.webm');

        expect(screen.getByText('Carol')).toBeInTheDocument();
        expect(screen.getByText('Dave')).toBeInTheDocument();

        expect(screen.getAllByText('post_sort_q1')).toHaveLength(2);
        expect(screen.getByText('post_sort_q2')).toBeInTheDocument();
    });

    // ── Test 3: factor filtering — factor-1 participant NOT in factor-2 panel ─
    it('does NOT show a factor-1 participant in the factor-2 panel', async () => {
        const participants = [makeParticipant(20, 'Eve', [1]), makeParticipant(21, 'Frank', [2])];

        const recordingsForFactor2 = [
            makeRecording(200, 21, 'post_sort_q1', 'https://cdn.example.com/rec200.webm'),
        ];

        mockAudiosHook.mockReturnValue(dataOk(recordingsForFactor2));
        mockCommentsHook.mockReturnValue(emptyOk<ParticipantCardComment>());

        renderWithProviders(
            <FactorVoicesPanel slug="demo-study" factorIndex={1} participants={participants} />
        );

        await waitFor(() => {
            expect(screen.getByText('Frank')).toBeInTheDocument();
        });

        expect(screen.queryByText('Eve')).not.toBeInTheDocument();

        const audioEls = document.querySelectorAll('audio');
        expect(audioEls).toHaveLength(1);
    });

    // ── Test 4: loading state ─────────────────────────────────────────────────
    it('renders a loading indicator while either query is in flight', () => {
        mockAudiosHook.mockReturnValue({
            data: undefined,
            isLoading: true,
            isSuccess: false,
            isError: false,
        });
        mockCommentsHook.mockReturnValue(emptyOk<ParticipantCardComment>());

        renderWithProviders(
            <FactorVoicesPanel
                slug="demo-study"
                factorIndex={0}
                participants={[makeParticipant(1, 'Alice', [1])]}
            />
        );

        expect(screen.getByRole('status')).toBeInTheDocument();
        expect(screen.getByText(/Loading recordings/i)).toBeInTheDocument();
    });

    // ── Test 5: error state (audio query fails) ───────────────────────────────
    it('renders an error message when the audio query fails', () => {
        mockAudiosHook.mockReturnValue({
            data: undefined,
            isLoading: false,
            isSuccess: false,
            isError: true,
        });
        mockCommentsHook.mockReturnValue(emptyOk<ParticipantCardComment>());

        renderWithProviders(
            <FactorVoicesPanel
                slug="demo-study"
                factorIndex={0}
                participants={[makeParticipant(1, 'Alice', [1])]}
            />
        );

        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(screen.getByText(/Could not load audio recordings/i)).toBeInTheDocument();
    });

    // ── Test 6: card comments rendered with code, score badge, text, comment ──
    it('renders card comments per participant with code, score badge, statement text, and comment', async () => {
        const participants = [makeParticipant(30, 'Gina', [1])];

        const comments = [
            makeComment(30, 7, 'S7', 'Statement seven prose', 4, 'Strongly agree because X'),
            makeComment(30, 3, 'S3', 'Statement three prose', -3, 'Disagree because Y'),
        ];

        mockAudiosHook.mockReturnValue(emptyOk<ParticipantAudioRecording>());
        mockCommentsHook.mockReturnValue(dataOk(comments));

        renderWithProviders(
            <FactorVoicesPanel slug="demo-study" factorIndex={0} participants={participants} />
        );

        await waitFor(() => {
            expect(screen.getByText('Gina')).toBeInTheDocument();
        });

        // Statement codes shown
        expect(screen.getByText('S7')).toBeInTheDocument();
        expect(screen.getByText('S3')).toBeInTheDocument();

        // Score badges shown with sign
        expect(screen.getByText('+4')).toBeInTheDocument();
        expect(screen.getByText('-3')).toBeInTheDocument();

        // Statement texts shown
        expect(screen.getByText('Statement seven prose')).toBeInTheDocument();
        expect(screen.getByText('Statement three prose')).toBeInTheDocument();

        // Comments rendered as quoted prose
        expect(screen.getByText(/Strongly agree because X/)).toBeInTheDocument();
        expect(screen.getByText(/Disagree because Y/)).toBeInTheDocument();

        // Section header for comments
        expect(screen.getByText('Card comments')).toBeInTheDocument();
    });

    // ── Test 7: audio + comments together for the same participant ────────────
    it('renders audio AND comments together when both are present', async () => {
        const participants = [makeParticipant(40, 'Henri', [1])];

        const recordings = [
            makeRecording(400, 40, 'post_sort_overall', 'https://cdn.example.com/rec400.webm'),
        ];
        const comments = [makeComment(40, 5, 'S5', 'A statement', 4, 'My rationale')];

        mockAudiosHook.mockReturnValue(dataOk(recordings));
        mockCommentsHook.mockReturnValue(dataOk(comments));

        renderWithProviders(
            <FactorVoicesPanel slug="demo-study" factorIndex={0} participants={participants} />
        );

        await waitFor(() => {
            expect(screen.getByText('Henri')).toBeInTheDocument();
        });

        // One audio element
        expect(document.querySelectorAll('audio')).toHaveLength(1);

        // Comment block also rendered
        expect(screen.getByText('Card comments')).toBeInTheDocument();
        expect(screen.getByText(/My rationale/)).toBeInTheDocument();
    });

    // ── Test 8: participant with comments but no audio is still listed ────────
    it('lists a participant who has comments but no audio', async () => {
        const participants = [makeParticipant(50, 'Iris', [1]), makeParticipant(51, 'Jamal', [1])];

        // Iris has audio only, Jamal has comments only.
        const recordings = [
            makeRecording(500, 50, 'post_sort_q1', 'https://cdn.example.com/rec500.webm'),
        ];
        const comments = [makeComment(51, 9, 'S9', 'Some text', 2, 'Jamal comment')];

        mockAudiosHook.mockReturnValue(dataOk(recordings));
        mockCommentsHook.mockReturnValue(dataOk(comments));

        renderWithProviders(
            <FactorVoicesPanel slug="demo-study" factorIndex={0} participants={participants} />
        );

        await waitFor(() => {
            expect(screen.getByText('Iris')).toBeInTheDocument();
        });

        expect(screen.getByText('Jamal')).toBeInTheDocument();
        expect(screen.getByText(/Jamal comment/)).toBeInTheDocument();
    });
});
