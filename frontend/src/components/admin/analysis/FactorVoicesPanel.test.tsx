import { renderWithProviders, screen, waitFor } from '@/test-utils/test-utils';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { FactorVoicesPanel } from './FactorVoicesPanel';
import type { ParticipantLoading } from '@/api/model/participantLoading';
import type { ParticipantAudioRecording } from '@/api/model/participantAudioRecording';

// Hoisted mock for the audio API hook
const { mockAudiosHook } = vi.hoisted(() => ({
    mockAudiosHook: vi.fn(),
}));

vi.mock('@/api/generated', () => ({
    useListAudiosForParticipantsApiAdminStudiesSlugAnalysisAudiosGet: mockAudiosHook,
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

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('FactorVoicesPanel', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // ── Test 1: empty state when no participant on this factor has audio ──────
    it('renders empty state when none of the flagged participants have audio', () => {
        // P1 is flagged on factor 1; P2 on factor 2
        const participants = [makeParticipant(1, 'Alice', [1]), makeParticipant(2, 'Bob', [2])];

        // API returns no recordings for the factor-1 participants
        mockAudiosHook.mockReturnValue({
            data: [],
            isLoading: false,
            isSuccess: true,
            isError: false,
        });

        renderWithProviders(
            <FactorVoicesPanel slug="demo-study" factorIndex={0} participants={participants} />
        );

        expect(
            screen.getByText(
                /No post-sort audio recordings from participants flagged on this factor/i
            )
        ).toBeInTheDocument();
    });

    // ── Test 2: renders <audio> per recording when API returns recordings ─────
    it('renders an audio element per recording when the API returns recordings', async () => {
        const participants = [makeParticipant(10, 'Carol', [1]), makeParticipant(11, 'Dave', [1])];

        const recordings = [
            makeRecording(100, 10, 'post_sort_q1', 'https://cdn.example.com/rec100.webm'),
            makeRecording(101, 11, 'post_sort_q1', 'https://cdn.example.com/rec101.webm'),
            makeRecording(102, 11, 'post_sort_q2', 'https://cdn.example.com/rec102.webm'),
        ];

        mockAudiosHook.mockReturnValue({
            data: recordings,
            isLoading: false,
            isSuccess: true,
            isError: false,
        });

        renderWithProviders(
            <FactorVoicesPanel slug="demo-study" factorIndex={0} participants={participants} />
        );

        await waitFor(() => {
            const audioEls = document.querySelectorAll('audio');
            // Carol has 1 recording, Dave has 2 → 3 audio elements
            expect(audioEls).toHaveLength(3);
        });

        // Correct src URLs
        const audioEls = document.querySelectorAll('audio');
        const srcs = Array.from(audioEls).map((el) => el.getAttribute('src'));
        expect(srcs).toContain('https://cdn.example.com/rec100.webm');
        expect(srcs).toContain('https://cdn.example.com/rec101.webm');
        expect(srcs).toContain('https://cdn.example.com/rec102.webm');

        // Participant labels are displayed
        expect(screen.getByText('Carol')).toBeInTheDocument();
        expect(screen.getByText('Dave')).toBeInTheDocument();

        // Question keys shown as sub-labels
        expect(screen.getAllByText('post_sort_q1')).toHaveLength(2);
        expect(screen.getByText('post_sort_q2')).toBeInTheDocument();
    });

    // ── Test 3: factor filtering — factor-1 participant NOT in factor-2 panel ─
    it('does NOT show a factor-1 participant in the factor-2 panel', async () => {
        // Eve is flagged only on factor 1; Frank only on factor 2
        const participants = [makeParticipant(20, 'Eve', [1]), makeParticipant(21, 'Frank', [2])];

        const recordingsForFactor2 = [
            makeRecording(200, 21, 'post_sort_q1', 'https://cdn.example.com/rec200.webm'),
        ];

        mockAudiosHook.mockReturnValue({
            data: recordingsForFactor2,
            isLoading: false,
            isSuccess: true,
            isError: false,
        });

        // Render factorIndex=1 → factor 2
        renderWithProviders(
            <FactorVoicesPanel slug="demo-study" factorIndex={1} participants={participants} />
        );

        await waitFor(() => {
            // Frank should appear (flagged on factor 2)
            expect(screen.getByText('Frank')).toBeInTheDocument();
        });

        // Eve must NOT appear (only flagged on factor 1)
        expect(screen.queryByText('Eve')).not.toBeInTheDocument();

        // Exactly one audio element (Frank's recording)
        const audioEls = document.querySelectorAll('audio');
        expect(audioEls).toHaveLength(1);
    });

    // ── Test 4: loading state ─────────────────────────────────────────────────
    it('renders a loading indicator while the query is in flight', () => {
        mockAudiosHook.mockReturnValue({
            data: undefined,
            isLoading: true,
            isSuccess: false,
            isError: false,
        });

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

    // ── Test 5: error state ───────────────────────────────────────────────────
    it('renders an error message when the query fails', () => {
        mockAudiosHook.mockReturnValue({
            data: undefined,
            isLoading: false,
            isSuccess: false,
            isError: true,
        });

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
});
