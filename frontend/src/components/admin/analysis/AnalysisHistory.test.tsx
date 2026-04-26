import { renderWithProviders, screen, waitFor } from '@/test-utils/test-utils';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { AnalysisHistoryPanel } from './AnalysisHistoryPanel';
import type { AnalysisRunSummary, AnalysisResult } from '@/api/model';

// Mock sonner
vi.mock('sonner', () => ({
    toast: { success: vi.fn(), error: vi.fn() },
}));

// Hoisted mocks for generated API hooks + direct function call
const {
    mockListRunsHook,
    mockUpdateRunMutation,
    mockDeleteRunMutation,
    mockGetRunDirect,
    mockInvalidateQueries,
} = vi.hoisted(() => ({
    mockListRunsHook: vi.fn(),
    mockUpdateRunMutation: vi.fn(),
    mockDeleteRunMutation: vi.fn(),
    mockGetRunDirect: vi.fn(),
    mockInvalidateQueries: vi.fn(),
}));

vi.mock('@/api/generated', () => ({
    useListAnalysisRunsApiAdminStudiesSlugAnalysisRunsGet: mockListRunsHook,
    useUpdateAnalysisRunApiAdminStudiesSlugAnalysisRunsRunIdPatch: mockUpdateRunMutation,
    useDeleteAnalysisRunApiAdminStudiesSlugAnalysisRunsRunIdDelete: mockDeleteRunMutation,
    getAnalysisRunApiAdminStudiesSlugAnalysisRunsRunIdGet: mockGetRunDirect,
    getListAnalysisRunsApiAdminStudiesSlugAnalysisRunsGetQueryKey: vi.fn(() => [
        '/api/admin/studies/test-study/analysis/runs',
    ]),
}));

vi.mock('@tanstack/react-query', async () => {
    const actual =
        await vi.importActual<typeof import('@tanstack/react-query')>('@tanstack/react-query');
    return {
        ...actual,
        useQueryClient: () => ({
            invalidateQueries: mockInvalidateQueries,
        }),
    };
});

function makeRun(overrides: Partial<AnalysisRunSummary> = {}): AnalysisRunSummary {
    return {
        id: 1,
        ran_at: '2025-03-01T10:00:00Z',
        extraction_method: 'pca',
        n_factors: 3,
        rotation_method: 'varimax',
        flagging_mode: 'auto',
        ran_by_email: 'researcher@example.com',
        notes: undefined,
        ...overrides,
    };
}

const mockAnalysisResult: AnalysisResult = {
    n_participants: 3,
    n_statements: 4,
    n_factors: 3,
    extraction: 'pca',
    rotation: 'varimax',
    eigenvalues: [2.5, 1.2, 1.0],
    total_variance_explained: 75.0,
    loadings: [[0.8, 0.1, 0.0]],
    rotated_loadings: [[0.82, 0.08, 0.0]],
    flags: [[true, false, false]],
    participants: [{ db_id: 1, label: 'P001', loadings: [0.82, 0.08, 0.0], flagged_factors: [1] }],
    statement_scores: [
        {
            statement_id: 1,
            code: 'S1',
            text: 'Statement one',
            z_scores: [1.2, -0.5, 0.1],
            factor_arrays: [1, -1, 0],
        },
    ],
    distinguishing: [],
    consensus: [],
    factor_characteristics: [
        {
            factor: 1,
            eigenvalue: 2.5,
            variance_explained: 41.7,
            cumulative_variance: 41.7,
            n_flagged: 1,
            avg_rel_coef: 0.8,
            composite_reliability: 0.889,
            se_factor_scores: 0.333,
        },
    ],
    correlation_matrix: [[1.0]],
};

function setupDefaultMutationMocks() {
    mockUpdateRunMutation.mockReturnValue({
        mutate: vi.fn(),
        isPending: false,
    });
    mockDeleteRunMutation.mockReturnValue({
        mutate: vi.fn(),
        isPending: false,
    });
}

describe('AnalysisHistoryPanel', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        setupDefaultMutationMocks();
    });

    // ── Test 1: Empty list renders the empty state ──────────────────────────
    it('renders empty state when no runs exist', () => {
        mockListRunsHook.mockReturnValue({
            data: [],
            isLoading: false,
            isSuccess: true,
            isError: false,
        });

        renderWithProviders(
            <AnalysisHistoryPanel slug="test-study" currentRunId={null} onLoadRun={vi.fn()} />
        );

        expect(screen.getByText(/No previous analyses for this study yet/i)).toBeInTheDocument();
        expect(
            screen.getByText(/Documenting analytical choices supports reproducibility/i)
        ).toBeInTheDocument();
    });

    // ── Test 2: Click on a run calls getAnalysisRun and invokes onLoadRun ──
    it('clicking a run fetches the full run and calls onLoadRun', async () => {
        const run = makeRun({ id: 42, ran_at: '2025-03-01T10:00:00Z' });
        mockListRunsHook.mockReturnValue({
            data: [run],
            isLoading: false,
            isSuccess: true,
            isError: false,
        });

        mockGetRunDirect.mockResolvedValue({
            ...run,
            result: mockAnalysisResult,
        });

        const onLoadRun = vi.fn();

        renderWithProviders(
            <AnalysisHistoryPanel slug="test-study" currentRunId={null} onLoadRun={onLoadRun} />
        );

        // The row button loads the run (identified by its aria-label or text)
        const rowButton = screen.getByRole('button', { name: /Load analysis run from/i });
        await userEvent.click(rowButton);

        await waitFor(() => {
            expect(mockGetRunDirect).toHaveBeenCalledWith('test-study', 42);
            expect(onLoadRun).toHaveBeenCalledWith(mockAnalysisResult, run);
        });
    });

    // ── Test 3: Delete prompts confirmation, calls API on confirm ───────────
    it('delete button opens confirmation dialog and calls delete on confirm', async () => {
        const run = makeRun({ id: 7 });
        mockListRunsHook.mockReturnValue({
            data: [run],
            isLoading: false,
            isSuccess: true,
            isError: false,
        });

        const mockMutate = vi.fn((_args, callbacks) => {
            callbacks.onSuccess();
        });
        mockDeleteRunMutation.mockReturnValue({
            mutate: mockMutate,
            isPending: false,
        });

        const onLoadRun = vi.fn();

        renderWithProviders(
            <AnalysisHistoryPanel slug="test-study" currentRunId={null} onLoadRun={onLoadRun} />
        );

        // Click the trash icon
        const deleteButton = screen.getByRole('button', {
            name: /Delete this analysis run/i,
        });
        await userEvent.click(deleteButton);

        // Confirmation dialog should appear
        expect(screen.getByText(/Deleting an analysis run removes evidence/i)).toBeInTheDocument();

        // Click the confirm (destructive) button
        const confirmButton = screen.getByRole('button', { name: /^Delete$/ });
        await userEvent.click(confirmButton);

        await waitFor(() => {
            expect(mockMutate).toHaveBeenCalledWith(
                { slug: 'test-study', runId: 7 },
                expect.any(Object)
            );
        });
    });

    // ── Test 4: Shows list of runs with correct metadata ───────────────────
    it('renders run metadata including extraction method, n_factors, rotation', () => {
        const run = makeRun({
            id: 1,
            extraction_method: 'centroid',
            n_factors: 5,
            rotation_method: 'none',
            flagging_mode: 'manual',
        });
        mockListRunsHook.mockReturnValue({
            data: [run],
            isLoading: false,
            isSuccess: true,
            isError: false,
        });

        renderWithProviders(
            <AnalysisHistoryPanel slug="test-study" currentRunId={null} onLoadRun={vi.fn()} />
        );

        expect(screen.getByText('CENTROID')).toBeInTheDocument();
        expect(screen.getByText('5F')).toBeInTheDocument();
        expect(screen.getByText('none')).toBeInTheDocument();
        expect(screen.getByText('manual')).toBeInTheDocument();
    });

    // ── Test 5: Current tag shown when currentRunId matches a run ──────────
    it('shows "current" tag on the run matching currentRunId', () => {
        const run = makeRun({ id: 99 });
        mockListRunsHook.mockReturnValue({
            data: [run],
            isLoading: false,
            isSuccess: true,
            isError: false,
        });

        renderWithProviders(
            <AnalysisHistoryPanel slug="test-study" currentRunId={99} onLoadRun={vi.fn()} />
        );

        expect(screen.getByText('current')).toBeInTheDocument();
    });
});
